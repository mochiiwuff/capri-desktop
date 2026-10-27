'use strict';

// Feeds the overlay with the position of the other windows, so Capri can sit on them. On Windows a
// small PowerShell helper does the Win32 calls, on Linux the X server is asked (x11.js); we turn
// their physical pixels into the overlay's coordinates.

const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { screen } = require('electron');
const x11 = require('./x11');

// in the installed app it sits next to the app archive (asarUnpack), where PowerShell can read it
const SCRIPT = path.join(__dirname, 'windows.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

// only what overlaps Capri's screen
const onScreen = (bounds) => (w) => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0;

function startWindowWatch({ overlay, onUpdate }) {
  if (process.platform === 'linux') return linuxWatch({ overlay, onUpdate });
  if (process.platform !== 'win32') return { stop() {} };

  let child = null;
  let stopped = false;
  let restarts = 0;

  const handle = overlay.getNativeWindowHandle();
  const self = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));

  const toOverlay = (win, bounds) => {
    const dip = screen.screenToDipRect(null, { x: win.x, y: win.y, width: win.w, height: win.h });
    return { id: win.id, x: dip.x - bounds.x, y: dip.y - bounds.y, w: dip.width, h: dip.height, max: win.max };
  };

  const start = () => {
    child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', SCRIPT, String(self), String(process.pid),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let snap;
      try {
        snap = JSON.parse(line);
      } catch {
        return;
      }
      if (overlay.isDestroyed()) return;
      const bounds = overlay.getBounds();
      const wins = snap.wins.map((w) => toOverlay(w, bounds)).filter(onScreen(bounds));
      onUpdate({ fg: snap.fg, taskbar: Boolean(snap.taskbar), wins });
    });
    child.stderr.on('data', (d) => console.error('[capri] window watch:', String(d).trim()));
    child.on('exit', () => {
      child = null;
      if (!stopped && restarts++ < 3) setTimeout(start, 3000);
    });
  };

  start();
  return {
    stop() {
      stopped = true;
      child?.kill();
    },
  };
}

// Linux: the same snapshot, asked of the X server every 150 ms, passed on when it changes
function linuxWatch({ overlay, onUpdate }) {
  const handle = overlay.getNativeWindowHandle();
  const self = handle.length >= 8 ? Number(handle.readBigUInt64LE(0)) : handle.readUInt32LE(0);
  let last = '';
  let busy = false;
  const timer = setInterval(async () => {
    if (busy || overlay.isDestroyed()) return;
    busy = true;
    const snap = await x11.windowSnapshot(self).catch(() => null);
    busy = false;
    if (!snap || overlay.isDestroyed()) return;
    const json = JSON.stringify(snap);
    if (json === last) return;
    last = json;
    const bounds = overlay.getBounds();
    const scale = screen.getPrimaryDisplay().scaleFactor; // X11: one scale for every screen
    const wins = snap.wins
      .map((w) => ({ id: w.id, x: w.x / scale - bounds.x, y: w.y / scale - bounds.y, w: w.w / scale, h: w.h / scale, max: w.max }))
      .filter(onScreen(bounds));
    onUpdate({ fg: snap.fg, taskbar: false, wins });
  }, 150);
  return { stop: () => clearInterval(timer) };
}

module.exports = { startWindowWatch };
