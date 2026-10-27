'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

test('opening Spotify asks for confirmation, without changing other app or music actions', async (t) => {
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => { delete globalThis.matchMedia; });
  const { Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
  const launches = [];
  const musicSearches = [];
  let offeredActions = [];
  let onAction;
  const chat = Object.create(Chat.prototype);
  chat.apps = [];
  chat.open = true;
  chat.turn = 0;
  chat.brain = { t: { chat: {
    openIt: 'Open {app}', no: 'No', opened: '{app}: on it.', failed: 'Failed', music: 'Looking up {song}',
  } } };
  chat.capri = { head: () => ({ x: 0, y: 0 }), towardCenter: () => 0, zap() {} };
  chat.panel = {
    setActions(actions, handler) {
      offeredActions = actions;
      onAction = handler;
    },
    stream(message) { this.message = message; },
    setFace() {},
  };
  chat.host = {
    findLaunch: async (text) => ({ kind: 'app', id: text, name: text.replace(/^(open|launch|start|run)\s+/i, '') }),
    launch: async (item) => { launches.push(item.name); return { ok: true }; },
    music: async (song) => { musicSearches.push(song); return true; },
  };

  const spotifyAsk = chat.asked('open Spotify');
  const spotifyResult = await chat.doNow(spotifyAsk);
  assert.equal(spotifyResult.confirm.name, 'Spotify');
  assert.deepEqual(launches, []);
  await chat.after('', 'Opening Spotify.', spotifyAsk, Promise.resolve(spotifyResult), 'open Spotify');
  assert.deepEqual(offeredActions.map(({ label }) => label), ['Open Spotify', 'No']);
  assert.deepEqual(launches, []);
  await onAction('open');
  assert.deepEqual(launches, ['Spotify']);
  assert.match(chat.panel.message, /Spotify: on it\./);

  const otherAppAsk = chat.asked('open Notepad');
  const otherAppResult = await chat.doNow(otherAppAsk);
  assert.equal(otherAppResult.line, 'Notepad: on it.');
  assert.deepEqual(launches, ['Spotify', 'Notepad']);

  const musicAsk = chat.asked('play Bad Bunny on Spotify');
  assert.deepEqual(musicAsk, { kind: 'music', song: 'Bad Bunny' });
  await chat.doNow(musicAsk);
  assert.deepEqual(musicSearches, ['Bad Bunny']);
});
