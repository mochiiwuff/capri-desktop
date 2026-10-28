'use strict';

const { randomUUID } = require('node:crypto');

const ACTIONS = new Set(['search', 'open', 'inspect', 'click', 'fill', 'submit', 'close-tab']);
const ONLINE_WINDOW_MS = 30000;

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalize(action) {
  if (!action || typeof action !== 'object' || !ACTIONS.has(action.type)) throw new Error('Unsupported browser action.');
  const result = { type: action.type };
  if (action.type === 'search') result.query = clean(action.query, 300);
  if (action.type === 'open') result.url = clean(action.url, 2000);
  if (action.type === 'click') result.target = clean(action.target, 160);
  if (action.type === 'fill') {
    result.target = clean(action.target, 120);
    result.value = clean(action.value, 1000);
    if (!result.value) throw new Error('Filling a browser field requires a user-provided value.');
  }
  if (action.type === 'submit') result.target = clean(action.target, 120);
  if (action.confirmed === true) result.confirmed = true;
  if (!['inspect', 'submit', 'close-tab'].includes(action.type) && !(result.query || result.url || result.target)) {
    throw new Error('The browser action needs a target.');
  }
  return result;
}

function createBrowserController({ timeout = 30000 } = {}) {
  const queue = [];
  const pending = new Map();
  let nextWaiter = null;
  let lastSeen = 0;

  function run(action) {
    if (Date.now() - lastSeen > ONLINE_WINDOW_MS) {
      return Promise.resolve({
        ok: false,
        error: 'Ative a extensão local da Capri em brave://extensions e carregue a pasta brave-extension do projeto.',
      });
    }
    const command = { id: randomUUID(), action: normalize(action) };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(command.id);
        resolve({ ok: false, error: 'Brave did not respond. Check that the Capri extension is enabled.' });
      }, timeout);
      pending.set(command.id, {
        finish(result) {
          clearTimeout(timer);
          pending.delete(command.id);
          resolve(result);
        },
      });
      if (nextWaiter) {
        const waiter = nextWaiter;
        nextWaiter = null;
        clearTimeout(waiter.timer);
        waiter.resolve(command);
      } else {
        queue.push(command);
      }
    });
  }

  function next(waitMs = 20000) {
    lastSeen = Date.now();
    const command = queue.shift();
    if (command) return Promise.resolve(command);
    if (nextWaiter) return Promise.resolve(null);
    return new Promise((resolve) => {
      const waiter = { resolve, timer: null };
      waiter.timer = setTimeout(() => {
        if (nextWaiter === waiter) nextWaiter = null;
        resolve(null);
      }, waitMs);
      nextWaiter = waiter;
    });
  }

  function result(payload) {
    if (!payload || typeof payload.id !== 'string') return false;
    const request = pending.get(payload.id);
    if (!request) return false;
    const response = payload.result;
    if (!response || typeof response !== 'object') request.finish({ ok: false, error: 'Invalid response from the Capri extension.' });
    else request.finish(response);
    return true;
  }

  return { run, next, result, isOnline: () => Date.now() - lastSeen <= ONLINE_WINDOW_MS };
}

module.exports = { createBrowserController, normalize };
