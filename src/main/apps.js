'use strict';

// Closing an app when you ask her to (chat.js), after you've confirmed with a click. The apps with
// a window, by name; closing one the way its own close button does (it can still ask you to save),
// and only if you ask again, forcing it. Windows, and Linux under X11.

const fs = require('node:fs');
const { execFile } = require('node:child_process');
const x11 = require('./x11');

// never these: the desktop itself, Windows' own pieces, her (Capri), Claude (she watches it) and
// Ollama (she talks through it)
const KEEP = new Set([
  'explorer', 'applicationframehost', 'textinputhost', 'shellexperiencehost', 'startmenuexperiencehost',
  'searchhost', 'searchapp', 'lockapp', 'dwm', 'capri', 'electron', 'claude', 'codex', 'ollama', 'ollama app',
  'capri-desktop', 'gnome-shell', 'plasmashell', 'nautilus-desktop',
]);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
};


function powershell(script, timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${script}`,
    ], { windowsHide: true, timeout }, (err, out) => (err ? reject(err) : resolve(out.trim())));
  });
}

// [{ name, process, ids }]: one per program with a window open ("AM Music", "Discord"...)
async function list() {
  if (process.platform === 'linux') return linuxList();
  if (process.platform !== 'win32') return [];
  const out = await powershell(
    'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | '
    + 'ForEach-Object { [pscustomobject]@{ id = $_.Id; name = $_.ProcessName; label = $_.Description } } | '
    + 'ConvertTo-Json -Compress',
  );
  const rows = [].concat(out ? JSON.parse(out) : []);
  const apps = new Map();
  for (const { id, name, label } of rows) {
    if (id === process.pid || KEEP.has(name.toLowerCase())) continue;
    const app = apps.get(name) || { name, process: name, label: label || '', ids: [] };
    app.ids.push(id);
    apps.set(name, app);
  }
  return [...apps.values()];
}

const simple = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The open app that `wanted` names, by its name or its description ("am music", "YouTube Music").
async function find(wanted) {
  const key = simple(wanted);
  if (key.length < 2) return null;
  const apps = await list();
  const score = (app) => {
    const names = [simple(app.name), simple(app.label)].filter(Boolean);
    if (names.includes(key)) return 3;
    if (names.some((n) => n.startsWith(key) || key.startsWith(n))) return 2;
    if (key.length >= 3 && names.some((n) => n.includes(key) || key.includes(n))) return 1;
    return 0;
  };
  const best = apps.map((app) => [score(app), app]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])[0];
  return best ? best[1] : null;
}

// Linux: by window class ("Spotify", "jetbrains-idea"), as the process is often only "java" or
// "electron"; its process name to find it by too
async function linuxList() {
  const apps = new Map();
  for (const { id, pid, wmClass } of (await x11.appWindows()) || []) {
    let name = '';
    try {
      name = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
    } catch {
      continue; // gone already
    }
    if (pid === process.pid || !wmClass || KEEP.has(name.toLowerCase()) || KEEP.has(wmClass.toLowerCase())) continue;
    // a snap's class is its name twice ("teams-for-linux_teams-for-linux")
    const app = apps.get(wmClass) || { name, process: wmClass, label: wmClass.split('_')[0], ids: [], wins: [] };
    if (!app.ids.includes(pid)) app.ids.push(pid);
    app.wins.push(id);
    apps.set(wmClass, app);
  }
  return [...apps.values()];
}

// Closes it like its close button would; `force` ends it outright (unsaved work is lost).
// Resolves with what's left: { running } (true when it stayed open, or hid in the tray).
async function close(name, { force = false } = {}) {
  const app = (await list()).find((a) => a.process === name);
  if (!app) return { running: false };
  if (process.platform === 'linux') {
    if (!force) for (const win of app.wins) await x11.closeWindow(win);
    else {
      for (const pid of app.ids) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // gone already, or not ours to end
        }
      }
    }
    await new Promise((r) => setTimeout(r, force ? 600 : 2500));
    return { running: app.ids.some(alive) };
  }
  const ids = app.ids.join(',');
  const out = await powershell(force
    ? `Stop-Process -Id ${ids} -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 600; `
      + `@(Get-Process -Id ${ids} -ErrorAction SilentlyContinue).Count`
    : `foreach ($p in @(Get-Process -Id ${ids} -ErrorAction SilentlyContinue)) { [void]$p.CloseMainWindow() }; `
      + 'Start-Sleep -Milliseconds 2500; '
      + `@(Get-Process -Name '${name.replace(/'/g, "''")}' -ErrorAction SilentlyContinue).Count`);
  return { running: Number(out) > 0 };
}

module.exports = { list, find, close, powershell };
