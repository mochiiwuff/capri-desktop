'use strict';

const { execFile } = require('node:child_process');

function query(command) {
  return new Promise((resolve, reject) => {
    execFile('hyprctl', ['-j', command], { timeout: 2000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(out)); } catch (error) { reject(error); }
    });
  });
}

// Hyprland reports logical desktop coordinates. Exclude other workspaces and Capri;
// never send window titles or process details to the renderer.
function snapshot(clients, monitors, active, bounds, pid = process.pid) {
  const visible = new Set(monitors.flatMap((m) => [m.activeWorkspace?.id, m.specialWorkspace?.id])
    .filter((id) => Number.isInteger(id) && id !== 0));
  const wins = clients.filter((c) => c.mapped && !c.hidden && c.pid !== pid
    && !/^capri$/i.test(c.class || '') && (c.pinned || visible.has(c.workspace?.id)))
    .filter((c) => Array.isArray(c.at) && Array.isArray(c.size)
      && [...c.at, ...c.size].every(Number.isFinite) && c.size[0] > 0 && c.size[1] > 0)
    .map((c) => ({ id: c.address, x: c.at[0] - bounds.x, y: c.at[1] - bounds.y,
      w: c.size[0], h: c.size[1], max: Boolean(c.fullscreen) }))
    .filter((w) => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0);
  return { fg: active?.address || null, taskbar: false, ai: [], game: null, usb: [], plug: null, wins };
}

function startWindowWatch({ overlay, onUpdate, read = query }) {
  let stopped = false;
  let busy = false;
  let last = null;
  let previous = '';
  let warned = false;
  function send() {
    if (stopped || !last || overlay.isDestroyed()) return;
    const data = snapshot(...last, overlay.getBounds());
    const serialized = JSON.stringify(data);
    if (serialized !== previous) { previous = serialized; onUpdate(data); }
  }
  async function poll() {
    if (stopped || busy) return;
    busy = true;
    try {
      last = await Promise.all(['clients', 'monitors', 'activewindow'].map(read));
      if (!Array.isArray(last[0]) || !Array.isArray(last[1])) throw new Error('invalid Hyprland snapshot');
      send();
      warned = false;
    } catch (err) {
      if (!stopped && !warned) console.error('[capri] Hyprland window watch:', err.message);
      warned = true;
      last = [[], [], null];
      send(); // remove stale perches after a compositor/IPC failure
    } finally { busy = false; }
  }
  const timer = setInterval(poll, 500);
  poll();
  return { stop() { stopped = true; clearInterval(timer); }, refresh() { previous = ''; send(); } };
}

module.exports = { snapshot, startWindowWatch };
