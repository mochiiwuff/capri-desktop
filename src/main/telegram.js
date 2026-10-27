'use strict';

// Talking to her from Telegram: your own bot (made with @BotFather), its token pasted in her setup.
// She asks Telegram for new messages (long polling: nothing listens on your PC) and answers in the
// one chat that sent her the pairing code she showed you; anyone else writing to the bot is ignored.
// What you write goes to her chat (chat.js, through the overlay); she writes to you there too when a
// session is done or needs you while you're away from the PC.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
``
const API = 'https://api.telegram.org';
const POLL_S = 50;          // how long Telegram holds a poll open when there's nothing new
const RETRY_MS = 5000;      // after a failed poll (offline, Telegram down)
const TEXT_MAX = 4000;      // Telegram takes 4096 characters a message
const CODE_MS = 15 * 60 * 1000; // the pairing code is good this long

let token = '';
let owner = null;  // the chat she answers, once paired
let code = null;   // { value, until }: the pairing code she showed you
let offset = 0;
let polling = null; // AbortController of the poll running
let handlers = {};  // { onMessage(text), onAction(message, id), onPaired(), onChange() }

async function call(method, body = {}, { signal, form } = {}) {
  const res = await fetch(`${API}/bot${token}/${method}`, form
    ? { method: 'POST', body: form, signal }
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(json.description || `Telegram: ${res.status}`);
  return json.result;
}

const keyboard = (buttons) => ({
  inline_keyboard: buttons?.length ? [buttons.map((b) => ({ text: b.label, callback_data: String(b.id).slice(0, 64) }))] : [],
});
const clip = (text) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text);

// ---------- what she says there (chat.js, through main.js) ----------

// A new message, with buttons ([{ id, label }]): its id, to change it later
async function send(text, buttons) {
  if (!owner) throw new Error('not paired');
  const msg = await call('sendMessage', { chat_id: owner, text: clip(String(text || '…')), reply_markup: keyboard(buttons) });
  return msg.message_id;
}

async function edit(id, text, buttons) {
  if (!owner) return;
  await call('editMessageText', { chat_id: owner, message_id: id, text: clip(String(text || '…')), reply_markup: keyboard(buttons) })
    .catch((err) => {
      if (!/not modified/i.test(err.message)) throw err;
    });
}

// "typing…" at the top of the chat, for a few seconds
const typing = () => owner && call('sendChatAction', { chat_id: owner, action: 'typing' }).catch(() => {});

async function photo(file, caption = '') {
  if (!owner) return;
  const form = new FormData();
  form.append('chat_id', String(owner));
  if (caption) form.append('caption', clip(caption));
  form.append('photo', new Blob([fs.readFileSync(file)]), path.basename(file));
  await call('sendPhoto', null, { form });
}

// ---------- polling ----------

async function poll() {
  const ctrl = new AbortController();
  polling = ctrl;
  while (polling === ctrl) {
    try {
      const updates = await call('getUpdates', { offset, timeout: POLL_S, allowed_updates: ['message', 'callback_query'] }, { signal: ctrl.signal });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handle(update).catch((err) => console.error('[capri] telegram:', err.message));
      }
    } catch (err) {
      if (polling !== ctrl) return;
      console.error('[capri] telegram poll:', err.message);
      // another Capri (or anything else) polling the same bot: Telegram allows one at a time
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}

async function handle(update) {
  const query = update.callback_query;
  if (query) {
    if (query.message?.chat?.id !== owner) return;
    await call('answerCallbackQuery', { callback_query_id: query.id }).catch(() => {});
    handlers.onAction?.(query.message.message_id, query.data);
    return;
  }
  const msg = update.message;
  const text = msg?.text?.trim();
  if (!msg || !text || msg.chat?.type !== 'private') return;
  if (owner === null) {
    // not paired yet: the code she showed you, and nothing else, makes this chat hers to answer
    if (code && Date.now() < code.until && text === code.value) {
      owner = msg.chat.id;
      code = null;
      handlers.onPaired?.(owner);
    }
    return;
  }
  if (msg.chat.id !== owner || text === '/start') return;
  handlers.onMessage?.(text);
}

// ---------- setup ----------

// Starts (or restarts) her bot with this token and the chat she answers (null: not paired yet)
function start(newToken, chat, on) {
  stop();
  token = newToken || '';
  owner = chat ?? null;
  handlers = on || handlers;
  if (token) poll();
}

function stop() {
  polling?.abort();
  polling = null;
}

// The bot's name if the token is good, and a fresh pairing code to send it
async function check(newToken) {
  const before = token;
  token = newToken;
  try {
    const me = await call('getMe');
    return { ok: true, bot: me.username };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    token = before;
  }
}

function pairingCode() {
  code = { value: String(crypto.randomInt(100000, 1000000)), until: Date.now() + CODE_MS };
  return code.value;
}

const paired = () => Boolean(token && owner !== null);

module.exports = { start, stop, check, pairingCode, paired, send, edit, typing, photo };
