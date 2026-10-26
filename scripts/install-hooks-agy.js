#!/usr/bin/env node
'use strict';

// Adds (or removes) the Capri hooks in ~/.gemini/config/hooks.json for Antigravity (AGY).
// Existing hooks are kept; a timestamped backup is written first.
//
//   node scripts/install-hooks-agy.js            install
//   node scripts/install-hooks-agy.js --uninstall
//   node scripts/install-hooks-agy.js --status

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EVENTS = [
  'SessionStart',
  'PreInvocation',
  'PreToolUse',
  'PostToolUse',
  'Stop',
];

const HOOK_KEY = 'capri-agy';
const MARK = 'capri-agy-hook.js';

function settingsPath() {
  const base = process.env.AGY_CONFIG_DIR || path.join(os.homedir(), '.gemini', 'config');
  return path.join(base, 'hooks.json');
}

function quoteIfNeeded(p) {
  return /\s/.test(p) ? `"${p}"` : p;
}

function hasNode() {
  try {
    return spawnSync('node', ['-v'], { windowsHide: true, timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
}

function hookCommand(eventType) {
  const script = path.resolve(__dirname, '..', 'hooks', 'capri-agy-hook.js')
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  if (!process.versions.electron) {
    return `${quoteIfNeeded(process.execPath)} ${quoteIfNeeded(script)} ${eventType}`;
  }
  if (hasNode()) {
    return `node ${quoteIfNeeded(script)} ${eventType}`;
  }
  return `ELECTRON_RUN_AS_NODE=1 ${quoteIfNeeded(process.execPath)} ${quoteIfNeeded(script)} ${eventType}`;
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${file} is not valid JSON (${err.message}). Fix it first, nothing was changed.`);
  }
}

function strip(settings) {
  delete settings[HOOK_KEY];
  for (const [key, val] of Object.entries(settings)) {
    if (val && typeof val === 'object' && (JSON.stringify(val).includes(MARK) || JSON.stringify(val).includes('capri-hook.js'))) {
      delete settings[key];
    }
  }
  return settings;
}

function write(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, `${file}.capri-backup-${stamp}`);
  }
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
}

function install() {
  const file = settingsPath();
  const original = readSettings(file);
  const before = JSON.stringify(original);
  const settings = strip(original);

  settings[HOOK_KEY] = {
    enabled: true,
    SessionStart: [
      { type: 'command', command: hookCommand('SessionStart'), timeout: 5 },
    ],
    PreInvocation: [
      { type: 'command', command: hookCommand('PreInvocation'), timeout: 5 },
    ],
    PreToolUse: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command: hookCommand('PreToolUse'), timeout: 5 }],
      },
    ],
    PostToolUse: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command: hookCommand('PostToolUse'), timeout: 5 }],
      },
    ],
    Stop: [
      { type: 'command', command: hookCommand('Stop'), timeout: 5 },
    ],
  };

  if (JSON.stringify(settings) !== before) write(file, settings);
  return { file, command: hookCommand('<Event>'), events: EVENTS.length };
}

function uninstall() {
  const file = settingsPath();
  if (!fs.existsSync(file)) return { file, removed: false };
  const settings = readSettings(file);
  const before = JSON.stringify(settings);
  strip(settings);
  const removed = JSON.stringify(settings) !== before;
  if (removed) write(file, settings);
  return { file, removed };
}

function status() {
  const file = settingsPath();
  try {
    const settings = readSettings(file);
    const entry = settings[HOOK_KEY];
    const installed = Boolean(entry && entry.enabled !== false && (JSON.stringify(entry).includes(MARK) || JSON.stringify(entry).includes('capri-hook.js')));
    const events = installed ? EVENTS.filter((e) => Boolean(entry[e])) : [];
    return { file, installed, events };
  } catch (err) {
    return { file, installed: false, events: [], error: err.message };
  }
}

module.exports = { install, uninstall, status, EVENTS };

if (require.main === module) {
  const arg = process.argv[2];
  try {
    if (arg === '--uninstall') {
      const r = uninstall();
      console.log(r.removed ? `Capri AGY hooks removed from ${r.file}` : `No Capri AGY hooks found in ${r.file}`);
    } else if (arg === '--status') {
      const r = status();
      console.log(r.installed ? `Installed (${r.events.join(', ')}) in ${r.file}` : `Not installed (${r.file})`);
    } else {
      const r = install();
      console.log(`Capri AGY hooks installed for ${r.events} events in ${r.file}`);
      console.log(`Command: ${r.command}`);
      console.log('Antigravity hooks are now active.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
