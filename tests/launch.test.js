'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const SPOTIFY = { name: 'Spotify', kind: 'app', id: 'Spotify.Package!Spotify' };

function loadLaunch(spawn) {
  const source = fs.readFileSync(path.join(__dirname, '../src/main/launch.js'), 'utf8');
  const module = { exports: {} };
  const dependencies = {
    'node:fs': fs,
    'node:path': path,
    'node:child_process': {
      execFile: (_file, _args, _options, callback) => callback(new Error('Steam is not installed')),
      spawn,
    },
    electron: { shell: { openExternal: async () => {} } },
    './apps': { powershell: async () => JSON.stringify({ Name: SPOTIFY.name, AppID: SPOTIFY.id }) },
  };
  vm.runInNewContext(source, {
    module,
    require: (name) => dependencies[name],
    process: { platform: 'win32', env: {} },
  }, { filename: 'src/main/launch.js' });
  return module.exports;
}

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

test('asking Capri to open Spotify repeatedly launches the same Start menu app', async () => {
  const invocations = [];
  const launch = loadLaunch((file, args, options) => {
    invocations.push({ file, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  let Chat;
  try {
    ({ Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js'))));
  } finally {
    if (previousMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previousMatchMedia;
  }
  const chat = Object.create(Chat.prototype);
  chat.apps = [];
  chat.brain = { custom: {}, t: { chat: { opened: 'Opened {app}' } } };
  chat.capri = { head: () => ({ x: 0, y: 0 }), towardCenter: () => 0, zap() {} };
  chat.host = {
    findLaunch: launch.find,
    async launch(item) {
      await launch.launch(item);
      return { ok: true };
    },
  };

  for (const request of ['open Spotify', 'open Spotify again']) {
    const intent = chat.asked(request);
    assert.equal(intent.kind, 'open');
    assert.equal((await chat.doNow(intent)).line, 'Opened Spotify');
  }

  assert.equal(invocations.length, 2);
  assert.deepEqual(invocations.map(({ file, args }) => [file, Array.from(args)]), [
    ['explorer.exe', ['shell:AppsFolder\\Spotify.Package!Spotify']],
    ['explorer.exe', ['shell:AppsFolder\\Spotify.Package!Spotify']],
  ]);
});

test('a failed Start menu launcher is reported instead of treated as success', async () => {
  const launch = loadLaunch(() => {
    const child = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => child.emit('error', new Error('launcher unavailable')));
    return child;
  });

  await assert.rejects(launch.launch(SPOTIFY), /launcher unavailable/);
});
