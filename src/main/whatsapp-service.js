'use strict';

const { createWhatsAppApi } = require('./messaging');
const { createWhatsAppWebhookServer } = require('./whatsapp-webhook');

function parseWhatsAppSenders(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 100) {
    throw new TypeError('Provide 1 to 100 authorized WhatsApp phone numbers');
  }
  const senders = values.map((value) => {
    if (typeof value !== 'string') throw new TypeError('Authorized WhatsApp phone numbers must be text');
    const number = value.trim().replace(/[\s()+-]/g, '');
    if (!/^\d{8,15}$/.test(number)) throw new TypeError('Enter authorized phone numbers in international format');
    return number;
  });
  return [...new Set(senders)];
}

function createWhatsAppService({
  getSettings,
  decryptSecret,
  onCommand,
  onStatus = () => {},
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  if (typeof getSettings !== 'function' || typeof decryptSecret !== 'function' || typeof onCommand !== 'function') {
    throw new TypeError('WhatsApp service callbacks are required');
  }

  let webhook = null;
  let startTask = null;
  let generation = 0;
  let state = 'disconnected';
  let sendApi = null;
  const recentSenders = new Map();

  function report(nextState) {
    state = nextState;
    onStatus(state);
  }

  async function start() {
    if (webhook?.listening) return { ok: true, address: '127.0.0.1' };
    if (startTask) return startTask;
    const settings = getSettings();
    const whatsapp = settings?.whatsapp || {};
    if (whatsapp.enabled !== true) return { ok: false, error: 'WhatsApp is disabled' };
    if (![whatsapp.encryptedAccessToken, whatsapp.encryptedAppSecret, whatsapp.encryptedVerifyToken]
      .every((value) => typeof value === 'string' && value.startsWith('enc:'))) {
      return { ok: false, error: 'Encrypted WhatsApp credentials are required' };
    }
    const accessToken = decryptSecret(whatsapp.encryptedAccessToken);
    const appSecret = decryptSecret(whatsapp.encryptedAppSecret);
    const verifyToken = decryptSecret(whatsapp.encryptedVerifyToken);
    if (![accessToken, appSecret, verifyToken].every((value) => typeof value === 'string' && value.trim())) {
      return { ok: false, error: 'WhatsApp secrets could not be decrypted' };
    }

    const api = createWhatsAppApi({
      accessToken,
      phoneNumberId: whatsapp.phoneNumberId,
      graphVersion: whatsapp.graphVersion,
      fetchImpl,
    });
    const activeApi = api;
    sendApi = activeApi;
    const nextWebhook = createWhatsAppWebhookServer({
      port: whatsapp.port,
      host: '127.0.0.1',
      verifyToken,
      appSecret,
      authorizedSenders: whatsapp.authorizedSenders,
      onCommand: async (event, reply) => {
        recentSenders.set(event.sender, now());
        await onCommand(event, reply);
      },
      sendReply: (recipient, text) => activeApi.sendText(recipient, text),
    });
    const startupGeneration = generation;
    report('starting');
    startTask = (async () => {
      try {
        const address = await nextWebhook.listen();
        if (startupGeneration !== generation || whatsapp.enabled !== true) {
          await nextWebhook.close();
          return { ok: false, error: 'WhatsApp startup was cancelled' };
        }
        webhook = nextWebhook;
        report('listening');
        return { ok: true, address: `${address.address}:${address.port}` };
      } catch (error) {
        await nextWebhook.close().catch(() => {});
        if (startupGeneration === generation) report('error');
        throw error;
      } finally {
        startTask = null;
      }
    })();
    return startTask;
  }

  async function stop() {
    generation += 1;
    const current = webhook;
    webhook = null;
    sendApi = null;
    recentSenders.clear();
    await current?.close();
    report('disconnected');
    return { ok: true };
  }

  async function sendNotification(text) {
    if (!webhook?.listening || !sendApi) return { sent: false };
    const timestamp = now();
    const recipient = [...recentSenders.entries()]
      .filter(([, lastMessageAt]) => timestamp - lastMessageAt >= 0 && timestamp - lastMessageAt < 24 * 60 * 60 * 1000)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!recipient) return { sent: false };
    await sendApi.sendText(recipient, text);
    return { sent: true };
  }

  return {
    start,
    stop,
    sendNotification,
    get state() { return state; },
    get listening() { return webhook?.listening === true; },
  };
}

module.exports = { createWhatsAppService, parseWhatsAppSenders };
