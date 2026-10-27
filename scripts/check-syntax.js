#!/usr/bin/env node
'use strict';

// Cross-platform JavaScript syntax checker.
// Avoids shell glob expansion issues on Windows (cmd.exe/PowerShell).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DIRS = ['src/main', 'scripts', 'hooks'];
const FILES = ['src/preload.js'];

let failed = false;
let checked = 0;

function checkFile(fileRel) {
  if (!fileRel.endsWith('.js')) return;
  const fullPath = path.resolve(__dirname, '..', fileRel);
  if (!fs.existsSync(fullPath)) return;

  const res = spawnSync(process.execPath, ['--check', fullPath], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`[capri:syntax] Error in ${fileRel}:\n${res.stderr || res.stdout}`);
    failed = true;
  } else {
    checked++;
  }
}

for (const dir of DIRS) {
  const dirPath = path.resolve(__dirname, '..', dir);
  if (fs.existsSync(dirPath)) {
    for (const f of fs.readdirSync(dirPath)) {
      checkFile(path.join(dir, f));
    }
  }
}

for (const f of FILES) {
  checkFile(f);
}

console.log(`[capri:syntax] Verified syntax of ${checked} files successfully.`);
if (failed) process.exit(1);
