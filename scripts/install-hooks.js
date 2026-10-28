#!/usr/bin/env node
'use strict';

// Adds (or removes) the Capri hooks in ~/.claude/settings.json.
// Existing settings and hooks are kept; a timestamped backup is written first.
//
//   node scripts/install-hooks.js            install
//   node scripts/install-hooks.js --uninstall
//   node scripts/install-hooks.js --status

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'SessionEnd',
];

const MARK = 'capri-hook.js';

function settingsPath() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'settings.json');
}

function hasNode() {
  try {
    return spawnSync('node', ['-v'], { windowsHide: true, timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
}

// Installed with Nix, the app lives under /nix/store, at a path that changes with every update and
// goes away with the old version: the hook is copied to a folder of yours that stays put, and
// settings.json points there. Copied again each time (refreshHook), so it follows the updates.
function stableHook(script) {
  if (!script.startsWith('/nix/store/')) return script;
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const target = path.join(base, 'capri', 'capri-hook.js');
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== fs.readFileSync(script, 'utf8')) {
      fs.copyFileSync(script, target);
      fs.chmodSync(target, 0o644); // the store's copy is read-only, and the next update has to overwrite it
    }
  } catch (err) {
    console.error('[capri] could not copy the hook out of the Nix store:', err.message);
    return script;
  }
  return target;
}

function hookScript() {
  return path.resolve(__dirname, '..', 'hooks', 'capri-hook.js')
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

// the copy outside the Nix store brought up to date with this version (main.js, at start)
function refreshHook() {
  stableHook(hookScript());
}

// In the installed app (the .exe) the hook sits next to the app archive (asarUnpack), where
// node can read it. With no node on the machine, Capri's own executable runs it as node.
function hookCommand() {
  const script = stableHook(hookScript()).replace(/\\/g, '/');
  if (process.versions.electron && !hasNode()) {
    return `ELECTRON_RUN_AS_NODE=1 "${process.execPath.replace(/\\/g, '/')}" "${script}"`;
  }
  return `node "${script}"`;
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    // Never overwrite a file we could not understand.
    throw new Error(`${file} is not valid JSON (${err.message}). Fix it first, nothing was changed.`);
  }
}

function isCapriGroup(group) {
  return Array.isArray(group?.hooks) && group.hooks.some((h) => String(h.command || '').includes(MARK));
}

function strip(settings) {
  if (!settings.hooks) return settings;
  for (const event of Object.keys(settings.hooks)) {
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;
    settings.hooks[event] = groups.filter((g) => !isCapriGroup(g));
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
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
  settings.hooks = settings.hooks || {};
  const command = hookCommand();
  for (const event of EVENTS) {
    settings.hooks[event] = settings.hooks[event] || [];
    settings.hooks[event].push({
      hooks: [{ type: 'command', command, async: true, timeout: 10 }],
    });
  }
  if (JSON.stringify(settings) !== before) write(file, settings); // already up to date: no backup spam
  return { file, command, events: EVENTS.length };
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
    const events = Object.entries(settings.hooks || {})
      .filter(([, groups]) => Array.isArray(groups) && groups.some(isCapriGroup))
      .map(([event]) => event);
    return { file, installed: events.length > 0, events };
  } catch (err) {
    return { file, installed: false, events: [], error: err.message };
  }
}

module.exports = { install, uninstall, status, refreshHook, EVENTS };

if (require.main === module) {
  const arg = process.argv[2];
  try {
    if (arg === '--uninstall') {
      const r = uninstall();
      console.log(r.removed ? `Capri hooks removed from ${r.file}` : `No Capri hooks found in ${r.file}`);
    } else if (arg === '--status') {
      const r = status();
      console.log(r.installed ? `Installed (${r.events.join(', ')}) in ${r.file}` : `Not installed (${r.file})`);
    } else {
      const r = install();
      console.log(`Capri hooks installed for ${r.events} events in ${r.file}`);
      console.log(`Command: ${r.command}`);
      console.log('Start a new Claude Code session for them to take effect.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
