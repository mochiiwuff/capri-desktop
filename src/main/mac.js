'use strict';

// macOS pieces the other modules share: her native helper (native/mac/CapriHelper.swift, what
// windows.ps1 and the PowerShell one-liners are on Windows), the PATH a Finder-launched app doesn't
// get, AppleScript, and the Accessibility permission she needs to press keys and move windows.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const MAC = process.platform === 'darwin';
const ROOT = path.resolve(__dirname, '..', '..');

// Installed, it sits in Capri.app/Contents/Resources; from a clone, where the build script puts it.
function helperPath() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'capri-helper'),
    path.join(ROOT, 'native', 'mac', 'build', 'capri-helper'),
  ].filter(Boolean);
  return candidates.find((file) => {
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) || null;
}

let warned = false;
function helper() {
  const file = MAC ? helperPath() : null;
  if (MAC && !file && !warned) {
    warned = true;
    console.error('[capri] no macOS helper: run `npm run build:mac-helper` (window tracking and app control are off)');
  }
  return file;
}

// One of the helper's one-off commands; resolves with what it printed.
function run(args, timeout = 10000) {
  const file = helper();
  if (!file) return Promise.reject(new Error('no helper'));
  return new Promise((resolve, reject) => {
    execFile(file, args.map(String), { timeout }, (err, out) => (err ? reject(err) : resolve(String(out).trim())));
  });
}

// Long-running: the window watch.
function spawnHelper(args) {
  const file = helper();
  return file ? spawn(file, args.map(String), { stdio: ['pipe', 'pipe', 'pipe'] }) : null;
}

function osascript(script, timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', script], { timeout }, (err, out) => (err ? reject(err) : resolve(String(out).trim())));
  });
}

// AppleScript's own quoting
const asString = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// Whether Capri may use Accessibility (pressing keys, moving other apps' windows). `prompt`: macOS
// asks you, and opens its settings at the right place.
async function trusted(prompt = false) {
  try {
    return JSON.parse(await run(prompt ? ['trusted', 'prompt'] : ['trusted'])).trusted === true;
  } catch {
    return false;
  }
}

// Opened from Finder or the Dock, an app gets a bare PATH (/usr/bin:/bin...): no Homebrew, no npm,
// so no `claude`, `codex`, `node` or `ollama`. The usual places at once, then your shell's own PATH.
function fixPath() {
  if (!MAC) return;
  const home = os.homedir();
  const usual = [
    '/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin',
    path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), path.join(home, '.npm-global', 'bin'),
    path.join(home, '.bun', 'bin'), path.join(home, '.volta', 'bin'), path.join(home, '.cargo', 'bin'),
    '/Applications/Ollama.app/Contents/Resources',
  ];
  const add = (dirs) => {
    const have = (process.env.PATH || '').split(':').filter(Boolean);
    process.env.PATH = [...new Set([...have, ...dirs.filter(Boolean)])].join(':');
  };
  add(usual);
  const shell = process.env.SHELL || '/bin/zsh';
  const mark = '__CAPRI_PATH__';
  execFile(shell, ['-ilc', `printf '${mark}%s${mark}' "$PATH"`], { timeout: 5000, env: { ...process.env, TERM: 'dumb' } }, (err, out) => {
    const found = new RegExp(`${mark}(.*?)${mark}`).exec(String(out || ''))?.[1];
    if (found) add(found.split(':'));
  });
}

// Writes a .command file and opens it: Terminal runs it in a window of its own, with no permission
// to ask for (unlike telling Terminal what to do through AppleScript).
function openInTerminal(name, script) {
  const file = path.join(os.tmpdir(), `${name}.command`);
  fs.writeFileSync(file, `#!/bin/zsh -l\n${script}\n`, { mode: 0o755 });
  fs.chmodSync(file, 0o755);
  return new Promise((resolve) => {
    execFile('/usr/bin/open', [file], (err) => resolve(!err));
  });
}

module.exports = { MAC, helper, run, spawnHelper, osascript, asString, trusted, fixPath, openInTerminal };
