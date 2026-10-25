'use strict';

// Feeds the overlay with the position of the other windows, so Capri can sit on them.
// On Windows a small PowerShell helper does the Win32 calls; we turn its physical pixels
// into the overlay's coordinates. On GNOME her shell extension (gnome/) connects to a socket of
// ours and sends them, with the pointer; anywhere else she does without.

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { screen } = require('electron');

// in the installed app it sits next to the app archive (asarUnpack), where PowerShell can read it
const SCRIPT = path.join(__dirname, 'windows.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

// only what overlaps Capri's screen
const onOverlay = (bounds) => (w) => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0;

function startWindowWatch({ overlay, onUpdate, onPointer, onKey }) {
  if (process.platform === 'linux') return startGnomeWatch({ overlay, onUpdate, onPointer, onKey });
  if (process.platform !== 'win32') return { live: false, stop() {} };

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
      const wins = snap.wins
        .map((w) => toOverlay(w, bounds))
        .filter(onOverlay(bounds));
      onUpdate({ fg: snap.fg, wins });
    });
    child.stderr.on('data', (d) => console.error('[capri] window watch:', String(d).trim()));
    child.on('exit', () => {
      child = null;
      if (!stopped && restarts++ < 3) setTimeout(start, 3000);
    });
  };

  start();
  return {
    live: true,
    stop() {
      stopped = true;
      child?.kill();
    },
  };
}

// The extension speaks in GNOME's logical pixels, the same as the overlay's on XWayland.
function startGnomeWatch({ overlay, onUpdate, onPointer, onKey }) {
  const file = path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), 'capri.sock');
  const watch = { live: false, stop() {} };
  let current = null;

  const server = net.createServer((sock) => {
    current?.destroy(); // one shell, one connection: a new one means the shell restarted
    current = sock;
    watch.live = true;
    sock.setEncoding('utf8');
    readline.createInterface({ input: sock }).on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (overlay.isDestroyed()) return;
      if (msg.p) return onPointer?.({ x: msg.p[0], y: msg.p[1] });
      if (msg.key) return onKey?.(msg.key);
      if (!Array.isArray(msg.wins)) return;
      const bounds = overlay.getBounds();
      const wins = msg.wins
        .map((w) => ({ id: w.id, x: w.x - bounds.x, y: w.y - bounds.y, w: w.w, h: w.h, max: w.max }))
        .filter(onOverlay(bounds));
      onUpdate({ fg: msg.fg, wins });
    });
    sock.on('error', () => {});
    sock.on('close', () => {
      if (current !== sock) return;
      current = null;
      watch.live = false;
      onUpdate({ fg: 0, wins: [] }); // no news is no windows: she'd sit on ghosts
    });
  });
  server.on('error', (err) => console.error('[capri] window watch:', err.message));
  fs.rmSync(file, { force: true }); // left behind by a crash
  server.listen(file, () => fs.chmodSync(file, 0o600));
  watch.stop = () => {
    current?.destroy();
    server.close();
    fs.rmSync(file, { force: true });
  };
  return watch;
}

module.exports = { startWindowWatch };
