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
  assert.equal(socket.sent[0].op, 2);
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
