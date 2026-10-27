'use strict';

// Feeds the overlay with the position of the other windows (Windows & Linux), so Capri can
// sit on them. A small PowerShell helper does the Win32 calls on Windows; a native X11 helper
// does the calls on Linux. We turn their physical pixels into the overlay's coordinates.

const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const { spawn, execSync } = require('node:child_process');
const { screen } = require('electron');

const SCRIPT_WIN = path.join(__dirname, 'windows.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const BIN_LINUX = path.join(__dirname, 'windows-linux').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const SRC_LINUX = path.join(__dirname, 'windows-linux.c');

function ensureLinuxBinary() {
  if (process.platform !== 'linux') return;
  if (!fs.existsSync(BIN_LINUX) && fs.existsSync(SRC_LINUX)) {
    try {
      execSync(`gcc -O2 "${SRC_LINUX}" -lX11 -o "${BIN_LINUX}"`, { stdio: 'ignore' });
    } catch {
      // compilation failed; fallback will be used if binary does not exist
    }
  }
}

function startWindowWatch({ overlay, onUpdate }) {
  if (process.platform !== 'win32' && process.platform !== 'linux') return { stop() {} };

  let child = null;
  let stopped = false;
  let restarts = 0;
  let fallbackTimer = null;

  const handle = overlay.getNativeWindowHandle();
  const self = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));

  const toOverlay = (win, bounds) => {
    const dip = typeof screen.screenToDipRect === 'function'
      ? screen.screenToDipRect(null, { x: win.x, y: win.y, width: win.w, height: win.h })
      : { x: win.x, y: win.y, width: win.w, height: win.h };
    return { id: win.id, x: dip.x - bounds.x, y: dip.y - bounds.y, w: dip.width, h: dip.height, max: win.max };
  };

  const handleSnap = (snap) => {
    if (overlay.isDestroyed()) return;
    const bounds = overlay.getBounds();
    const wins = snap.wins
      .map((w) => toOverlay(w, bounds))
      // only what overlaps Capri's screen
      .filter((w) => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0);
    onUpdate({ fg: snap.fg, taskbar: Boolean(snap.taskbar), wins });
  };

  const startFallbackLinux = () => {
    let lastSnapJson = '';
    const poll = () => {
      if (stopped || overlay.isDestroyed()) return;
      try {
        const activeOut = execSync('xprop -root _NET_ACTIVE_WINDOW 2>/dev/null', { timeout: 400 }).toString();
        const activeMatch = activeOut.match(/# (0x[0-9a-fA-F]+)/);
        const fg = activeMatch ? parseInt(activeMatch[1], 16) : 0;

        const stackOut = execSync('xprop -root _NET_CLIENT_LIST_STACKING 2>/dev/null', { timeout: 400 }).toString();
        const stackMatches = [...stackOut.matchAll(/(0x[0-9a-fA-F]+)/g)].map((m) => parseInt(m[1], 16));

        const wmctrlOut = execSync('wmctrl -l -G 2>/dev/null', { timeout: 400 }).toString();
        const winMap = new Map();
        for (const line of wmctrlOut.trim().split('\n')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 6) {
            const id = parseInt(parts[0], 16);
            if (id === Number(self)) continue;
            const desk = parseInt(parts[1], 10);
            if (desk === -1) continue;
            const x = parseInt(parts[2], 10);
            const y = parseInt(parts[3], 10);
            const w = parseInt(parts[4], 10);
            const h = parseInt(parts[5], 10);
            if (w >= 200 && h >= 120) {
              winMap.set(id, { id, x, y, w, h, max: false });
            }
          }
        }

        const wins = [];
        const ordered = stackMatches.length ? stackMatches.slice().reverse() : [...winMap.keys()];
        for (const id of ordered) {
          const w = winMap.get(id);
          if (w) wins.push(w);
        }
        const snap = { fg, wins };
        const snapJson = JSON.stringify(snap);
        if (snapJson !== lastSnapJson) {
          lastSnapJson = snapJson;
          handleSnap(snap);
        }
      } catch {
        // ignore transient errors
      }
      fallbackTimer = setTimeout(poll, 250);
    };
    poll();
  };

  const start = () => {
    if (process.platform === 'linux') {
      ensureLinuxBinary();
      if (!fs.existsSync(BIN_LINUX)) {
        startFallbackLinux();
        return;
      }
      child = spawn(BIN_LINUX, [String(self), String(process.pid)], { stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
      child = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', SCRIPT_WIN, String(self), String(process.pid),
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    }

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let snap;
      try {
        snap = JSON.parse(line);
      } catch {
        return;
      }
      handleSnap(snap);
    });
    child.stderr.on('data', (d) => console.error('[capri] window watch:', String(d).trim()));
    child.on('exit', () => {
      child = null;
      if (!stopped) {
        if (restarts++ < 3) {
          setTimeout(start, 3000);
        } else if (process.platform === 'linux') {
          startFallbackLinux();
        }
      }
    });
  };

  start();
  return {
    stop() {
      stopped = true;
      clearTimeout(fallbackTimer);
      child?.kill();
    },
  };
}

module.exports = { startWindowWatch };
