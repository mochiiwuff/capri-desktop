'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspectPlatform } = require('../src/main/platform');
const { platformText } = require('../src/main/platform-labels');

const previousMatchMedia = globalThis.matchMedia;
test.before(() => { globalThis.matchMedia = () => ({ matches: false }); });
test.after(() => {
  if (previousMatchMedia === undefined) delete globalThis.matchMedia;
  else globalThis.matchMedia = previousMatchMedia;
});

const linux = (extra = {}) => ({ platform: 'linux', env: { DISPLAY: ':1' }, exists: () => false,
  execute: async () => { throw new Error('service unavailable'); }, readRelease: () => 'ID=cachyos\n', ...extra });
const hyprland = (extra = {}) => linux({
  env: { DISPLAY: ':1', WAYLAND_DISPLAY: 'wayland-1', HYPRLAND_INSTANCE_SIGNATURE: 'test' },
  ...extra,
});

test('X11 has an overlay but does not advertise Windows integrations', async () => {
  const report = await inspectPlatform(linux());
  assert.equal(report.distribution, 'CachyOS');
  assert.equal(report.session, 'x11');
  assert.equal(report.features.overlay.status, 'supported');
  assert.equal(report.features.screenCapture.status, 'supported');
  for (const name of ['appCatalog', 'closeApps', 'media', 'autoStart', 'ollamaInstall', 'ollamaLaunch', 'windowTracking']) {
    assert.equal(report.features[name].status, 'unavailable', name);
  }
  assert.equal(report.checks.tray, 'unknown');
});

test('headless and native Wayland sessions explain why the overlay is unavailable', async () => {
  const headless = await inspectPlatform(linux({ env: {} }));
  assert.equal(headless.features.overlay.reason, 'noDisplay');
  const native = await inspectPlatform(hyprland({ backend: 'wayland' }));
  assert.equal(native.features.overlay.reason, 'nativeWayland');
});

test('Hyprland probes actual IPC while a running portal still needs capture permission', async () => {
  const calls = [];
  const report = await inspectPlatform(hyprland({ exists: (name) => name !== 'grim', execute: async (command, args) => {
    calls.push([command, args]);
    return command === 'hyprctl' ? '[{"id":0,"name":"private-monitor-name"}]' : '(true,)\n';
  } }));
  assert.equal(report.session, 'hyprland');
  assert.equal(report.checks.hyprctl, 'responding');
  assert.equal(report.features.windowTracking.status, 'supported');
  assert.equal(report.checks.portal, 'running');
  assert.equal(report.features.screenCapture.status, 'conditional');
  assert.equal(report.features.screenCapture.reason, 'portalPermission');
  assert.deepEqual(calls.find(([command]) => command === 'hyprctl')[1], ['-j', 'monitors']);
  assert.equal(calls.length, 2);
  assert.ok(!JSON.stringify(report).includes('private-monitor-name'));
});

test('missing, unreachable and malformed Hyprland responses do not imply readiness', async () => {
  const missing = await inspectPlatform(hyprland());
  assert.equal(missing.features.windowTracking.reason, 'noHyprctl');
  for (const output of ['broken JSON', '{}', '[]', '[null]', '[{"id":"bad"}]']) {
    const report = await inspectPlatform(hyprland({ exists: () => true, execute: async () => output }));
    assert.equal(report.checks.hyprctl, 'unreachable', output);
    assert.equal(report.features.windowTracking.reason, 'hyprctlOffline');
  }
  const offline = await inspectPlatform(hyprland({ exists: () => true }));
  assert.equal(offline.features.windowTracking.reason, 'hyprctlOffline');
});

test('portal absence and PipeWire tools do not prove screen capture will work or fail', async () => {
  for (const output of ['(false,)', 'unexpected output']) {
    const report = await inspectPlatform(hyprland({ exists: (name) => name !== 'grim',
      execute: async (command) => command === 'hyprctl' ? '[{"id":0}]' : output }));
    assert.equal(report.features.screenCapture.status, 'conditional');
    assert.equal(report.features.screenCapture.reason, 'portalUnknown');
    assert.equal(report.checks.pipewireTool, 'present');
    assert.notEqual(report.checks.portal, 'running');
  }
});

test('diagnostics refresh after recovery and never expose environment values or command errors', async () => {
  let online = false;
  const options = hyprland({ env: { DISPLAY: 'private-display', HYPRLAND_INSTANCE_SIGNATURE: 'private-socket',
    API_KEY: 'private-key', USER: 'private-user' }, backend: 'private-argument', exists: () => true,
    execute: async () => { if (!online) throw new Error('private-error'); return '[{"id":0}]'; },
    readRelease: () => 'ID=private-distribution\nNAME=private-name' });
  const before = await inspectPlatform(options);
  assert.equal(before.features.windowTracking.status, 'unavailable');
  online = true;
  const after = await inspectPlatform({ ...options, backend: 'x11' });
  assert.equal(after.features.windowTracking.status, 'supported');
  assert.doesNotMatch(JSON.stringify([before, after]), /private-/);
});

test('Windows retains its existing integrations and detects winget separately', async () => {
  const report = await inspectPlatform({ platform: 'win32', env: {}, exists: () => false });
  for (const name of ['windowTracking', 'appCatalog', 'closeApps', 'media', 'autoStart', 'ollamaLaunch']) {
    assert.equal(report.features[name].status, 'supported', name);
  }
  assert.equal(report.features.ollamaInstall.status, 'unavailable');
  const winget = await inspectPlatform({ platform: 'win32', env: {}, exists: (name) => name === 'winget' });
  assert.equal(winget.features.ollamaInstall.status, 'supported');
});

test('every diagnostic capability and reason has a label in the application languages', async () => {
  const reports = await Promise.all([inspectPlatform(linux()), inspectPlatform(linux({ env: {} })),
    inspectPlatform(hyprland()), inspectPlatform(hyprland({ backend: 'wayland' }))]);
  for (const lang of ['fr', 'en', 'es', 'pt', 'ru']) {
    const text = platformText(lang);
    for (const report of reports) for (const [name, value] of Object.entries(report.features)) {
      assert.ok(text.features[name], `${lang}: ${name}`);
      assert.ok(text.states[value.status], `${lang}: ${value.status}`);
      if (value.reason) assert.ok(text.reasons[value.reason], `${lang}: ${value.reason}`);
    }
  }
});

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const browser = (file) => import(moduleUrl(path.join(__dirname, '../src/renderer/js', file)));

async function chatFixture() {
  const [{ Chat }, { linesFor }] = await Promise.all([browser('chat.js'), browser('lines.js')]);
  const report = await inspectPlatform(linux());
  const chat = Object.create(Chat.prototype);
  chat.brain = { lang: 'fr', assistant: 'codex', t: linesFor('fr', 'codex'), custom: {},
    system: { features: report.features, text: platformText('fr') } };
  chat.apps = [];
  chat.host = {};
  return chat;
}

test('chat explains unavailable media and closing actions without trying to execute them', async () => {
  const chat = await chatFixture();
  const media = await chat.doNow({ kind: 'media', action: 'pause' });
  assert.match(media.line, /Windows/);
  const asked = chat.asked('ferme discord');
  assert.deepEqual(asked, { kind: 'unsupported', feature: 'closeApps' });
  assert.match((await chat.doNow(asked)).line, /Windows/);
});

test('unavailable app catalogue is not confused with an application that is not installed', async () => {
  const chat = await chatFixture();
  chat.host.findLaunch = async () => null;
  const result = await chat.doNow({ kind: 'open', text: 'ouvre gimp' });
  assert.match(result.line, /Windows/);
  assert.match(chat.powers().join('\n'), /Current platform limits/);
});

test('Linux guide omits automatic Ollama launching and direct setup explains the manual alternative', async () => {
  const [{ Guide }, { Setup }] = await Promise.all([browser('guide.js'), browser('setup.js')]);
  const chat = await chatFixture();
  const guide = Object.assign(Object.create(Guide.prototype), { brain: chat.brain, setup: {} });
  assert.equal(guide.freeWay, false);
  const setup = Object.assign(Object.create(Setup.prototype), { brain: chat.brain,
    fail: async (_line, quote) => quote });
  assert.match(await setup.freeNow(), /ollama launch codex/);
});

test('a failed screenshot restores the overlay and explains cancellation or portal failure', async (t) => {
  const chat = await chatFixture();
  const previous = globalThis.document;
  globalThis.document = { documentElement: { style: { visibility: '' } } };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  chat.host.screenshot = async () => { throw new Error('permission denied'); };
  chat.voice = { play() {} };
  const result = await chat.doNow({ kind: 'shot' });
  assert.equal(document.documentElement.style.visibility, '');
  assert.match(result.line, /capture.*échoué|annulée/);
});

test('media controls are offered on Linux once playerctl and wpctl are installed', async () => {
  const tools = new Set(['playerctl', 'wpctl']);
  assert.equal((await inspectPlatform(linux({ exists: (name) => tools.has(name) }))).features.media.status, 'supported');
  assert.equal((await inspectPlatform(linux({ exists: (name) => name === 'playerctl' }))).features.media.status, 'unavailable');
});

test('under Hyprland with grim, she captures the screen without the portal', async () => {
  const report = await inspectPlatform(hyprland({ exists: (name) => ['grim', 'hyprctl'].includes(name) }));
  assert.equal(report.features.screenCapture.status, 'supported');
});
