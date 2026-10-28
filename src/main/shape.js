'use strict';

// Linux (X11 / XWayland): where her full-screen window takes the pointer, through capri-shape
// (native/capri-shape.c), which sets the window's XShape input region. Electron can only make the
// whole window click-through or not, and under XWayland it can't pass the pointer on to her either:
// so the window takes the pointer on her, her panel and her biochip, and lets it through elsewhere.

const { spawn } = require('node:child_process');

// startShape(win) -> { set(rects) } or null (not on X11, or no capri-shape: the caller falls back
// to a click-through window). rects: [[x, y, w, h], ...] in css px of the window.
function startShape(win) {
  if (process.platform !== 'linux') return null;
  const handle = win.getNativeWindowHandle();
  const id = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
  let child;
  try {
    child = spawn(process.env.CAPRI_SHAPE || 'capri-shape', [String(id)], { stdio: ['pipe', 'ignore', 'inherit'] });
  } catch {
    return null;
  }
  let alive = true;
  child.on('error', () => { alive = false; });
  child.on('exit', () => { alive = false; });
  child.stdin.on('error', () => { alive = false; });

  const set = (rects, scale = 1) => {
    if (!alive) return false;
    const line = rects
      .map((r) => r.map((n) => Math.round(n * scale)))
      .filter(([, , w, h]) => w > 0 && h > 0)
      .map((r) => r.join(' '))
      .join(';');
    child.stdin.write(`${line}\n`);
    return true;
  };
  set([]); // nothing until she says where she is: the desktop stays yours
  return {
    set,
    get alive() { return alive; },
    stop() { child.stdin.end(); },
  };
}

module.exports = { startShape };
