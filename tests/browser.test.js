'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { once } = require('node:events');
const { createBrowserController, normalize } = require('../src/main/browser');
const { createBridge } = require('../src/main/bridge');

const EXTENSION_ORIGIN = 'chrome-extension://hbipfcmbibjaodaagpdkkkgahhdkldjj';

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

test('browser controller validates, dispatches and resolves commands', async () => {
  const controller = createBrowserController();
  const poll = controller.next();
  const result = controller.run({ type: 'search', query: '  Jazzghost  ' });
  const command = await poll;

  assert.equal(controller.isOnline(), true);
  assert.deepEqual(command.action, { type: 'search', query: 'Jazzghost' });
  assert.equal(controller.result({ id: command.id, result: { ok: true, message: 'Search opened.' } }), true);
  assert.deepEqual(await result, { ok: true, message: 'Search opened.' });
  assert.deepEqual(normalize({ type: 'submit' }), { type: 'submit', target: '' });
  assert.throws(() => normalize({ type: 'fill', target: 'Name' }), /user-provided value/);
  assert.throws(() => controller.run({ type: 'navigate', url: 'https://example.com' }), /Unsupported browser action/);
});

test('bridge accepts extension requests only on browser routes', async (t) => {
  const events = [];
  const browserCalls = [];
  const server = createBridge({
    port: 0,
    onEvent: (event) => events.push(event),
    onBrowser: (action, body) => {
      browserCalls.push({ action, body });
      return action === 'next' ? { id: 'command' } : true;
    },
  });
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const deniedEvent = await fetch(`${base}/event`, {
    method: 'POST',
    headers: { origin: EXTENSION_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ hook_event_name: 'Stop' }),
  });
  assert.equal(deniedEvent.status, 403);
  assert.deepEqual(events, []);

  const deniedWebOrigin = await fetch(`${base}/browser/next`, {
    headers: { origin: 'https://example.com' },
  });
  assert.equal(deniedWebOrigin.status, 403);

  const allowedNext = await fetch(`${base}/browser/next`, {
    headers: { origin: EXTENSION_ORIGIN },
  });
  assert.equal(allowedNext.headers.get('access-control-allow-origin'), EXTENSION_ORIGIN);
  assert.deepEqual(await allowedNext.json(), { id: 'command' });

  const allowedHealth = await fetch(`${base}/browser/health`, {
    headers: { origin: EXTENSION_ORIGIN },
  });
  assert.equal(allowedHealth.headers.get('access-control-allow-origin'), EXTENSION_ORIGIN);
  assert.deepEqual(await allowedHealth.json(), { ok: true, name: 'capri-browser' });

  const allowedResult = await fetch(`${base}/browser/result`, {
    method: 'POST',
    headers: { origin: EXTENSION_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'command', result: { ok: true } }),
  });
  assert.deepEqual(await allowedResult.json(), { ok: true });
  assert.equal(allowedNext.headers.get('access-control-allow-private-network'), 'true');

  const preflight = await fetch(`${base}/browser/next`, {
    method: 'OPTIONS',
    headers: {
      origin: EXTENSION_ORIGIN,
      'access-control-request-method': 'GET',
      'access-control-request-private-network': 'true',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  assert.equal(preflight.headers.get('access-control-allow-origin'), EXTENSION_ORIGIN);

  const anotherExtension = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const customOriginHealth = await fetch(`${base}/browser/health`, {
    headers: { origin: anotherExtension },
  });
  assert.equal(customOriginHealth.status, 200);
  assert.equal(customOriginHealth.headers.get('access-control-allow-origin'), anotherExtension);
  assert.equal(customOriginHealth.headers.get('access-control-allow-private-network'), 'true');

  assert.deepEqual(browserCalls.map(({ action }) => action), ['next', 'result']);
});

test('chat recognizes a Brave search for a named YouTube channel', async (t) => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => {
    if (previousMatchMedia) globalThis.matchMedia = previousMatchMedia;
    else delete globalThis.matchMedia;
  });
  const { Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
  const chat = Object.create(Chat.prototype);
  assert.deepEqual(chat.asked('Abre o YouTube no canal do Jazzghost'), {
    kind: 'browser',
    action: { type: 'search', query: 'site:youtube.com/@ Jazzghost' },
  });
  assert.deepEqual(chat.asked('Abre o YouTube no brave'), {
    kind: 'browser',
    action: { type: 'open', url: 'https://www.youtube.com' },
  });
  assert.deepEqual(chat.asked('abre o youtube'), {
    kind: 'browser',
    action: { type: 'open', url: 'https://www.youtube.com' },
  });
  assert.deepEqual(chat.asked('coloca uma musica'), {
    kind: 'music',
    song: 'Cyberpunk 2077 I Really Want to Stay at Your House',
    platform: 'spotify',
  });
  assert.deepEqual(chat.asked('toca Queen'), {
    kind: 'music',
    song: 'Queen',
    platform: 'spotify',
  });
  assert.deepEqual(chat.asked('coloca lofi no youtube'), {
    kind: 'music',
    song: 'lofi',
    platform: 'youtube',
  });
  // play/resume controls must NOT trigger a music search
  assert.deepEqual(chat.asked('da play'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('dá play'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('dar play'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('da play na musica'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('coloca para tocar'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('coloca pra tocar a musica'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('despausa'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('despausa a musica'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('continua a musica'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('bota pra tocar'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('play'), { kind: 'media', action: 'play' });
  // play with platform suffix must NOT search for 'do' or platform name
  assert.deepEqual(chat.asked('da play na musica do spotify'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('da play na musica do spotify'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('play na musica do spotify'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('bota pra tocar no spotify'), { kind: 'media', action: 'play' });
  assert.deepEqual(chat.asked('despausa a musica do youtube'), { kind: 'media', action: 'play' });
  // music search: with an artist/song name, should search (not just resume)
  assert.deepEqual(chat.asked('toca Queen').kind, 'music');
  assert.deepEqual(chat.asked('toca Queen').song, 'Queen');
  assert.deepEqual(chat.asked('dá play em Queen').kind, 'music');
  assert.deepEqual(chat.asked('dá play em Queen').song, 'Queen');
  assert.deepEqual(chat.asked('Feche a aba atual'), {
    kind: 'browser',
    action: { type: 'close-tab' },
  });
  assert.deepEqual(chat.asked('Cierra la pestaña'), {
    kind: 'browser',
    action: { type: 'close-tab' },
  });
  assert.deepEqual(normalize({ type: 'close-tab' }), { type: 'close-tab' });
});

test('a model cannot click a Brave search result without a separate user request', async (t) => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => {
    if (previousMatchMedia) globalThis.matchMedia = previousMatchMedia;
    else delete globalThis.matchMedia;
  });
  const { Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
  const chat = Object.create(Chat.prototype);
  let browserActions = 0;
  chat.brain = { t: { chat: {} } };
  chat.addLine = () => {};
  chat.runBrowserAction = async () => { browserActions++; };

  await chat.after(
    'Found it. [[browser:click|Run command]]',
    'Found it.',
    { kind: 'browser', action: { type: 'search', query: 'capri' } },
    Promise.resolve({ line: 'Search complete.', face: 'look' }),
    'pesquisa por capri no Brave',
  );
  assert.equal(browserActions, 0);
});

test('game commentary sends a temporary image only when explicitly enabled and idle', async (t) => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => {
    if (previousMatchMedia) globalThis.matchMedia = previousMatchMedia;
    else delete globalThis.matchMedia;
  });
  const { Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
  const chat = Object.create(Chat.prototype);
  let sent;
  let displayed;
  let spoken;
  chat.turn = 0;
  chat.open = false;
  chat.panel = { current: null, say: (message) => { displayed = message; } };
  chat.host = {
    captureScreen: async () => ({ ok: true, image: 'temporary-frame' }),
    chatSend: async (request) => { sent = request; return { ok: true, text: 'Nice move.' }; },
    chatStop() {},
    setConfig() {},
  };
  chat.voiceChat = { speak: (text) => { spoken = text; } };
  chat.persona = () => 'Capri';
  chat.brain = { t: { chat: { gameBadge: 'JOGO', gameWatchError: 'Erro', failed: 'Falha' } } };
  chat.gameWatchBusy = false;
  chat.gameWatching = true;
  chat.gameWatchId = null;
  chat.gameWatchError = false;

  await chat.commentOnGame();
  assert.equal(sent.image, 'temporary-frame');
  assert.equal(sent.messages.at(-1).content.includes('gameplay screenshot'), true);
  assert.equal(displayed.line, 'Nice move.');
  assert.equal(spoken, 'Nice move.');
  assert.equal(chat.history, undefined);
});

test('game commentary does not capture while the user is chatting', async (t) => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => {
    if (previousMatchMedia) globalThis.matchMedia = previousMatchMedia;
    else delete globalThis.matchMedia;
  });
  const { Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
  const chat = Object.create(Chat.prototype);
  let captures = 0;
  chat.turn = 0;
  chat.open = true;
  chat.panel = { current: null };
  chat.host = { captureScreen: async () => { captures++; return { ok: true, image: 'frame' }; } };
  chat.gameWatchBusy = false;
  chat.gameWatching = true;

  await chat.commentOnGame();
  assert.equal(captures, 0);
});

test('all supported languages provide voice and game-watch labels', async () => {
  const { LINES } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/lines.js')));
  for (const language of ['en', 'fr', 'es', 'pt', 'ru']) {
    assert.ok(LINES[language].chat.voice);
    assert.ok(LINES[language].chat.voiceErrors.voiceUnsupported);
    assert.ok(LINES[language].chat.gameBadge);
    assert.ok(LINES[language].chat.gameWatchError);
  }
});

test('music commentary reacts to track changes, respects cooldown and skips when chatting', async (t) => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => {
    if (previousMatchMedia) globalThis.matchMedia = previousMatchMedia;
    else delete globalThis.matchMedia;
  });
  const { Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
  const chat = Object.create(Chat.prototype);

  let sent = null;
  let displayed = null;
  let spoken = null;
  let performed = null;

  chat.turn = 0;
  chat.open = false;
  chat.musicCommentBusy = false;
  chat.lastTrackCommented = '';
  chat.lastTrackTime = 0;
  chat.panel = { current: null, say: (msg) => { displayed = msg; } };
  chat.host = {
    chatSend: async (req) => { sent = req; return { ok: true, text: 'Essa faixa é lendária, choom!' }; },
  };
  chat.voiceChat = { speak: (text) => { spoken = text; } };
  chat.capri = { stowed: false, dormant: false, mode: 'idle', perform: (act) => { performed = act; } };
  chat.persona = () => 'Capri Persona';
  chat.brain = { lang: 'pt' };

  // 1. Spontaneous comment on track
  await chat.commentOnTrack('Cyberpunk 2077 - I Really Want to Stay at Your House');
  assert.ok(sent, 'chatSend was called');
  assert.ok(sent.messages.at(-1).content.includes('Cyberpunk 2077 - I Really Want to Stay at Your House'));
  assert.equal(displayed.badge, 'MÚSICA');
  assert.equal(displayed.line, 'Essa faixa é lendária, choom!');
  assert.equal(spoken, 'Essa faixa é lendária, choom!');
  assert.equal(performed, 'hop');

  // 2. Cooldown: immediate second track should be skipped
  sent = null;
  await chat.commentOnTrack('Another Artist - Another Song');
  assert.equal(sent, null, 'Should skip due to 30s cooldown');

  // 3. Reset cooldown, test chat active guard
  chat.lastTrackTime = 0;
  chat.open = true; // User is in chat
  sent = null;
  await chat.commentOnTrack('Third Artist - Third Song');
  assert.equal(sent, null, 'Should skip while chat is open');

  // 4. Stowed guard
  chat.open = false;
  chat.capri.stowed = true;
  sent = null;
  await chat.commentOnTrack('Fourth Artist - Fourth Song');
  assert.equal(sent, null, 'Should skip while Capri is stowed');

  // 5. Deduplication via onTrackChanged
  chat.capri.stowed = false;
  chat.lastTrackCommented = '';
  chat.onTrackChanged('Test Artist - Test Song');
  assert.equal(chat.lastTrackCommented, 'Test Artist - Test Song');
  const timer = chat.trackDebounceTimer;
  assert.ok(timer, 'Debounce timer should be scheduled');
  clearTimeout(chat.trackDebounceTimer);
});

test('capri animates head bob and mane sway to music rhythm when grooving', async (t) => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => {
    if (previousMatchMedia) globalThis.matchMedia = previousMatchMedia;
    else delete globalThis.matchMedia;
  });
  const { Capri } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/capri.js')));
  const capri = Object.create(Capri.prototype);
  capri.p = { seed: 0, hair: 0, head: 0, mane: 0, armL: 0, armR: 0, longL: 1, longR: 1, sit: 0, kickL: 0, kickR: 0 };
  capri.base = { sample: () => ({ index: 0, pose: {} }), resolve: () => ({ head: 0, mane: 0, hair: 0, bob: 0 }) };
  capri.act = null;
  capri.mode = 'idle';
  capri.stance = 'stand';
  capri.dormant = false;
  capri.stowed = false;
  capri.dragging = false;
  capri.facing = 1;
  capri.grooving = false;

  // Without groove, head stays at base (0)
  capri.animate(1000);
  assert.equal(capri.p.head, 0);

  // Enable groove: head and hair oscillate with music beat
  capri.setGroove(true);
  assert.equal(capri.grooving, true);

  capri.animate(1130); // quarter beat
  assert.notEqual(capri.p.head, 0, 'Head should nod with rhythm');
  assert.notEqual(capri.p.hair, 0, 'Mane should sway with rhythm');

  // Sleep mode suppresses groove animation
  capri.mode = 'sleep';
  capri.animate(1130);
  assert.equal(capri.p.head, 0, 'Sleep should suppress groove');

  // Disable groove returns head to 0
  capri.mode = 'idle';
  capri.setGroove(false);
  capri.animate(1130);
  assert.equal(capri.p.head, 0, 'Disabled groove should not nod');
});

test('chat recognizes web search intent and queries webSearch engine', async (t) => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => {
    if (previousMatchMedia) globalThis.matchMedia = previousMatchMedia;
    else delete globalThis.matchMedia;
  });
  const { Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
  const chat = Object.create(Chat.prototype);

  assert.deepEqual(chat.asked('pesquisa na internet quem ganhou a copa de 2022'), {
    kind: 'web_search',
    query: 'quem ganhou a copa de 2022',
  });
  assert.deepEqual(chat.asked('busca na web sobre GTA 6'), {
    kind: 'web_search',
    query: 'GTA 6',
  });
  assert.deepEqual(chat.asked('pesquise sobre inteligência artificial'), {
    kind: 'web_search',
    query: 'inteligência artificial',
  });
  assert.deepEqual(chat.asked('cria uma missão: pesquisa notícias recentes sobre Capri'), {
    kind: 'mission_create',
    objective: 'pesquisa notícias recentes sobre Capri',
  });

  let searchedQuery = null;
  chat.brain = { t: { chat: {} } };
  chat.zap = () => {};
  chat.host = {
    webSearch: async (q) => {
      searchedQuery = q;
      return {
        ok: true,
        results: [{ title: 'GTA 6 News', snippet: 'Trailer released' }],
        context: 'GTA 6 context',
      };
    },
  };
  const res = await chat.doNow({ kind: 'web_search', query: 'GTA 6' });
  assert.equal(searchedQuery, 'GTA 6');
  assert.ok(res.line.includes('Pesquisei na rede por "GTA 6"'));
  assert.equal(res.context, 'GTA 6 context');
});

test('chat starts and wakes capri when talk command or shortcut is triggered', async (t) => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => {
    if (previousMatchMedia) globalThis.matchMedia = previousMatchMedia;
    else delete globalThis.matchMedia;
  });
  const { Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
  const chat = Object.create(Chat.prototype);

  let woken = false;
  let overlayFocused = false;
  chat.capri = {
    stowed: true,
    wake: () => { woken = true; },
    unstow: async () => { chat.capri.stowed = false; },
    perform: () => {},
  };
  chat.host = {
    setConfig: () => {},
    chatStatus: async () => ({ ok: true, model: 'llama3.2', local: true }),
    chatMemory: async () => [],
    focusOverlay: (on) => { overlayFocused = on; },
  };
  chat.brain = {
    t: { chat: { hello: ['Hi'], again: ['Hello again'] } },
  };
  chat.panel = {
    say: () => true,
    chatInput: { focus: () => {} },
  };
  chat.listApps = () => {};

  await chat.start();
  assert.equal(woken, true, 'Capri should be awakened when starting chat');
  assert.equal(chat.capri.stowed, false, 'Capri should be unstowed');
  assert.equal(chat.open, true, 'Chat should be open');
  assert.equal(overlayFocused, true, 'Overlay should receive keyboard focus');
});
