#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop', 'SessionEnd', 'Interrupt', 'PreCompact', 'SubagentStart', 'SubagentStop'];
const MARK = 'capri-codex-hook.js';

function settingsPath() {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'hooks.json');
}

function status() {
  const file = settingsPath();
  try {
    const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const events = Object.entries(settings.hooks || {}).filter(([, groups]) =>
      Array.isArray(groups) && groups.some((g) => g?.hooks?.some((h) => String(h?.command || '').includes(MARK))))
      .map(([event]) => event);
    return { file, installed: EVENTS.every((event) => events.includes(event)), events };
  } catch (err) {
    return { file, installed: false, events: [], error: err.message };
  }
}

function configure(uninstall = false) {
  const file = settingsPath();
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const settings = before.trim() ? JSON.parse(before) : {};
  const original = JSON.stringify(settings);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)
      || (settings.hooks !== undefined && (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)))) {
    throw new Error(`Invalid hooks configuration in ${file}; nothing changed.`);
  }
  settings.hooks ||= {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups) || groups.some((g) => !g || !Array.isArray(g.hooks))) {
      throw new Error(`Invalid hook groups in ${file}; nothing changed.`);
    }
    // Remove only our command, even if it shares a group with another hook.
    settings.hooks[event] = groups.flatMap((g) => {
      const hooks = g.hooks.filter((h) => !String(h?.command || '').includes(MARK));
      if (hooks.length === g.hooks.length) return [g];
      return hooks.length ? [{ ...g, hooks }] : [];
    });
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  const script = path.resolve(__dirname, '..', 'hooks', MARK)
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`).replace(/\\/g, '/');
  const command = `node "${script}"`;
  if (!uninstall) {
    for (const event of EVENTS) {
      settings.hooks[event] ||= [];
      // Synchronous, bounded delivery keeps activity/approval/completion ordered.
      settings.hooks[event].push({ hooks: [{ type: 'command', command, timeout: 3 }] });
    }
  }
  const after = JSON.stringify(settings, null, 2) + '\n';
  if ((!uninstall || before) && JSON.stringify(settings) !== original) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (before) fs.copyFileSync(file, `${file}.capri-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.writeFileSync(file, after);
  }
  return { file, command };
}

module.exports = { configure, EVENTS, status, install: () => configure(), uninstall: () => configure(true) };
if (require.main === module) {
  try {
    const uninstall = process.argv.includes('--uninstall');
    const { file } = configure(uninstall);
    console.log(`Capri Codex hooks ${uninstall ? 'removed from' : 'installed in'} ${file}`);
    if (!uninstall) console.log('Restart Codex and review/trust the hooks when prompted.');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
