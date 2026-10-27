'use strict';

// Her eyes on your screen: one picture of it, taken only when you ask her to look (and only if
// her menu lets her, or you said yes just this once), handed to a local vision model through
// Ollama and then dropped. Nothing is saved, nothing leaves the PC.

const { desktopCapturer } = require('electron');

const MAX_SIDE = 1280; // enough for a model to read the screen, small enough to be quick
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// A JPEG of `display` (base64, no data: prefix), without her on it: her window is hidden from
// screen captures for the moment it's taken (Windows 10 2004+, macOS), so she doesn't comment
// on herself.
async function capture({ display, overlay }) {
  const { width, height } = display.size;
  const k = Math.min(1, MAX_SIDE / Math.max(width, height));
  const thumbnailSize = { width: Math.round(width * k), height: Math.round(height * k) };
  overlay?.setContentProtection(true);
  try {
    await settle(120); // the compositor taking it into account
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error('no picture of the screen');
    return source.thumbnail.toJPEG(78).toString('base64');
  } finally {
    overlay?.setContentProtection(false);
  }
}

module.exports = { capture };
