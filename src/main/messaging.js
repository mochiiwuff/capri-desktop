'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

const COMMANDS = new Set(['status', 'pause', 'resume', 'memory', 'projects', 'report', 'update']);
const ID = /^\d{5,24}$/;
const DEFAULT_GRAPH_VERSION = 'v23.0';
const MAX_DISCORD_TEXT = 2000;
const MAX_WHATSAPP_TEXT = 4096;

function normalizeIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value || '').trim()).filter((value) => ID.test(value)))].slice(0, 100);
}

function parseCommand(value) {
  const match = String(value || '').trim().match(/^\/capri(?:\s+([a-z]+))?\s*$/i)
    || String(value || '').trim().match(/^!capri(?:\s+([a-z]+))?\s*$/i);
  const command = match?.[1]?.toLowerCase();
  return command && COMMANDS.has(command) ? command : null;
}

function isAuthorized(sender, allowlist) {
  const id = String(sender || '').trim();
  return Boolean(id && normalizeIds(allowlist).includes(id));
}

function parseClock(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isQuietTime(now, quietHours = {}) {
  if (quietHours.enabled !== true) return false;
  const start = parseClock(quietHours.start);
  const end = parseClock(quietHours.end);
  if (start === null || end === null || start === end) return false;
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return false;
  const minute = date.getHours() * 60 + date.getMinutes();
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function rateLimitDecision(history = [], maxPerHour = 10, now = Date.now(), key = null, duplicateWindowMs = 5 * 60 * 1000) {
  const timestamp = Number(now instanceof Date ? now.getTime() : now);
  if (!Number.isFinite(timestamp)) return 'invalid-time';
  const events = Array.isArray(history)
    ? history.filter((event) => Number(event?.at) > timestamp - 60 * 60 * 1000 && Number(event?.at) <= timestamp)
    : [];
  const limit = Math.max(1, Math.min(60, Math.floor(Number(maxPerHour) || 10)));
  if (events.length >= limit) return 'rate-limited';
  const duplicateWindow = Math.max(0, Math.min(24 * 60 * 60 * 1000, Number(duplicateWindowMs) || 5 * 60 * 1000));
  if (key && events.some((event) => event.key === key && timestamp - Number(event.at) >= 0
    && timestamp - Number(event.at) < duplicateWindow)) return 'duplicate';
  return 'allowed';
}

function notificationDecision({ preferences = {}, history = [], key, now = Date.now() }) {
  if (preferences.enabled !== true || preferences.notificationsEnabled !== true || preferences.notificationsPaused === true) return 'disabled';
  if (isQuietTime(now, preferences.quietHours)) return 'quiet-hours';
  return rateLimitDecision(
    history,
    preferences.maxPerHour,
    now,
    key,
    preferences.duplicateWindowMs,
  );
}

function parseNotificationPreferences(request) {
  if (!request || typeof request !== 'object' || typeof request.quietHours !== 'string') return null;
  const rawHours = request.quietHours.trim();
  const rawLimit = String(request.maxPerHour ?? '');
  if (!/^\d+$/.test(rawLimit)) return null;
  const maxPerHour = Number(rawLimit);
  if (!Number.isInteger(maxPerHour) || maxPerHour < 1 || maxPerHour > 60) return null;
  if (!rawHours) return { quietHours: { enabled: false, start: '22:00', end: '08:00' }, maxPerHour };
  const match = rawHours.match(/^((?:[01]\d|2[0-3]):[0-5]\d)\s*,\s*((?:[01]\d|2[0-3]):[0-5]\d)$/);
  if (!match || match[1] === match[2]) return null;
  return { quietHours: { enabled: true, start: match[1], end: match[2] }, maxPerHour };
}

function authorizeCommand({ text, sender, channelId, authorizedUsers, authorizedChannels, requireChannel = false }) {
  const command = parseCommand(text);
  if (!command || !isAuthorized(sender, authorizedUsers)) return null;
  const channels = normalizeIds(authorizedChannels);
  if ((requireChannel && channels.length === 0)
    || (channels.length > 0 && !channels.includes(String(channelId || '')))) return null;
  return command;
}

function verifyWhatsAppSignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(signature)
    || typeof appSecret !== 'string' || !appSecret) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function apiError(response, body) {
  const error = response.status === 429
    ? new Error('Messaging provider rate limit reached')
    : response.status === 401 || response.status === 403
      ? new Error('Messaging credentials were rejected')
      : new Error(`Messaging provider request failed (${response.status})${body?.error?.code ? `, code ${body.error.code}` : ''}`);
  if (response.status === 401 || response.status === 403) error.code = 'MESSAGING_AUTH_REJECTED';
  return error;
}

function createDiscordApi({ token, fetchImpl = globalThis.fetch } = {}) {
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('Discord bot token is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  async function sendMessage(channelId, text, { signal } = {}) {
    const channel = String(channelId || '');
    const content = String(text || '').trim();
    if (!ID.test(channel)) throw new TypeError('Invalid Discord channel ID');
    if (!content || content.length > MAX_DISCORD_TEXT) throw new RangeError('Discord message must contain 1 to 2000 characters');
    const response = await fetchImpl(`https://discord.com/api/v10/channels/${channel}/messages`, {
      method: 'POST',
      headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw apiError(response, body);
    return { id: body.id || null };
  }

  return { sendMessage };
}

function createWhatsAppApi({
  accessToken,
  phoneNumberId,
  fetchImpl = globalThis.fetch,
  graphVersion = DEFAULT_GRAPH_VERSION,
} = {}) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) throw new TypeError('WhatsApp access token is required');
  if (typeof phoneNumberId !== 'string' || !ID.test(phoneNumberId)) throw new TypeError('Invalid WhatsApp phone number ID');
  if (!/^v\d{1,3}\.\d$/.test(graphVersion)) throw new TypeError('Invalid WhatsApp Graph API version');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  async function sendText(recipient, text, { signal } = {}) {
    const to = String(recipient || '').replace(/[+\s()-]/g, '');
    const bodyText = String(text || '').trim();
    if (!/^\d{8,15}$/.test(to)) throw new TypeError('Invalid WhatsApp recipient phone number');
    if (!bodyText || bodyText.length > MAX_WHATSAPP_TEXT) throw new RangeError('WhatsApp message must contain 1 to 4096 characters');
    const response = await fetchImpl(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: bodyText },
      }),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw apiError(response, body);
    return { id: body.messages?.[0]?.id || null };
  }

  return { sendText };
}

function extractWhatsAppMessages(payload) {
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return [];
  const messages = [];
  for (const entry of payload.entry) {
    for (const change of entry?.changes || []) {
      for (const message of change?.value?.messages || []) {
        if (message?.type === 'text' && typeof message.text?.body === 'string'
          && typeof message.from === 'string' && /^\d{8,15}$/.test(message.from)) {
          messages.push({ from: message.from, text: message.text.body });
        }
      }
    }
  }
  return messages;
}

function createDiscordGateway({
  token,
  authorizedUsers = [],
  authorizedChannels = [],
  onCommand = () => {},
  onStatus = () => {},
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('Discord bot token is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  if (typeof WebSocketImpl !== 'function') throw new TypeError('WebSocket implementation is required');

  let socket = null;
  let heartbeat = null;
  let connected = false;
  let awaitingHeartbeatAck = false;

  async function connect() {
    if (socket) return { ok: true, connected };
    const response = await fetchImpl('https://discord.com/api/v10/gateway/bot', {
      headers: { authorization: `Bot ${token}` },
    });
    if (!response.ok) throw apiError(response, {});
    const gateway = await response.json();
    const url = new URL(gateway.url);
    url.searchParams.set('v', '10');
    url.searchParams.set('encoding', 'json');
    socket = new WebSocketImpl(url.toString());
    onStatus('connecting');
    socket.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (payload.op === 10 && Number.isFinite(payload.d?.heartbeat_interval)) {
        heartbeat = setIntervalImpl(() => {
          if (socket?.readyState !== 1) return;
          if (awaitingHeartbeatAck) {
            socket.close(4000, 'Heartbeat acknowledgement timed out');
            return;
          }
          awaitingHeartbeatAck = true;
          socket.send(JSON.stringify({ op: 1, d: null }));
        }, Math.max(1000, payload.d.heartbeat_interval));
        awaitingHeartbeatAck = true;
        socket.send(JSON.stringify({ op: 1, d: null }));
        socket.send(JSON.stringify({
          op: 2,
          d: {
            token,
            intents: 1 | 512 | 4096 | 32768,
            properties: { os: process.platform, browser: 'capri', device: 'capri' },
          },
        }));
      } else if (payload.op === 0 && payload.t === 'READY') {
        connected = true;
        onStatus('connected');
      } else if (payload.op === 11) {
        awaitingHeartbeatAck = false;
      } else if (payload.op === 7 || payload.op === 9) {
        socket.close(4001, 'Gateway requested a fresh connection');
      } else if (payload.op === 0 && payload.t === 'MESSAGE_CREATE' && payload.d?.author?.bot !== true) {
        const command = authorizeCommand({
          text: payload.d.content,
          sender: payload.d.author?.id,
          channelId: payload.d.channel_id,
          authorizedUsers,
          authorizedChannels,
          requireChannel: true,
        });
        if (command) {
          Promise.resolve(onCommand({
            platform: 'discord',
            command,
            sender: payload.d.author.id,
            channelId: payload.d.channel_id,
          })).catch((err) => console.error('[capri] Discord command failed:', err.message));
        }
      }
    });
    socket.addEventListener('close', (event) => {
      connected = false;
      clearIntervalImpl(heartbeat);
      heartbeat = null;
      awaitingHeartbeatAck = false;
      socket = null;
      const fatal = [4004, 4010, 4011, 4012, 4013, 4014].includes(event?.code);
      onStatus(fatal ? 'fatal' : 'disconnected', { code: event?.code || 0, reason: event?.reason || '' });
    });
    socket.addEventListener('error', () => onStatus('error'));
    return { ok: true, connected: false };
  }

  function disconnect() {
    connected = false;
    clearIntervalImpl(heartbeat);
    heartbeat = null;
    awaitingHeartbeatAck = false;
    const current = socket;
    socket = null;
    current?.close(1000, 'Disconnected by user');
    return { ok: true };
  }

  return {
    connect,
    disconnect,
    get connected() { return connected; },
  };
}

module.exports = {
  COMMANDS,
  DEFAULT_GRAPH_VERSION,
  normalizeIds,
  parseCommand,
  isAuthorized,
  authorizeCommand,
  isQuietTime,
  rateLimitDecision,
  notificationDecision,
  parseNotificationPreferences,
  verifyWhatsAppSignature,
  createDiscordApi,
  createDiscordGateway,
  createWhatsAppApi,
  extractWhatsAppMessages,
};
