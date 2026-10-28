'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshot, startWindowWatch, createHyprland, monitorFor } = require('../src/main/hyprland');

const bounds = { x: -1920, y: 0, width: 1920, height: 1080 };
const client = { address: '0x123', mapped: true, hidden: false, pid: 42, class: 'kitty',
  workspace: { id: 1 }, at: [-1800, 100], size: [800, 600], fullscreen: 0, title: 'private title' };
const monitors = [{ activeWorkspace: { id: 1 }, specialWorkspace: { id: 0 } }];

test('Hyprland translates logical coordinates and exposes no title', () => {
  const result = snapshot([client], monitors, client, bounds, 99);
  assert.deepEqual(result.wins, [{ id: '0x123', x: 120, y: 100, w: 800, h: 600, max: false }]);
  assert.equal(result.fg, client.address);
  assert.ok(!JSON.stringify(result).includes('private title'));
});

test('hidden workspaces, unmapped windows, Capri and other monitors are excluded', () => {
  const rows = [{ ...client, workspace: { id: 2 } }, { ...client, hidden: true },
    { ...client, mapped: false }, { ...client, pid: 99 }, { ...client, class: 'capri' },
    { ...client, at: [100, 0] }, { ...client, size: [-1, 100] }];
  assert.deepEqual(snapshot(rows, monitors, {}, bounds, 99).wins, []);
  assert.equal(snapshot([{ ...client, pinned: true, workspace: { id: 2 } }], monitors, {}, bounds, 99).wins.length, 1);
});

test('special workspace is visible and fullscreen windows are marked', () => {
  const result = snapshot([{ ...client, workspace: { id: -99 }, fullscreen: 2 }],
    [{ activeWorkspace: { id: 1 }, specialWorkspace: { id: -99 } }], {}, bounds, 99);
  assert.equal(result.wins[0].max, true);
});

test('poll publishes a snapshot, refreshes its origin and stops', async () => {
  const updates = [];
  let area = bounds;
  const watch = startWindowWatch({ overlay: { isDestroyed: () => false, getBounds: () => area },
    onUpdate: (data) => updates.push(data),
    read: async (key) => ({ clients: [client], monitors, activewindow: client })[key] });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(updates.length, 1);
    area = { ...bounds, x: -1900 };
    watch.refresh();
    assert.equal(updates[1].wins[0].x, 100);
  } finally { watch.stop(); }
  watch.refresh();
  assert.equal(updates.length, 2);
});

const flushPoll = () => new Promise((resolve) => setImmediate(resolve));

function watchHarness(t, read) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const updates = [];
  const errors = [];
  const report = console.error.bind(console);
  t.mock.method(console, 'error', (...args) => {
    if (args[0] === '[capri] Hyprland window watch:') errors.push(args);
    else report(...args); // Node 22 may also report experimental timer warnings.
  });
  const watch = startWindowWatch({
    overlay: { isDestroyed: () => false, getBounds: () => bounds },
    onUpdate: (data) => updates.push(data), read,
  });
  t.after(() => watch.stop());
  const tick = async () => { t.mock.timers.tick(500); await flushPoll(); };
  return { watch, updates, errors, tick };
}

const responses = () => ({ clients: [client], monitors, activewindow: client });

test('IPC failure clears stale windows, warns once and recovers automatically', async (t) => {
  let unavailable = false;
  const { updates, errors, tick } = watchHarness(t, async (key) => {
    if (unavailable) throw new Error('Hyprland is restarting');
    return responses()[key];
  });
  await flushPoll();
  assert.equal(updates[0].wins.length, 1);
  unavailable = true;
  await tick();
  assert.deepEqual(updates[1].wins, []);
  assert.equal(updates[1].fg, null);
  await tick();
  assert.equal(updates.length, 2, 'unchanged failure snapshots are not emitted again');
  assert.equal(errors.length, 1, 'a persistent failure does not flood the logs');
  unavailable = false;
  await tick();
  assert.deepEqual(updates[2], updates[0]);
  unavailable = true;
  await tick();
  assert.equal(errors.length, 2, 'a new outage is reported after recovery');
});

test('invalid compositor responses clear the snapshot and allow a later valid poll', async (t) => {
  let data = responses();
  const { updates, tick } = watchHarness(t, async (key) => data[key]);
  await flushPoll();
  for (const invalid of [{ clients: null }, { monitors: {} }, { clients: [null] }]) {
    data = { ...responses(), ...invalid };
    await tick();
    assert.deepEqual(updates.at(-1).wins, []);
    data = responses();
    await tick();
    assert.equal(updates.at(-1).wins[0].id, client.address);
  }
});

test('workspace switches remove old perches and track the newly visible windows', async (t) => {
  const other = { ...client, address: '0x456', workspace: { id: 2 } };
  let workspace = 1;
  const { updates, tick } = watchHarness(t, async (key) => ({
    clients: [client, other],
    monitors: [{ activeWorkspace: { id: workspace }, specialWorkspace: { id: 0 } }],
    activewindow: workspace === 1 ? client : other,
  })[key]);
  await flushPoll();
  assert.deepEqual(updates[0].wins.map((w) => w.id), [client.address]);
  workspace = 2;
  await tick();
  assert.deepEqual(updates[1].wins.map((w) => w.id), [other.address]);
  assert.equal(updates[1].fg, other.address);
});

test('slow queries do not overlap and unchanged windows do not emit duplicate updates', async (t) => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  let calls = 0;
  const { updates, tick } = watchHarness(t, async (key) => {
    calls++;
    await pending;
    return responses()[key];
  });
  await tick();
  await tick();
  assert.equal(calls, 3, 'one batch stays in flight while the compositor is slow');
  assert.equal(updates.length, 0);
  finish();
  await flushPoll();
  assert.equal(updates.length, 1);
  await tick();
  assert.equal(calls, 6);
  assert.equal(updates.length, 1);
});

test('stopping during an in-flight poll prevents late updates and further queries', async (t) => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  let calls = 0;
  const { watch, updates, tick } = watchHarness(t, async (key) => {
    calls++;
    await pending;
    return responses()[key];
  });
  watch.stop();
  finish();
  await flushPoll();
  await tick();
  watch.refresh();
  assert.equal(calls, 3);
  assert.deepEqual(updates, []);
});

// Alexandre's layout: XWayland puts DP-2 at 0,0 and the rotated HDMI beside it; Hyprland has
// the HDMI at 0,0 and DP-2 to its right, lowered.
const hyprMonitors = [
  { name: 'DP-2', x: 1080, y: 297, width: 2560, height: 1440, scale: 1, transform: 0 },
  { name: 'HDMI-A-2', x: 0, y: 0, width: 1920, height: 1080, scale: 1, transform: 3 },
];
const xScreens = [{ x: 0, y: 0, width: 2560, height: 1440 }, { x: 2560, y: 0, width: 1080, height: 1920 }];

test('Electron screens are matched with Hyprland monitors by size, rotation included', () => {
  assert.equal(monitorFor(xScreens[0], xScreens, hyprMonitors).name, 'DP-2');
  assert.equal(monitorFor(xScreens[1], xScreens, hyprMonitors).name, 'HDMI-A-2');
  const twins = [{ x: 0, y: 0, width: 1920, height: 1080 }, { x: 1920, y: 0, width: 1920, height: 1080 }];
  const mons = [{ name: 'B', x: 1920, y: 0, width: 1920, height: 1080, scale: 1, transform: 0 },
    { name: 'A', x: 0, y: 0, width: 1920, height: 1080, scale: 1, transform: 0 }];
  assert.deepEqual(twins.map((b) => monitorFor(b, twins, mons).name), ['A', 'B']);
});

function fakeHyprland(state) {
  const sent = [];
  const call = async (text) => {
    sent.push(text);
    if (text.startsWith('j/')) {
      const what = text.slice(2);
      if (what === 'getoption input:follow_mouse') return JSON.stringify({ int: state.followMouse });
      return JSON.stringify(state[what]);
    }
    const lua = /follow_mouse = (\d)/.exec(text);
    if (lua) state.followMouse = Number(lua[1]);
    const to = /focus\(\{ window = "address:(\w+)"/.exec(text);
    if (to) state.activewindow = { address: to[1] };
    return 'ok';
  };
  return { sent, call };
}

test('her overlay is moved onto its monitor, and the pointer read in it', async () => {
  const own = { address: '0xcap', pid: 7, title: 'Capri Overlay', mapped: true, at: [998, 212], size: [2560, 1440] };
  const state = { monitors: hyprMonitors, clients: [own], cursorpos: { x: 1100, y: 1700 } };
  const { sent, call } = fakeHyprland(state);
  const hypr = createHyprland({ pid: 7, call });
  assert.equal(await hypr.place(xScreens[0], xScreens[0], xScreens), true);
  assert.ok(sent.includes('dispatch hl.dsp.window.move({ x = 1080, y = 297, window = "address:0xcap" })'));
  assert.ok(!sent.some((s) => s.includes('resize')));
  assert.deepEqual(await hypr.cursor(), { x: 20, y: 1403, inside: true, screen: { x: 20, y: 1403 } });
  state.cursorpos = { x: 10, y: 10 }; // on the HDMI: outside her window, on Electron's second screen
  assert.deepEqual(await hypr.cursor(), { x: -1070, y: -287, inside: false, screen: { x: 2570, y: 10 } });
});

test('her chat takes the keyboard, holds follow_mouse at 2, then gives both back', async () => {
  const own = { address: '0xcap', pid: 7, title: 'Capri Overlay', mapped: true, at: [1080, 297], size: [2560, 1440] };
  const state = { monitors: hyprMonitors, clients: [own], activewindow: { address: '0xterm' }, followMouse: 1 };
  const { call } = fakeHyprland(state);
  const hypr = createHyprland({ pid: 7, call });
  await hypr.place(xScreens[0], xScreens[0], xScreens);
  await hypr.focus(true);
  assert.equal(state.activewindow.address, '0xcap');
  assert.equal(state.followMouse, 2);
  await hypr.focus(false);
  assert.equal(state.activewindow.address, '0xterm');
  assert.equal(state.followMouse, 1);
  // you went to another window yourself meanwhile: it keeps the keyboard
  await hypr.focus(true);
  state.activewindow = { address: '0xbrowser' };
  await hypr.focus(false);
  assert.equal(state.activewindow.address, '0xbrowser');
});

test('a follow_mouse other than 1 is left alone', async () => {
  const own = { address: '0xcap', pid: 7, title: 'Capri Overlay', mapped: true, at: [1080, 297], size: [2560, 1440] };
  const state = { monitors: hyprMonitors, clients: [own], activewindow: null, followMouse: 2 };
  const { sent, call } = fakeHyprland(state);
  const hypr = createHyprland({ pid: 7, call });
  await hypr.place(xScreens[0], xScreens[0], xScreens);
  await hypr.focus(true);
  await hypr.focus(false);
  assert.ok(!sent.some((s) => s.startsWith('eval') || s.startsWith('keyword')));
});

test('the window watch measures from where Hyprland put her, not from XWayland', () => {
  const own = { address: '0xcap', pid: 99, title: 'Capri Overlay', class: 'capri-desktop', mapped: true,
    at: [1080, 297], size: [2560, 1440], workspace: { id: 1 } };
  const win = { ...client, at: [1180, 397] };
  const result = snapshot([own, win], monitors, win, { x: 0, y: 0, width: 2560, height: 1440 }, 99);
  assert.deepEqual(result.wins.map((w) => [w.x, w.y]), [[100, 100]]);
});

test('a chat opened and given up at once leaves follow_mouse as it was', async () => {
  const own = { address: '0xcap', pid: 7, title: 'Capri Overlay', mapped: true, at: [1080, 297], size: [2560, 1440] };
  const state = { monitors: hyprMonitors, clients: [own], activewindow: { address: '0xterm' }, followMouse: 1 };
  const { call } = fakeHyprland(state);
  const slow = (text) => new Promise((r) => setTimeout(r, 5)).then(() => call(text));
  const hypr = createHyprland({ pid: 7, call: slow });
  await hypr.place(xScreens[0], xScreens[0], xScreens);
  await Promise.all([hypr.focus(true), hypr.focus(false)]);
  assert.equal(state.followMouse, 1);
  assert.equal(state.activewindow.address, '0xterm');
});
