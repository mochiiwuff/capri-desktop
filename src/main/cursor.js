'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { screen } = require('electron');

let linuxCursorAddon = null;

function loadLinuxAddon() {
  if (process.platform !== 'linux') return;

  const nodePath = path.join(__dirname, 'cursor-linux.node');
  const srcPath = path.join(__dirname, 'cursor-linux.c');

  if (!fs.existsSync(nodePath) && fs.existsSync(srcPath)) {
    try {
      // If node headers exist or can be located, compile cursor-linux.node
      const candidateHeaders = [
        path.join(process.env.HOME || '', '.cache/node-gyp/25.6.0/include/node'),
        '/home/linuxbrew/.linuxbrew/Cellar/node/25.6.0/include/node',
        '/usr/include/node',
      ].find((dir) => fs.existsSync(path.join(dir, 'node_api.h')));

      if (candidateHeaders) {
        execSync(`gcc -O2 -fPIC -shared "${srcPath}" -o "${nodePath}" -I"${candidateHeaders}" -lX11`, {
          stdio: 'ignore',
        });
      }
    } catch {
      // Compilation failed; fallback to screen.getCursorScreenPoint
    }
  }

  if (fs.existsSync(nodePath)) {
    try {
      linuxCursorAddon = require(nodePath);
    } catch (err) {
      console.warn('[capri] Failed to load cursor-linux.node:', err.message);
    }
  }
}

loadLinuxAddon();

function getCursorScreenPoint() {
  if (linuxCursorAddon) {
    try {
      const pt = linuxCursorAddon.getCursorPoint();
      if (pt && pt.ok) {
        return { x: pt.x, y: pt.y };
      }
    } catch {
      // fallback
    }
  }
  return screen.getCursorScreenPoint();
}

function cleanup() {
  if (linuxCursorAddon?.cleanup) {
    try {
      linuxCursorAddon.cleanup();
    } catch {
      // ignore
    }
  }
}

module.exports = {
  getCursorScreenPoint,
  cleanup,
};
