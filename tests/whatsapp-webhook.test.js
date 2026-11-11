'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createWhatsAppWebhookServer } = require('../src/main/whatsapp-webhook');
const { createWhatsAppService, parseWhatsAppSenders } = require('../src/main/whatsapp-service');

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

function sign(body) {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;
}

async function listenWebhook(options) {
  const server = createWhatsAppWebhookServer({ ...options, port: 0 });
  const address = await server.listen();
  return { server, baseUrl: `http://127.0.0.1:${address.port}/webhook` };
}

test('WhatsApp webhook verifies Meta challenge using the configured token', async (t) => {
  const { server, baseUrl } = await listenWebhook({
    verifyToken: VERIFY_TOKEN,
    appSecret: APP_SECRET,
    authorizedSenders: ['1234567890'],
    onCommand: async () => {},
    sendReply: async () => {},
  });
  t.after(() => server.close());

  const accepted = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-123`);
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), 'challenge-123');
  const rejected = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123`);
  assert.equal(rejected.status, 403);
});

test('WhatsApp webhook authenticates raw payloads and dispatches only allowlisted commands', async (t) => {
  const commands = [];
  const replies = [];
  let commandProcessed;
  const processed = new Promise((resolve) => { commandProcessed = resolve; });
  const { server, baseUrl } = await listenWebhook({
    verifyToken: VERIFY_TOKEN,
    appSecret: APP_SECRET,
    authorizedSenders: ['1234567890'],
    onCommand: async (event, reply) => {
      commands.push(event);
      await reply('Capri is ready');
      commandProcessed();
    },
    sendReply: async (recipient, text) => replies.push({ recipient, text }),
  });
  t.after(() => server.close());

  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [
      { from: '1234567890', type: 'text', text: { body: '/capri status' } },
      { from: '9999999999', type: 'text', text: { body: '/capri pause' } },
    ] } }] }],
  });
  const unsigned = await fetch(baseUrl, { method: 'POST', body: payload });
  assert.equal(unsigned.status, 401);
  assert.deepEqual(commands, []);

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'x-hub-signature-256': sign(payload), 'content-type': 'application/json' },
    body: payload,
  });
  assert.equal(response.status, 200);
  await processed;
  assert.deepEqual(commands, [{ platform: 'whatsapp', command: 'status', sender: '1234567890' }]);
  assert.deepEqual(replies, [{ recipient: '1234567890', text: 'Capri is ready' }]);
});

test('WhatsApp webhook rejects malformed JSON, oversized bodies, and non-loopback binds', async (t) => {
  const { server, baseUrl } = await listenWebhook({
    verifyToken: VERIFY_TOKEN,
    appSecret: APP_SECRET,
    authorizedSenders: ['1234567890'],
    onCommand: async () => {},
    sendReply: async () => {},
  });
  t.after(() => server.close());

  const malformed = '{not-json';
  const invalid = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'x-hub-signature-256': sign(malformed) },
    body: malformed,
  });
  assert.equal(invalid.status, 400);

  const oversized = 'x'.repeat(256 * 1024 + 1);
  const tooLarge = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'x-hub-signature-256': sign(oversized) },
    body: oversized,
  });
  assert.equal(tooLarge.status, 413);
  assert.throws(() => createWhatsAppWebhookServer({
    host: '0.0.0.0',
    verifyToken: VERIFY_TOKEN,
    appSecret: APP_SECRET,
    authorizedSenders: ['1234567890'],
    onCommand: async () => {},
    sendReply: async () => {},
  }), /loopback/);
});

test('WhatsApp service requires encrypted credentials and can be stopped cleanly', async () => {
  let enabled = true;
  let state = null;
  const service = createWhatsAppService({
    getSettings: () => ({
      whatsapp: {
        enabled,
        encryptedAccessToken: 'enc:access',
        encryptedAppSecret: `enc:${APP_SECRET}`,
        encryptedVerifyToken: 'enc:verify-token',
        phoneNumberId: '123456789012345',
        authorizedSenders: ['1234567890'],
        port: 0,
      },
    }),
    decryptSecret: (value) => value.slice(4),
    onCommand: async () => {},
    onStatus: (next) => { state = next; },
    fetchImpl: async (url, options) => {
      assert.match(url, /^https:\/\/graph\.facebook\.com\/v23\.0\/123456789012345\/messages$/);
      assert.equal(options.headers.authorization, 'Bearer access');
      return { ok: true, json: async () => ({}) };
    },
  });

  const started = await service.start();
  assert.equal(started.ok, true);
  assert.equal(service.listening, true);
  assert.equal(state, 'listening');
  await service.stop();
  assert.equal(service.listening, false);
  assert.equal(state, 'disconnected');
  enabled = false;
  assert.deepEqual(await service.start(), { ok: false, error: 'WhatsApp is disabled' });
});

test('WhatsApp notifications only reach an authorized sender within the 24-hour service window', async (t) => {
  const outbound = [];
  let timestamp = Date.now();
  const service = createWhatsAppService({
    getSettings: () => ({
      whatsapp: {
        enabled: true,
        encryptedAccessToken: 'enc:access',
        encryptedAppSecret: `enc:${APP_SECRET}`,
        encryptedVerifyToken: 'enc:verify-token',
        phoneNumberId: '123456789012345',
        authorizedSenders: ['1234567890'],
        port: 0,
      },
    }),
    decryptSecret: (value) => value.slice(4),
    onCommand: async () => {},
    now: () => timestamp,
    fetchImpl: async (url, options) => {
      outbound.push({ url, options });
      return { ok: true, json: async () => ({ messages: [{ id: 'outbound-id' }] }) };
    },
  });
  t.after(() => service.stop());

  const started = await service.start();
  assert.equal(started.ok, true);
  const body = Buffer.from(JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{
      type: 'text', text: { body: '/capri status' }, from: '1234567890',
    }] } }] }],
  }));
  const response = await fetch(`http://${started.address}/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
    body,
  });
  assert.equal(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(await service.sendNotification('The task is complete.'), { sent: true });
  assert.deepEqual(JSON.parse(outbound[0].options.body), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '1234567890',
    type: 'text',
    text: { preview_url: false, body: 'The task is complete.' },
  });

  timestamp += 24 * 60 * 60 * 1000;
  assert.deepEqual(await service.sendNotification('Expired window'), { sent: false });
  assert.equal(outbound.length, 1);
});

test('WhatsApp authorized sender input is strictly validated and normalized', () => {
  assert.deepEqual(parseWhatsAppSenders(['+1 (234) 567-8901', '1234567890']), ['12345678901', '1234567890']);
  assert.throws(() => parseWhatsAppSenders(['+1 234 567 8901', 'not-a-number']), /international format/);
  assert.throws(() => parseWhatsAppSenders([]), /1 to 100/);
});
