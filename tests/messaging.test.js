'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const {
  authorizeCommand,
  createDiscordApi,
  createDiscordGateway,
  createWhatsAppApi,
  extractWhatsAppMessages,
  isAuthorized,
  isQuietTime,
  normalizeIds,
  notificationDecision,
  parseCommand,
  verifyWhatsAppSignature,
} = require('../src/main/messaging');
const { createDiscordService, parseDiscordIds } = require('../src/main/discord-service');
const { createMessagingCommandHandler } = require('../src/main/messaging-commands');

test('Discord setup requires valid numeric allowlists', () => {
  assert.deepEqual(parseDiscordIds('1234567890, 2234567890', 'users'), ['1234567890', '2234567890']);
  assert.throws(() => parseDiscordIds('', 'users'), /comma-separated/);
  assert.throws(() => parseDiscordIds('1234567890, nope', 'users'), /comma-separated/);
});

test('shared messaging commands pause privacy-sensitive observation and limit replies', async () => {
  let timestamp = 100000;
  const state = {
    learningEnabled: true,
    activityLearning: true,
    watchScreen: true,
    memories: ['private note'],
    learningEntries: [{ text: 'private learning entry' }],
    messaging: { maxPerHour: 10, commandHistory: [] },
  };
  const updates = [];
  const handler = createMessagingCommandHandler({
    getConfig: () => state,
    updateConfig: (patch) => {
      updates.push(patch);
      Object.assign(state, patch);
    },
    now: () => timestamp,
  });
  const replies = [];
  const reply = async (text) => replies.push(text);

  await handler({ command: 'pause' }, reply);
  assert.equal(state.learningEnabled, false);
  assert.equal(state.activityLearning, false);
  assert.equal(state.watchScreen, false);
  timestamp += 16000;
  await handler({ command: 'resume' }, reply);
  assert.equal(state.learningEnabled, true);
  assert.equal(state.activityLearning, false);
  assert.equal(state.watchScreen, false);
  timestamp += 16000;
  await handler({ command: 'memory' }, reply);
  assert.match(replies.at(-1), /1 manual notes and 1 reviewed learning entries/);
  assert.equal(replies.at(-1).includes('private note'), false);
  assert.equal(replies.at(-1).includes('private learning entry'), false);
  timestamp += 16000;
  await handler({ platform: 'discord', command: 'status' }, reply);
  assert.equal(replies.length, 4);
  assert.equal(updates.some((patch) => patch.messaging?.commandHistory?.length), true);

  timestamp += 16000;
  await handler({ platform: 'whatsapp', command: 'status' }, reply);
  assert.equal(replies.length, 5);
  assert.match(replies.at(-1), /Capri is running/);
  await handler({ platform: 'whatsapp', command: 'status' }, reply);
  assert.equal(replies.length, 5);
});

test('Discord service connects with encrypted settings, replies to authorized commands, and disconnects', async () => {
  const sockets = [];
  const requests = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.listeners = new Map();
      this.sent = [];
      sockets.push(this);
    }

    addEventListener(name, callback) {
      this.listeners.set(name, callback);
    }

    send(value) {
      this.sent.push(JSON.parse(value));
    }

    close() {
      this.readyState = 3;
      this.listeners.get('close')?.();
    }

    emit(payload) {
      this.listeners.get('message')?.({ data: JSON.stringify(payload) });
    }
  }
  const service = createDiscordService({
    getSettings: () => ({
      enabled: true,
      discord: {
        encryptedToken: 'enc:protected',
        authorizedUsers: ['123456789012345678'],
        authorizedChannels: ['223456789012345678'],
      },
    }),
    decryptToken: (stored) => stored === 'enc:protected' ? 'test-token' : '',
    onCommand: async ({ command }, reply) => reply(`Received ${command}`),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return url.endsWith('/gateway/bot')
        ? { ok: true, json: async () => ({ url: 'wss://gateway.discord.gg' }) }
        : { ok: true, json: async () => ({ id: 'reply-id' }) };
    },
    WebSocketImpl: FakeWebSocket,
  });

  assert.deepEqual(await service.start(), { ok: true, connected: false });
  sockets[0].emit({ op: 10, d: { heartbeat_interval: 30000 } });
  sockets[0].emit({ op: 0, t: 'READY', d: {} });
  assert.equal(service.connected, true);
  sockets[0].emit({
    op: 0,
    t: 'MESSAGE_CREATE',
    d: { content: '/capri status', author: { id: '123456789012345678' }, channel_id: '223456789012345678' },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.some(({ url }) => url.endsWith('/channels/223456789012345678/messages')), true);
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
    content: 'Received status',
    allowed_mentions: { parse: [] },
  });
  service.stop();
  assert.equal(service.connected, false);
});

test('Discord service reconnects after transient loss but stops retrying after manual disconnect', async () => {
  const sockets = [];
  const timers = [];
  class FakeWebSocket {
    constructor() {
      this.readyState = 1;
      this.listeners = new Map();
      sockets.push(this);
    }

    addEventListener(name, callback) { this.listeners.set(name, callback); }
    send() {}
    close(code = 1000) {
      this.readyState = 3;
      this.listeners.get('close')?.({ code, reason: '' });
    }
    emit(payload) { this.listeners.get('message')?.({ data: JSON.stringify(payload) }); }
  }
  const service = createDiscordService({
    getSettings: () => ({
      enabled: true,
      discord: { encryptedToken: 'enc:token', authorizedUsers: ['1234567890'], authorizedChannels: ['2234567890'] },
    }),
    decryptToken: () => 'test-token',
    onCommand: async () => {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ url: 'wss://gateway.discord.gg' }) }),
    WebSocketImpl: FakeWebSocket,
    setTimeoutImpl: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutImpl: (timer) => { if (timer) timer.cleared = true; },
    baseReconnectMs: 100,
  });

  await service.start();
  sockets[0].emit({ op: 10, d: { heartbeat_interval: 30000 } });
  sockets[0].emit({ op: 0, t: 'READY', d: {} });
  sockets[0].close(1006);
  assert.equal(service.state, 'reconnecting');
  assert.equal(timers[0].delay, 100);
  timers[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sockets.length, 2);

  service.stop();
  sockets[1].close(1006);
  assert.equal(service.state, 'disconnected');
  assert.equal(timers.length, 1);
});

test('Discord service does not leave a connection behind when stopped during Gateway lookup', async () => {
  let releaseLookup;
  const sockets = [];
  class FakeWebSocket {
    constructor() {
      this.readyState = 1;
      this.listeners = new Map();
      sockets.push(this);
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    close(code = 1000) {
      this.readyState = 3;
      this.listeners.get('close')?.({ code, reason: '' });
    }
    send() {}
  }
  const service = createDiscordService({
    getSettings: () => ({
      enabled: true,
      discord: { encryptedToken: 'enc:token', authorizedUsers: ['1234567890'], authorizedChannels: ['2234567890'] },
    }),
    decryptToken: () => 'test-token',
    onCommand: async () => {},
    fetchImpl: () => new Promise((resolve) => { releaseLookup = resolve; }),
    WebSocketImpl: FakeWebSocket,
  });
  const starting = service.start();
  service.stop();
  releaseLookup({ ok: true, json: async () => ({ url: 'wss://gateway.discord.gg' }) });
  assert.deepEqual(await starting, { ok: false, error: 'Discord connection was cancelled' });
  assert.equal(service.connected, false);
  assert.equal(service.state, 'disconnected');
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].readyState, 3);
});

test('Discord service does not retry rejected credentials', async () => {
  const timers = [];
  const service = createDiscordService({
    getSettings: () => ({
      enabled: true,
      discord: { encryptedToken: 'enc:token', authorizedUsers: ['1234567890'], authorizedChannels: ['2234567890'] },
    }),
    decryptToken: () => 'invalid-token',
    onCommand: async () => {},
    fetchImpl: async () => ({ status: 401, ok: false, json: async () => ({}) }),
    WebSocketImpl: class {},
    setTimeoutImpl: (callback) => {
      timers.push(callback);
      return callback;
    },
    clearTimeoutImpl: () => {},
  });
  await assert.rejects(service.start(), /credentials were rejected/);
  assert.equal(service.state, 'fatal');
  assert.equal(timers.length, 0);
});

test('commands are explicit and limited to the supported Capri command set', () => {
  assert.equal(parseCommand('/capri status'), 'status');
  assert.equal(parseCommand('!CAPRI pause'), 'pause');
  assert.equal(parseCommand('/capri update'), 'update');
  assert.equal(parseCommand('/capri update --force'), null);
  assert.equal(parseCommand('/capri run rm -rf'), null);
  assert.equal(parseCommand('status'), null);
  assert.equal(parseCommand('/capri'), null);
});

test('sender IDs are normalized, bounded, and exact-match authorized', () => {
  assert.deepEqual(normalizeIds(['123456789012345678', '123456789012345678', 'invalid', ' 1234567890 ']), [
    '123456789012345678',
    '1234567890',
  ]);
  assert.equal(isAuthorized('123456789012345678', ['123456789012345678']), true);
  assert.equal(isAuthorized('123456789012345679', ['123456789012345678']), false);
  assert.equal(isAuthorized('1234567890', ['123456789012345678']), false);
  assert.equal(authorizeCommand({
    text: '/capri status',
    sender: '123456789012345678',
    channelId: '223456789012345678',
    authorizedUsers: ['123456789012345678'],
    authorizedChannels: ['223456789012345678'],
  }), 'status');
  assert.equal(authorizeCommand({
    text: '/capri status',
    sender: '123456789012345678',
    channelId: '323456789012345678',
    authorizedUsers: ['123456789012345678'],
    authorizedChannels: ['223456789012345678'],
  }), null);
  assert.equal(authorizeCommand({
    text: '/capri status',
    sender: '123456789012345678',
    channelId: '223456789012345678',
    authorizedUsers: ['123456789012345678'],
    authorizedChannels: [],
    requireChannel: true,
  }), null);
});

test('quiet hours support daytime and overnight ranges and reject malformed times', () => {
  assert.equal(isQuietTime(new Date(2026, 0, 1, 23, 0), { enabled: true, start: '22:00', end: '07:00' }), true);
  assert.equal(isQuietTime(new Date(2026, 0, 1, 6, 59), { enabled: true, start: '22:00', end: '07:00' }), true);
  assert.equal(isQuietTime(new Date(2026, 0, 1, 7, 0), { enabled: true, start: '22:00', end: '07:00' }), false);
  assert.equal(isQuietTime(new Date(2026, 0, 1, 13, 30), { enabled: true, start: '12:00', end: '14:00' }), true);
  assert.equal(isQuietTime(new Date(2026, 0, 1, 13, 30), { enabled: true, start: 'bad', end: '14:00' }), false);
  assert.equal(isQuietTime(new Date(2026, 0, 1, 23, 0), { enabled: false, start: '22:00', end: '07:00' }), false);
});

test('notifications require opt-in and enforce quiet hours, hourly limits, and duplicate suppression', () => {
  const now = new Date(2026, 0, 1, 12, 0).getTime();
  assert.equal(notificationDecision({ now, preferences: {} }), 'disabled');
  assert.equal(notificationDecision({
    now,
    preferences: { enabled: true, notificationsEnabled: true, quietHours: { enabled: true, start: '11:00', end: '13:00' } },
  }), 'quiet-hours');
  const preferences = { enabled: true, notificationsEnabled: true, maxPerHour: 2, duplicateWindowMs: 60000 };
  assert.equal(notificationDecision({ now, preferences, history: [{ at: now - 1000, key: 'same' }], key: 'same' }), 'duplicate');
  assert.equal(notificationDecision({ now, preferences, history: [{ at: now - 1000, key: 'one' }, { at: now - 2000, key: 'two' }] }), 'rate-limited');
  assert.equal(notificationDecision({ now, preferences, history: [{ at: now + 1000, key: 'future' }] }), 'allowed');
  assert.equal(notificationDecision({ now, preferences }), 'allowed');
});

test('WhatsApp webhook signatures are verified against the exact raw body', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = 'test-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifyWhatsAppSignature(body, signature, secret), true);
  assert.equal(verifyWhatsAppSignature(Buffer.from(`${body} `), signature, secret), false);
  assert.equal(verifyWhatsAppSignature(body, 'sha256=bad', secret), false);
  assert.equal(verifyWhatsAppSignature(body, signature, ''), false);
  assert.equal(verifyWhatsAppSignature(body.toString(), signature, secret), false);
});

test('Discord sends only to its official API and suppresses allowed mentions', async () => {
  const calls = [];
  const discord = createDiscordApi({
    token: 'test-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ id: 'message-id' }) };
    },
  });
  assert.deepEqual(await discord.sendMessage('123456789012345678', '@everyone status'), { id: 'message-id' });
  assert.equal(calls[0].url, 'https://discord.com/api/v10/channels/123456789012345678/messages');
  assert.equal(calls[0].options.headers.authorization, 'Bot test-token');
  assert.deepEqual(JSON.parse(calls[0].options.body).allowed_mentions, { parse: [] });
  await assert.rejects(discord.sendMessage('bad', 'hello'), /channel ID/);
  await assert.rejects(discord.sendMessage('123456789012345678', 'x'.repeat(2001)), /2000/);
});

test('WhatsApp Cloud API sends through Graph API and validates recipients and message size', async () => {
  const calls = [];
  const whatsapp = createWhatsAppApi({
    accessToken: 'test-token',
    phoneNumberId: '123456789012345',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) };
    },
  });
  assert.deepEqual(await whatsapp.sendText('+1 (234) 567-8901', 'Hello'), { id: 'wamid.1' });
  assert.equal(calls[0].url, 'https://graph.facebook.com/v23.0/123456789012345/messages');
  assert.equal(calls[0].options.headers.authorization, 'Bearer test-token');
  assert.equal(JSON.parse(calls[0].options.body).to, '12345678901');
  await assert.rejects(whatsapp.sendText('not-a-phone', 'hello'), /recipient/);
  await assert.rejects(whatsapp.sendText('1234567890', 'x'.repeat(4097)), /4096/);
});

test('WhatsApp webhook parser extracts only text messages with valid sender numbers', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [
      { from: '1234567890', type: 'text', text: { body: '/capri status' } },
      { from: '1234567890', type: 'image', image: {} },
      { from: 'bad-number', type: 'text', text: { body: '/capri status' } },
    ] } }] }],
  };
  assert.deepEqual(extractWhatsAppMessages(payload), [{ from: '1234567890', text: '/capri status' }]);
  assert.deepEqual(extractWhatsAppMessages({ object: 'other', entry: payload.entry }), []);
});

test('Discord gateway dispatches only allowlisted, supported commands and disconnects cleanly', async () => {
  const sockets = [];
  const commands = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.listeners = new Map();
      this.sent = [];
      sockets.push(this);
    }

    addEventListener(name, callback) {
      this.listeners.set(name, callback);
    }

    send(value) {
      this.sent.push(JSON.parse(value));
    }

    close() {
      this.readyState = 3;
      this.listeners.get('close')?.();
    }

    emit(data) {
      this.listeners.get('message')?.({ data: JSON.stringify(data) });
    }
  }
  const gateway = createDiscordGateway({
    token: 'test-token',
    authorizedUsers: ['123456789012345678'],
    authorizedChannels: ['223456789012345678'],
    WebSocketImpl: FakeWebSocket,
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
    onCommand: async (payload) => commands.push(payload),
    fetchImpl: async (url) => {
      assert.equal(url, 'https://discord.com/api/v10/gateway/bot');
      return { ok: true, json: async () => ({ url: 'wss://gateway.discord.gg' }) };
    },
  });
  assert.deepEqual(await gateway.connect(), { ok: true, connected: false });
  const socket = sockets[0];
  assert.match(socket.url, /^wss:\/\/gateway\.discord\.gg\/\?v=10&encoding=json$/);
  socket.emit({ op: 10, d: { heartbeat_interval: 45000 } });
  assert.equal(socket.sent[0].op, 1);
  assert.equal(socket.sent[1].op, 2);
  socket.emit({ op: 0, t: 'READY', d: {} });
  socket.emit({
    op: 0,
    t: 'MESSAGE_CREATE',
    d: { content: '/capri report', channel_id: '223456789012345678', author: { id: '123456789012345678', bot: false } },
  });
  socket.emit({
    op: 0,
    t: 'MESSAGE_CREATE',
    d: { content: '/capri report', channel_id: '223456789012345678', author: { id: '323456789012345678', bot: false } },
  });
  socket.emit({
    op: 0,
    t: 'MESSAGE_CREATE',
    d: { content: '/capri report', channel_id: '223456789012345678', author: { id: '123456789012345678', bot: true } },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gateway.connected, true);
  assert.deepEqual(commands.map(({ command }) => command), ['report']);
  assert.equal(gateway.disconnect().ok, true);
  assert.equal(gateway.connected, false);
});
