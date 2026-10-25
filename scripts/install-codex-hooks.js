#!/usr/bin/env node
'use strict';

// Separate from the Claude installer: neither agent's settings affect the other.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest',
  'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact',
  'SessionEnd', 'Interrupt',
];
const MARK = 'capri-codex-hook.js';
const STATUS = 'Capri desktop companion (capri-codex-hook.js)';
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const ownHook = (handler) => handler.type === 'command' && (handler.statusMessage === STATUS || String(handler.command || '').includes(MARK));

function hookCommand({ platform = process.platform, execPath = process.execPath,
  script = path.resolve(__dirname, '..', 'hooks', MARK), electron = Boolean(process.versions.electron) } = {}) {
  const file = script.replace(/\\/g, '/').replace('/app.asar/', '/app.asar.unpacked/');
  const executable = execPath.replace(/\\/g, '/');
  if (platform === 'win32') {
    // An encoded, literal PowerShell command avoids cmd/PowerShell double parsing
    // of spaces, quotes, $, and & in installation paths. No execution-policy change.
    const quote = (value) => `'${value.replace(/'/g, "''")}'`;
    const body = `${electron ? "$env:ELECTRON_RUN_AS_NODE='1'; " : ''}& ${quote(executable)} ${quote(file)}`;
    return `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(body, 'utf16le').toString('base64')}`;
  }
  const quote = (value) => `'${value.replace(/'/g, "'\\''")}'`;
  return `${electron ? 'ELECTRON_RUN_AS_NODE=1 ' : ''}${quote(executable)} ${quote(file)}`;
}

function createInstaller({ home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), command = hookCommand() } = {}) {
  const file = path.join(home, 'hooks.json');

  function read() {
    if (!fs.existsSync(file)) return {};
    const settings = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') || '{}');
    if (!object(settings) || (settings.hooks !== undefined && !object(settings.hooks))) throw new Error(`Invalid hooks configuration: ${file}`);
    for (const groups of Object.values(settings.hooks || {})) {
      if (!Array.isArray(groups) || groups.some((group) => !object(group) || !Array.isArray(group.hooks) || group.hooks.some((handler) => !object(handler)))) {
        throw new Error(`Invalid hook group in ${file}; nothing was changed.`);
      }
    }
    return settings;
  }

  function strip(settings) {
    for (const [event, groups] of Object.entries(settings.hooks || {})) {
      settings.hooks[event] = groups.flatMap((group) => {
        const handlers = group.hooks.filter((handler) => !ownHook(handler));
        return handlers.length === group.hooks.length ? [group] : handlers.length ? [{ ...group, hooks: handlers }] : [];
      });
      if (!settings.hooks[event].length) delete settings.hooks[event];
    }
    if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
    return settings;
  }

  function write(settings) {
    fs.mkdirSync(home, { recursive: true });
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.capri-backup-${Date.now()}-${process.pid}`);
    fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  }

  function install() {
    const settings = read();
    const before = JSON.stringify(settings);
    strip(settings);
    settings.hooks ||= {};
    for (const event of EVENTS) {
      const handler = { type: 'command', command, timeout: 2, statusMessage: STATUS };
      // Terminal hooks must finish before a short CLI session exits and cancels
      // background hooks. Synchronous starts also establish the turn first.
      if (['PreToolUse', 'PostToolUse', 'PermissionRequest', 'SubagentStart', 'SubagentStop', 'PreCompact'].includes(event)) handler.async = true;
      (settings.hooks[event] ||= []).push({ hooks: [handler] });
    }
    if (JSON.stringify(settings) !== before) write(settings);
    return { file, command, events: EVENTS.length };
  }

  function uninstall() {
    if (!fs.existsSync(file)) return { file, removed: false };
    const settings = read();
    const before = JSON.stringify(settings);
    strip(settings);
    const removed = JSON.stringify(settings) !== before;
    if (removed) write(settings);
    return { file, removed };
  }

  function status() {
    try {
      const events = Object.entries(read().hooks || {}).filter(([, groups]) => groups.some((group) => group.hooks.some(ownHook))).map(([name]) => name);
      return { file, installed: EVENTS.every((event) => events.includes(event)), events };
    } catch (err) {
      return { file, installed: false, events: [], error: err.message };
    }
  }

  return { install, uninstall, status };
}

module.exports = { createInstaller, hookCommand, EVENTS, ...createInstaller() };

if (require.main === module) {
  try {
    const installer = createInstaller();
    const arg = process.argv[2];
    if (arg === '--uninstall') {
      const result = installer.uninstall();
      console.log(result.removed ? `Capri Codex hooks removed from ${result.file}` : `No Capri Codex hooks found in ${result.file}`);
    } else if (arg === '--status') {
      const result = installer.status();
      if (result.error) throw new Error(result.error);
      console.log(`${result.installed ? 'Installed' : 'Not installed'} (${result.file})`);
    } else {
      const result = installer.install();
      console.log(`Capri hooks installed for ${result.events} Codex events in ${result.file}`);
      console.log('Start a new local Codex session and review/trust the hooks with /hooks.');
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
