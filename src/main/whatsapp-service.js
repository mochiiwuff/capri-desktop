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
} = {}) {
  if (typeof getSettings !== 'function' || typeof decryptSecret !== 'function' || typeof onCommand !== 'function') {
    throw new TypeError('WhatsApp service callbacks are required');
  }

  let webhook = null;
  let startTask = null;
  let generation = 0;
  let state = 'disconnected';

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
    const nextWebhook = createWhatsAppWebhookServer({
      port: whatsapp.port,
      host: '127.0.0.1',
      verifyToken,
      appSecret,
      authorizedSenders: whatsapp.authorizedSenders,
      onCommand,
      sendReply: (recipient, text) => api.sendText(recipient, text),
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
    await current?.close();
    report('disconnected');
    return { ok: true };
  }

  return {
    start,
    stop,
    get state() { return state; },
    get listening() { return webhook?.listening === true; },
  };
}

module.exports = { createWhatsAppService, parseWhatsAppSenders };
