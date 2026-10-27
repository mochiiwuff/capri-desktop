#!/usr/bin/env node
'use strict';

// Compiles the native Linux X11 window watcher helper if running on Linux.
// Requires gcc and libx11-dev (Xlib development headers).

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function buildLinuxHelper() {
  if (process.platform !== 'linux') {
    return;
  }

  const src = path.join(__dirname, '..', 'src', 'main', 'windows-linux.c');
  const bin = path.join(__dirname, '..', 'src', 'main', 'windows-linux');

  if (!fs.existsSync(src)) {
    console.error(`[capri:build] Source file not found: ${src}`);
    process.exit(1);
  }

  console.log('[capri:build] Compiling Linux X11 window watcher helper (windows-linux)...');
  try {
    execSync(`gcc -Wall -Wextra -O2 "${src}" -lX11 -o "${bin}"`, { stdio: 'inherit' });
    fs.chmodSync(bin, 0o755);
    console.log('[capri:build] Successfully built windows-linux helper.');
  } catch (err) {
    console.warn('[capri:build] Failed to compile native X11 helper. Ensure gcc and libx11-dev are installed.');
    console.warn('[capri:build] Capri will fall back to wmctrl/xprop if available.');
  }
}

if (require.main === module) {
  buildLinuxHelper();
}

module.exports = { buildLinuxHelper };
