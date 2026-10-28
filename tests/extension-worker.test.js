'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createWorker({ savedWindowId = null, existingWindow = null } = {}) {
  const listeners = {};
  const calls = [];
  const storage = { capriWindowId: savedWindowId };
  const chrome = {
    runtime: {
      id: 'capri-extension',
      onMessage: { addListener: (listener) => { listeners.message = listener; } },
    },
    windows: {
      onRemoved: { addListener: (listener) => { listeners.removed = listener; } },
      get: async (id) => {
        if (!existingWindow || id !== existingWindow.id) throw new Error('No such window');
        return existingWindow;
      },
      create: async (options) => {
        calls.push({ type: 'create', options });
        return { id: 41, tabs: [{ id: 51 }] };
      },
      update: async (id, options) => calls.push({ type: 'update', id, options }),
      getLastFocused: async () => existingWindow,
      getAll: async () => (existingWindow ? [existingWindow] : []),
    },
    tabs: {
      query: async ({ windowId }) => (existingWindow && existingWindow.id === windowId ? [{ id: 99, url: 'https://example.com' }] : []),
      create: async ({ windowId, url, active }) => {
        calls.push({ type: 'tab:create', windowId, url, active });
        return { id: 100 };
      },
      update: async (tabId, options) => calls.push({ type: 'tab:update', tabId, options }),
    },
    alarms: {
      create: () => {},
      onAlarm: { addListener: (listener) => { listeners.alarm = listener; } },
    },
    storage: {
      session: {
        get: async () => ({ capriWindowId: storage.capriWindowId }),
        set: async (entry) => Object.assign(storage, entry),
        remove: async (key) => { delete storage[key]; },
      },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../brave-extension/background.js'), 'utf8');
  vm.runInNewContext(source, {
    chrome,
    fetch: () => new Promise(() => {}),
    console,
    setTimeout,
    clearTimeout,
    URL,
    Promise,
    Error,
    Number,
    String,
    encodeURIComponent,
  });
  return { listeners, calls, storage };
}

test('popup request creates and remembers a normal Capri window when none exists', async () => {
  const worker = createWorker();
  const response = await new Promise((resolve) => {
    worker.listeners.message({ type: 'open-capri-window' }, { id: 'capri-extension' }, resolve);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { ok: true, id: 41 });
  assert.deepEqual(JSON.parse(JSON.stringify(worker.calls)), [{
    type: 'create',
    options: { url: 'https://search.brave.com/', focused: true, type: 'normal', incognito: false },
  }]);
  assert.equal(worker.storage.capriWindowId, 41);
});

test('extension replaces a saved incognito window with a normal Brave window', async () => {
  const worker = createWorker({
    savedWindowId: 41,
    existingWindow: { id: 41, incognito: true },
  });
  await new Promise((resolve) => {
    worker.listeners.message({ type: 'open-capri-window' }, { id: 'capri-extension' }, resolve);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(worker.calls)), [{
    type: 'create',
    options: { url: 'https://search.brave.com/', focused: true, type: 'normal', incognito: false },
  }]);
  assert.equal(worker.storage.capriWindowId, 41);
});

test('popup request focuses the existing normal Capri window', async () => {
  const worker = createWorker({ savedWindowId: 41, existingWindow: { id: 41, incognito: false } });
  await new Promise((resolve) => {
    worker.listeners.message({ type: 'open-capri-window' }, { id: 'capri-extension' }, resolve);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(worker.calls)), [{ type: 'update', id: 41, options: { focused: true } }]);
});

test('extension reuses an existing normal Brave window and opens a new tab', async () => {
  const worker = createWorker({ savedWindowId: null, existingWindow: { id: 77, incognito: false } });
  await new Promise((resolve) => {
    worker.listeners.message({ type: 'open-capri-window' }, { id: 'capri-extension' }, resolve);
  });
  assert.equal(worker.storage.capriWindowId, 77);
  assert.deepEqual(JSON.parse(JSON.stringify(worker.calls)), [{ type: 'update', id: 77, options: { focused: true } }]);
});
