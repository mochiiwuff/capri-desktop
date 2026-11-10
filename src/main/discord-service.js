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
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  baseReconnectMs = 1000,
  maxReconnectMs = 60000,
} = {}) {
  if (typeof getSettings !== 'function' || typeof decryptToken !== 'function' || typeof onCommand !== 'function') {
    throw new TypeError('Discord service callbacks are required');
  }

  let gateway = null;
  let reconnectTimer = null;
  let connectTask = null;
  let connectTaskGeneration = -1;
  let wanted = false;
  let generation = 0;
  let state = 'disconnected';
  let attempts = 0;
  let api = null;
  let notificationChannelId = null;

  function report(nextState) {
    state = nextState;
    onStatus(state, { attempts });
  }

  function scheduleReconnect() {
    if (!wanted || reconnectTimer || !getSettings()?.enabled) return;
    const delay = Math.min(maxReconnectMs, baseReconnectMs * (2 ** Math.min(attempts, 10)));
    attempts += 1;
    report('reconnecting');
    reconnectTimer = setTimeoutImpl(() => {
      reconnectTimer = null;
      connectAttempt().catch((error) => {
        console.error('[capri] Discord reconnect failed:', error.message);
      });
    }, delay);
    reconnectTimer?.unref?.();
  }

  async function connectAttempt() {
    if (!wanted || !getSettings()?.enabled) return { ok: false, error: 'Discord is disabled' };
    if (connectTask) {
      if (connectTaskGeneration === generation) return connectTask;
      await connectTask.catch(() => {});
      return connectAttempt();
    }
    const attemptGeneration = generation;
    connectTaskGeneration = attemptGeneration;
    connectTask = (async () => {
      gateway?.disconnect();
      gateway = null;
      const settings = getSettings();
      const discord = settings.discord || {};
      const token = decryptToken(discord.encryptedToken);
      const authorizedUsers = normalizeIds(discord.authorizedUsers);
      const authorizedChannels = normalizeIds(discord.authorizedChannels);
      if (!token || !authorizedUsers.length || !authorizedChannels.length) {
        report('configuration-error');
        return { ok: false, error: 'Discord configuration is incomplete' };
      }

      const nextApi = createDiscordApi({ token, fetchImpl });
      api = nextApi;
      const nextGateway = createDiscordGateway({
        token,
        authorizedUsers,
        authorizedChannels,
        fetchImpl,
        WebSocketImpl,
        onStatus: (status, details) => {
          if (attemptGeneration !== generation || !wanted) return;
          report(status);
          if (status === 'connected') {
            attempts = 0;
          } else if (status === 'disconnected' || status === 'error') {
            if (status === 'error') {
              nextGateway.disconnect();
              scheduleReconnect();
            } else {
              scheduleReconnect();
            }
          } else if (status === 'fatal') {
            wanted = false;
            clearTimeoutImpl(reconnectTimer);
            reconnectTimer = null;
            onStatus('fatal', details);
          }
        },
        onCommand: async (event) => {
          notificationChannelId = event.channelId;
          await onCommand(event, (text) => nextApi.sendMessage(event.channelId, text));
        },
      });
      if (attemptGeneration !== generation || !wanted) {
        return { ok: false, error: 'Discord connection was cancelled' };
      }
      gateway = nextGateway;
      report('connecting');
      try {
        const result = await nextGateway.connect();
        if (attemptGeneration !== generation || !wanted) {
          nextGateway.disconnect();
          if (gateway === nextGateway) gateway = null;
          return { ok: false, error: 'Discord connection was cancelled' };
        }
        return result;
      } catch (error) {
        nextGateway.disconnect();
        if (gateway === nextGateway) gateway = null;
        if (attemptGeneration === generation && wanted) {
          if (error.code === 'MESSAGING_AUTH_REJECTED') {
            wanted = false;
            clearTimeoutImpl(reconnectTimer);
            reconnectTimer = null;
            report('fatal');
          } else {
            report('error');
            scheduleReconnect();
          }
        }
        throw error;
      }
    })();
    try {
      return await connectTask;
    } finally {
      if (connectTaskGeneration === attemptGeneration) {
        connectTask = null;
        connectTaskGeneration = -1;
      }
    }
  }

  async function start() {
    const settings = getSettings();
    if (settings?.enabled !== true) return { ok: false, error: 'Discord is disabled' };
    const discord = settings.discord || {};
    if (typeof discord.encryptedToken !== 'string' || !discord.encryptedToken.startsWith('enc:')) {
      return { ok: false, error: 'An encrypted Discord bot token is required' };
    }
    const authorizedUsers = normalizeIds(discord.authorizedUsers);
    const authorizedChannels = normalizeIds(discord.authorizedChannels);
    if (!authorizedUsers.length || !authorizedChannels.length) {
      return { ok: false, error: 'Authorized Discord users and channels are required' };
    }
    const token = decryptToken(discord.encryptedToken);
    if (typeof token !== 'string' || !token.trim()) return { ok: false, error: 'Discord bot token could not be decrypted' };
    wanted = true;
    if (gateway && state !== 'disconnected' && state !== 'error') return { ok: true, connected: gateway.connected };
    generation += 1;
    clearTimeoutImpl(reconnectTimer);
    reconnectTimer = null;
    return connectAttempt();
  }

  function stop() {
    wanted = false;
    generation += 1;
    clearTimeoutImpl(reconnectTimer);
    reconnectTimer = null;
    gateway?.disconnect();
    gateway = null;
    api = null;
    notificationChannelId = null;
    attempts = 0;
    report('disconnected');
    return { ok: true };
  }

  async function sendNotification(text) {
    if (!gateway?.connected || !api || !notificationChannelId) return { sent: false };
    await api.sendMessage(notificationChannelId, text);
    return { sent: true };
  }

  return {
    start,
    stop,
    sendNotification,
    get connected() { return gateway?.connected === true; },
    get state() { return state; },
    get reconnectAttempts() { return attempts; },
  };
}

module.exports = { createDiscordService, parseDiscordIds };
