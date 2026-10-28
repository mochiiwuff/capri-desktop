'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshot, startWindowWatch } = require('../src/main/hyprland');

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
