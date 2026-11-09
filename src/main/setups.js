'use strict';

// Her chat on your windows and your routines (system.js): a window lost off the screens brought
// back, an app over to your other screen, your setups (the apps you had open and where their
// windows were, kept by name and opened again just so), and game mode (the processor at full power,
// the apps you named closed, everything as it was after).

const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { screen } = require('electron');
const apps = require('./apps');
const config = require('./config');
const launch = require('./launch');

// Windows' windows, in real pixels (Per-Monitor DPI aware, like the screens Electron gives in them).
const WINDOWS = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
public static class CapriWin {
  public delegate bool Each(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Placement { public int length, flags, show; public Point min, max; public Rect normal; }
  [DllImport("user32.dll")] static extern bool EnumWindows(Each f, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h, ref Placement p);
  [DllImport("user32.dll")] static extern bool SetWindowPlacement(IntPtr h, ref Placement p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromRect(ref Rect r, uint flags);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
  static Placement PlacementOf(IntPtr h) { var p = new Placement(); p.length = Marshal.SizeOf(p); GetWindowPlacement(h, ref p); return p; }
  // the windows you'd see in the taskbar: shown, titled, not owned by another, not a tool window, not on another desktop
  public static string List() {
    var lines = new StringBuilder();
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero || (GetWindowLong(h, -20) & 0x80) != 0) return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      var title = new StringBuilder(256); if (GetWindowText(h, title, 256) == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      bool min = IsIconic(h); Rect r; GetWindowRect(h, out r);
      if (min) r = PlacementOf(h).normal;
      // lost: its title bar (where you'd grab it) on no screen
      var bar = new Rect { L = r.L + 40, T = r.T + 2, R = r.R - 40, B = r.T + 30 };
      bool lost = bar.R <= bar.L || MonitorFromRect(ref bar, 0) == IntPtr.Zero;
      lines.Append(h.ToInt64() + "\\t" + pid + "\\t" + title.ToString().Replace("\\t", " ") + "\\t" + r.L + "," + r.T + "," + r.R + "," + r.B + "\\t" + (IsZoomed(h) ? 1 : 0) + "\\t" + (min ? 1 : 0) + "\\t" + (lost ? 1 : 0) + "\\n");
      return true;
    }, IntPtr.Zero);
    return lines.ToString();
  }
  // where it goes: its normal place (so a minimized one comes back there), maximized there if asked
  public static void Place(long handle, int x, int y, int w, int h, bool max) {
    var win = new IntPtr(handle); var p = PlacementOf(win);
    bool min = IsIconic(win);
    if (IsZoomed(win)) ShowWindow(win, 9);
    p.normal = new Rect { L = x, T = y, R = x + w, B = y + h };
    p.show = min ? 2 : max ? 3 : 1;
    p.flags = 0;
    SetWindowPlacement(win, ref p);
    if (!min && !max) SetWindowPos(win, IntPtr.Zero, x, y, w, h, 0x0044);
  }
}
"@; [void][CapriWin]::SetProcessDpiAwarenessContext([IntPtr](-4)); `;

// [{ handle, pid, process, path, title, rect: { x, y, w, h }, maximized, minimized, lost }]
async function windows() {
  const out = await apps.powershell(
    `${WINDOWS}$rows = [CapriWin]::List(); $names = @{}; `
    + '$ids = @($rows -split "\\n" | Where-Object { $_ } | ForEach-Object { [int](($_ -split "\\t")[1]) } | Sort-Object -Unique); '
    + 'if ($ids) { Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { $names[$_.Id] = "$($_.ProcessName)|$($_.Path)" } }; '
    + '$rows -split "\\n" | Where-Object { $_ } | ForEach-Object { $c = $_ -split "\\t"; $_ + [char]9 + $names[[int]$c[1]] }',
    20000,
  ).catch(() => '');
  return out.split(/\r?\n/).map((line) => line.split('\t')).filter((c) => c.length >= 8).map((c) => {
    const [l, t, r, b] = c[3].split(',').map(Number);
    const [process, path] = c[7].split('|');
    return {
      handle: c[0], pid: Number(c[1]), title: c[2], process: process || '', path: path || '',
      rect: { x: l, y: t, w: r - l, h: b - t }, maximized: c[4] === '1', minimized: c[5] === '1', lost: c[6] === '1',
    };
  });
}

// Never moved, kept or closed: her, the desktop's own windows, and what can't be opened again by
// its path (Store apps live in ApplicationFrameHost)
const NOT_MINE = /^(capri|electron|explorer|applicationframehost|textinputhost|shellexperiencehost|searchhost|startmenuexperiencehost|lockapp|systemsettings)$/i;

const physical = (d) => screen.dipToScreenRect(null, d.workArea);

// an app opened again: by the path it ran from, else by its name (Start menu, Steam...)
async function open(app) {
  if (app.path && fs.existsSync(app.path)) {
    spawn(app.path, [], { cwd: path.dirname(app.path), detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    return true;
  }
  const item = await launch.find(app.process).catch(() => null);
  return item ? launch.launch(item).then(() => true, () => false) : false;
}

function place(moves) {
  if (!moves.length) return Promise.resolve(true);
  return apps.powershell(`${WINDOWS}${moves.map((m) => `[CapriWin]::Place(${m.handle}, ${Math.round(m.x)}, ${Math.round(m.y)}, ${Math.round(m.w)}, ${Math.round(m.h)}, $${Boolean(m.max)}); `).join('')}"ok"`, 20000)
    .then((out) => out.trim() === 'ok', () => false);
}

// `rect` (real pixels) fit into the work area `area`, centered when it's moved from elsewhere
function fit(rect, area) {
  const w = Math.min(rect.w, area.width);
  const h = Math.min(rect.h, area.height);
  return { x: area.x + Math.round((area.width - w) / 2), y: area.y + Math.round((area.height - h) / 2), w, h };
}

// --- Lost windows, and the other screen ---------------------------------------------------------

// The windows whose title bar is on no screen, back in the middle of `display`: { moved: [titles] }
async function rescue(display) {
  const lost = (await windows()).filter((w) => w.lost && !NOT_MINE.test(w.process));
  const area = physical(display);
  await place(lost.map((w) => ({ handle: w.handle, ...fit(w.rect, area), max: w.maximized })));
  return { moved: lost.map((w) => w.process || w.title) };
}

// App `name`'s window over to the next screen (or screen `index`, 1 for the first): the same spot
// there, in proportion, maximized again if it was. { name, found, screens }
async function toScreen(name, index = null) {
  const all = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  if (all.length < 2) return { screens: all.length };
  const app = await apps.find(name).catch(() => null);
  if (!app) return { found: false, screens: all.length };
  const win = (await windows()).find((w) => app.ids.includes(w.pid));
  if (!win) return { found: false, screens: all.length };
  const areas = all.map(physical);
  const centre = { x: win.rect.x + win.rect.w / 2, y: win.rect.y + win.rect.h / 2 };
  const from = Math.max(0, areas.findIndex((a) => centre.x >= a.x && centre.x < a.x + a.width && centre.y >= a.y && centre.y < a.y + a.height));
  const to = Number.isInteger(index) && index >= 1 && index <= all.length ? index - 1 : (from + 1) % all.length;
  const a = areas[from];
  const b = areas[to];
  const kx = b.width / a.width;
  const ky = b.height / a.height;
  const w = Math.min(b.width, Math.round(win.rect.w * kx));
  const h = Math.min(b.height, Math.round(win.rect.h * ky));
  const x = Math.min(b.x + b.width - w, Math.max(b.x, b.x + Math.round((win.rect.x - a.x) * kx)));
  const y = Math.min(b.y + b.height - h, Math.max(b.y, b.y + Math.round((win.rect.y - a.y) * ky)));
  const ok = await place([{ handle: win.handle, x, y, w, h, max: win.maximized }]);
  return { name: app.name, found: ok, screens: all.length, screen: to + 1 };
}

// --- Setups -------------------------------------------------------------------------------------

const nameOf = (name) => String(name || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 30) || 'setup';

// The apps open now and where their windows are, kept under `name`, with the sound's level:
// { name, apps: [names] }
async function remember(name, volume) {
  const all = screen.getAllDisplays();
  const kept = [];
  for (const w of await windows()) {
    if (NOT_MINE.test(w.process) || !w.path || kept.some((k) => k.process === w.process)) continue;
    const centre = { x: w.rect.x + w.rect.w / 2, y: w.rect.y + w.rect.h / 2 };
    const display = all.find((d) => {
      const a = physical(d);
      return centre.x >= a.x && centre.x < a.x + a.width && centre.y >= a.y && centre.y < a.y + a.height;
    }) || screen.getPrimaryDisplay();
    const a = physical(display);
    // where it is in its screen, in proportion: the same spot even if that screen's scale changes
    kept.push({
      process: w.process, path: w.path, display: display.id, maximized: w.maximized,
      at: { x: (w.rect.x - a.x) / a.width, y: (w.rect.y - a.y) / a.height, w: w.rect.w / a.width, h: w.rect.h / a.height },
    });
  }
  const key = nameOf(name);
  config.save({ setups: { ...config.load().setups, [key]: { apps: kept, volume, saved: Date.now() } } });
  return { name: key, apps: kept.map((k) => k.process) };
}

const setupOf = (name) => (config.load().setups || {})[nameOf(name)] || null;
const setupNames = () => Object.keys(config.load().setups || {});

// Its apps opened if they aren't, and each window put back where it was (waiting for windows that
// take a while to show up). { name, placed: [names], failed: [names], volume }
async function launchSetup(name) {
  const setup = setupOf(name);
  if (!setup) return { missing: true, names: setupNames() };
  const running = new Set((await windows()).map((w) => w.process.toLowerCase()));
  for (const app of setup.apps) {
    if (!running.has(app.process.toLowerCase())) await open(app);
  }
  const placed = [];
  const until = Date.now() + 25000;
  let left = [...setup.apps];
  while (left.length && Date.now() < until) {
    const open = await windows();
    const moves = [];
    for (const app of left) {
      const win = open.find((w) => w.process.toLowerCase() === app.process.toLowerCase());
      if (!win) continue;
      const display = screen.getAllDisplays().find((d) => d.id === app.display) || screen.getPrimaryDisplay();
      const a = physical(display);
      moves.push({ handle: win.handle, x: a.x + app.at.x * a.width, y: a.y + app.at.y * a.height, w: app.at.w * a.width, h: app.at.h * a.height, max: app.maximized });
      placed.push(app.process);
    }
    await place(moves);
    left = left.filter((app) => !placed.includes(app.process));
    if (left.length) await new Promise((r) => setTimeout(r, 1500));
  }
  return { name: nameOf(name), placed, failed: left.map((a) => a.process), volume: setup.volume };
}

// --- Game mode ----------------------------------------------------------------------------------

const powercfg = (args) => new Promise((resolve) => {
  execFile('powercfg.exe', args, { windowsHide: true, timeout: 10000 }, (err, out) => resolve(err ? null : String(out)));
});

// On: the processor at full power (Windows' "High performance" plan), and the apps you named for
// it closed. Off: the plan and the apps as they were. { ok, plan (false: this PC only has the
// balanced plan), closed: [names], reopened: [names] }
async function gameMode(on) {
  const state = config.load().gameMode;
  if (on) {
    if (state) return { ok: true, already: true };
    const before = /([0-9a-f]{8}-[0-9a-f-]{27})/i.exec((await powercfg(['/getactivescheme'])) || '')?.[1] || null;
    const plan = (await powercfg(['/setactive', 'SCHEME_MIN'])) != null;
    const closed = [];
    const open = await windows();
    for (const name of config.load().gameClose || []) {
      const app = await apps.find(name).catch(() => null);
      if (!app) continue;
      const path = open.find((w) => app.ids.includes(w.pid))?.path || '';
      const res = await apps.close(app.process).catch(() => ({ running: true }));
      if (!res.running) closed.push({ name: app.name, path });
    }
    config.save({ gameMode: { plan: before, closed, since: Date.now() } });
    return { ok: true, plan, closed: closed.map((c) => c.name) };
  }
  if (!state) return { ok: false, notOn: true };
  if (state.plan) await powercfg(['/setactive', state.plan]);
  const reopened = [];
  for (const c of state.closed || []) {
    if (await open({ process: c.name, path: c.path })) reopened.push(c.name);
  }
  config.save({ gameMode: null });
  return { ok: true, reopened };
}

// The apps game mode closes, as you named them (the names she understood): { apps }
function setGameClose(names) {
  const list = [...new Set(names.map((n) => String(n).trim().slice(0, 40)).filter((n) => n.length >= 2))].slice(0, 8);
  config.save({ gameClose: list });
  return { apps: list };
}

module.exports = { rescue, toScreen, remember, launchSetup, setupNames, gameMode, setGameClose };
