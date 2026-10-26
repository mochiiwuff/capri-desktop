'use strict';

// Feeds the overlay with the position of other windows, so Capri can sit on them.
// - On Windows: PowerShell helper using Win32 DWM API
// - On macOS: AppleScript helper querying System Events for UI windows

const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { screen } = require('electron');

// in the installed app scripts sit next to the app archive (asarUnpack)
const SCRIPT_WIN = path.join(__dirname, 'windows.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const SCRIPT_MAC = path.join(__dirname, 'windows.applescript').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

function startWindowWatch({ overlay, onUpdate }) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return { stop() {} };

  let child = null;
  let stopped = false;
  let restarts = 0;

  const toOverlay = (win, bounds) => {
    if (process.platform === 'win32') {
      const dip = screen.screenToDipRect(null, { x: win.x, y: win.y, width: win.w, height: win.h });
      return { id: win.id, x: dip.x - bounds.x, y: dip.y - bounds.y, w: dip.width, h: dip.height, max: win.max };
    }
    // On macOS, AppleScript coordinates are already in points (DIPs)
    return { id: win.id, x: win.x - bounds.x, y: win.y - bounds.y, w: win.w, h: win.h, max: win.max };
  };

  const handleLine = (line) => {
    let snap;
    try {
      snap = JSON.parse(line);
    } catch {
      return;
    }
    if (overlay.isDestroyed()) return;
    const bounds = overlay.getBounds();
    const wins = (snap.wins || [])
      .map((w) => toOverlay(w, bounds))
      // only what overlaps Capri's screen
      .filter((w) => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0);
    onUpdate({ fg: snap.fg, wins });
  };

  const start = () => {
    if (process.platform === 'win32') {
      const handle = overlay.getNativeWindowHandle();
      const self = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
      child = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', SCRIPT_WIN, String(self), String(process.pid),
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

      readline.createInterface({ input: child.stdout }).on('line', handleLine);
      child.stderr.on('data', (d) => console.error('[capri] window watch:', String(d).trim()));
    } else if (process.platform === 'darwin') {
      child = spawn('osascript', [SCRIPT_MAC, String(process.pid)], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // osascript outputs log statements to stderr
      readline.createInterface({ input: child.stderr }).on('line', handleLine);
      child.stdout.on('data', (d) => {
        const text = String(d).trim();
        if (text) handleLine(text);
      });
    }

    child.on('exit', () => {
      child = null;
      if (!stopped && restarts++ < 5) setTimeout(start, 3000);
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

module.exports = { startWindowWatch };
