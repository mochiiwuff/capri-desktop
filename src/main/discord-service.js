'use strict';

const { createDiscordApi, createDiscordGateway, normalizeIds } = require('./messaging');

function parseDiscordIds(value, label) {
  const entries = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!entries.length || entries.some((item) => !/^\d{5,24}$/.test(item))) {
    throw new TypeError(`${label} must be a comma-separated list of Discord IDs`);
  }
  const ids = normalizeIds(entries);
  if (ids.length !== new Set(entries).size) throw new TypeError(`${label} contains too many IDs`);
  return ids;
}

function createDiscordService({
  getSettings,
  decryptToken,
  onCommand,
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  onStatus = () => {},
} = {}) {
  if (typeof getSettings !== 'function' || typeof decryptToken !== 'function' || typeof onCommand !== 'function') {
    throw new TypeError('Discord service callbacks are required');
  }

  let gateway = null;
  let api = null;

  async function start() {
    const settings = getSettings();
    if (settings?.enabled !== true) return { ok: false, error: 'Discord is disabled' };
    const discord = settings.discord || {};
    if (typeof discord.encryptedToken !== 'string' || !discord.encryptedToken.startsWith('enc:')) {
      return { ok: false, error: 'An encrypted Discord bot token is required' };
    }
    const token = decryptToken(discord.encryptedToken);
    if (typeof token !== 'string' || !token.trim()) return { ok: false, error: 'Discord bot token could not be decrypted' };
    const authorizedUsers = normalizeIds(discord.authorizedUsers);
    const authorizedChannels = normalizeIds(discord.authorizedChannels);
    if (!authorizedUsers.length || !authorizedChannels.length) {
      return { ok: false, error: 'Authorized Discord users and channels are required' };
    }
    if (gateway) return { ok: true, connected: gateway.connected };

    const nextApi = createDiscordApi({ token, fetchImpl });
    const nextGateway = createDiscordGateway({
      token,
      authorizedUsers,
      authorizedChannels,
      fetchImpl,
      WebSocketImpl,
      onStatus,
      onCommand: async (event) => {
        await onCommand(event, (text) => nextApi.sendMessage(event.channelId, text));
      },
    });
    try {
      const result = await nextGateway.connect();
      api = nextApi;
      gateway = nextGateway;
      return result;
    } catch (error) {
      nextGateway.disconnect();
      throw error;
    }
  }

  function stop() {
    gateway?.disconnect();
    gateway = null;
    api = null;
    return { ok: true };
  }

  return {
    start,
    stop,
    get connected() { return gateway?.connected === true; },
  };
}

module.exports = { createDiscordService, parseDiscordIds };
