'use strict';

const path = require('node:path');
const readline = require('node:readline');
const { execFile, spawn } = require('node:child_process');
const { app } = require('electron');

const helper = () => app.isPackaged
  ? path.join(process.resourcesPath, 'capri-macos')
  : path.resolve(__dirname, '../../native/bin/capri-macos');

function run(command, ...args) {
  return new Promise((resolve, reject) => {
    execFile(helper(), [command, ...args.map(String)], { timeout: 15000, maxBuffer: 2 * 1024 * 1024 }, (err, out) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(out)); } catch (error) { reject(error); }
    });
  });
}

// No pixel conversion on macOS: Quartz window bounds and Electron bounds are both points.
function toOverlay(snap, bounds) {
  const wins = snap.wins.map((w) => ({ ...w, x: w.x - bounds.x, y: w.y - bounds.y }))
    .filter((w) => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0);
  return { fg: snap.fg, wins };
}

function startWindowWatch({ overlay, onUpdate }) {
  let child;
  let retry;
  let stopped = false;
  let restarts = 0;
  let previousApp = null;
  let last = null;
  const send = () => {
    if (last && !overlay.isDestroyed()) onUpdate(toOverlay(last, overlay.getBounds()));
  };
  const start = () => {
    if (stopped || overlay.isDestroyed()) return;
    const id = overlay.getMediaSourceId().split(':')[1];
    child = spawn(helper(), ['watch', id, String(process.pid)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (overlay.isDestroyed()) return;
      try {
        const snap = JSON.parse(line);
        if (Number.isInteger(snap.frontPid) && snap.frontPid > 0 && snap.frontPid !== process.pid) previousApp = snap.frontPid;
        last = snap;
        send();
      } catch { /* incomplete snapshot */ }
    });
    child.stderr.on('data', (d) => console.error('[capri] macOS window watch:', String(d).trim()));
    child.on('error', (err) => console.error('[capri] macOS helper:', err.message, '(run npm run native:mac)'));
    child.once('close', () => {
      lines.close();
      child = null;
      if (!stopped && restarts++ < 3) retry = setTimeout(start, 3000);
    });
  };
  start();
  return {
    restoreFocus() { return previousApp ? run('restore-focus', process.pid, previousApp) : Promise.resolve(); },
    refresh: send,
    stop() { stopped = true; clearTimeout(retry); child?.kill(); },
  };
}

module.exports = { run, startWindowWatch, toOverlay };
