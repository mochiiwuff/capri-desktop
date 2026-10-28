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
