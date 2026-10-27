'use strict';

// Closing an app when you ask her to (chat.js), after you've confirmed with a click. The apps with
// a window, by name; closing one the way its own close button does (it can still ask you to save),
// and only if you ask again, forcing it. Supports Windows and Linux.

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// never these: the desktop itself, OS/window manager components, her (Capri), Claude (she watches it)
// and Ollama (she talks through it)
const KEEP = new Set([
  // Windows
  'explorer', 'applicationframehost', 'textinputhost', 'shellexperiencehost', 'startmenuexperiencehost',
  'searchhost', 'searchapp', 'lockapp', 'dwm',
  // Universal
  'capri', 'electron', 'claude', 'codex', 'antigravity', 'agy', 'ollama', 'ollama app',
  // Linux DEs & components
  'xfce4-panel', 'xfdesktop', 'xfwm4', 'xfsettingsd', 'x-session-manager',
  'gnome-shell', 'gnome-panel', 'mutter',
  'plasmashell', 'kwin', 'kwin_x11', 'kwin_wayland',
  'polybar', 'waybar', 'i3', 'sway', 'picom', 'compton', 'dunst',
  'systemsettings', 'xorg', 'x11',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getLinuxBinaryPath() {
  const isPackaged = __dirname.includes('.asar');
  return isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'main', 'windows-linux')
    : path.join(__dirname, 'windows-linux');
}

function powershell(script, timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${script}`,
    ], { windowsHide: true, timeout }, (err, out) => (err ? reject(err) : resolve(out.trim())));
  });
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function closeWindowX11(winId) {
  return new Promise((resolve, reject) => {
    const bin = getLinuxBinaryPath();
    if (bin && fs.existsSync(bin)) {
      execFile(bin, ['--close', String(winId)], { timeout: 3000 }, (err) => {
        if (!err) return resolve();
        execFile('wmctrl', ['-i', '-c', String(winId)], { timeout: 3000 }, (err2) => {
          if (!err2) resolve();
          else reject(err2);
        });
      });
    } else {
      execFile('wmctrl', ['-i', '-c', String(winId)], { timeout: 3000 }, (err) => {
        if (!err) resolve();
        else reject(err);
      });
    }
  });
}

async function listWindows() {
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

async function listLinux() {
  const bin = getLinuxBinaryPath();
  let rawRows = null;

  if (bin && fs.existsSync(bin)) {
    try {
      const out = await new Promise((resolve, reject) => {
        execFile(bin, ['--apps'], { timeout: 5000 }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });
      rawRows = JSON.parse(out || '[]');
    } catch {}
  }

  // Fallback to wmctrl if native binary was not available or failed
  if (!rawRows) {
    try {
      const out = await new Promise((resolve, reject) => {
        execFile('wmctrl', ['-l', '-p', '-x'], { timeout: 5000 }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });
      rawRows = [];
      for (const line of out.trim().split('\n')) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const winId = parseInt(parts[0], 16);
        const desktop = parseInt(parts[1], 10);
        const pid = parseInt(parts[2], 10) || 0;
        if (desktop === -1 && /panel|desktop|dock/i.test(parts[3])) continue;
        const wmClass = parts[3] || '';
        const [resName, resClass] = wmClass.includes('.') ? wmClass.split('.', 2) : [wmClass, wmClass];
        const title = parts.slice(5).join(' ');
        rawRows.push({ winId, pid, comm: '', resName, resClass, title });
      }
    } catch {
      rawRows = [];
    }
  }

  const apps = new Map();
  for (const row of rawRows) {
    const { winId, pid, comm, resName, resClass, title } = row;
    if (pid && pid === process.pid) continue;

    const procName = (comm || '').replace(/-bin$/, '') || (resClass || '').toLowerCase() || (resName || '').toLowerCase();
    const appName = resClass || procName || resName;
    const label = title || appName;

    if (!procName || KEEP.has(procName.toLowerCase()) || KEEP.has(appName.toLowerCase())) continue;

    const existing = apps.get(procName) || {
      name: appName,
      process: procName,
      label: label || '',
      ids: [],
      winIds: [],
    };

    if (pid && !existing.ids.includes(pid)) existing.ids.push(pid);
    if (winId && !existing.winIds.includes(winId)) existing.winIds.push(winId);

    // Prefer non-empty title for label if available
    if (title && (!existing.label || existing.label === existing.name)) {
      existing.label = title;
    }

    apps.set(procName, existing);
  }

  return [...apps.values()];
}

// [{ name, process, ids }]: one per program with a window open ("AM Music", "Discord"...)
async function list() {
  if (process.platform === 'win32') return listWindows();
  if (process.platform === 'linux') return listLinux();
  return [];
}

const simple = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The open app that `wanted` names, by its name or its description ("am music", "YouTube Music").
async function find(wanted) {
  const key = simple(wanted);
  if (key.length < 2) return null;
  const apps = await list();
  const score = (app) => {
    const names = [simple(app.name), simple(app.label), simple(app.process)].filter(Boolean);
    if (names.includes(key)) return 3;
    if (names.some((n) => n.startsWith(key) || key.startsWith(n))) return 2;
    if (key.length >= 3 && names.some((n) => n.includes(key) || key.includes(n))) return 1;
    return 0;
  };
  const best = apps.map((app) => [score(app), app]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])[0];
  return best ? best[1] : null;
}

// Closes it like its close button would; `force` ends it outright (unsaved work is lost).
// Resolves with what's left: { running } (true when it stayed open, or hid in the tray).
async function close(name, { force = false } = {}) {
  if (process.platform === 'win32') {
    const app = (await list()).find((a) => a.process === name);
    if (!app) return { running: false };
    const ids = app.ids.join(',');
    const out = await powershell(force
      ? `Stop-Process -Id ${ids} -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 600; `
        + `@(Get-Process -Id ${ids} -ErrorAction SilentlyContinue).Count`
      : `foreach ($p in @(Get-Process -Id ${ids} -ErrorAction SilentlyContinue)) { [void]$p.CloseMainWindow() }; `
        + 'Start-Sleep -Milliseconds 2500; '
        + `@(Get-Process -Name '${name.replace(/'/g, "''")}' -ErrorAction SilentlyContinue).Count`);
    return { running: Number(out) > 0 };
  }

  if (process.platform === 'linux') {
    const target = simple(name);
    const apps = await list();
    const app = apps.find((a) => simple(a.process) === target || simple(a.name) === target);
    if (!app) return { running: false };

    if (force) {
      for (const pid of app.ids) {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }
      await sleep(600);
      const running = app.ids.some((pid) => isPidAlive(pid));
      return { running };
    }

    // Graceful close: request windows close via X11 client message (_NET_CLOSE_WINDOW)
    let closedViaX11 = false;
    if (app.winIds && app.winIds.length > 0) {
      for (const winId of app.winIds) {
        try {
          await closeWindowX11(winId);
          closedViaX11 = true;
        } catch {}
      }
    }

    // Fallback: send SIGTERM if X11 close was not available
    if (!closedViaX11) {
      for (const pid of app.ids) {
        try { process.kill(pid, 'SIGTERM'); } catch {}
      }
    }

    // Wait 2500ms (same grace window as Windows PowerShell CloseMainWindow)
    await sleep(2500);
    const running = app.ids.some((pid) => isPidAlive(pid));
    return { running };
  }

  return { running: false };
}

module.exports = { list, find, close, powershell };
