'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, protocol, net, shell, globalShortcut, nativeImage, Notification,
  clipboard, ClipboardItem, dialog, powerMonitor, desktopCapturer,
} = require('electron');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');

const config = require('./config');
const { TRAY, LANGS } = require('./labels');
const { createBridge } = require('./bridge');
const { startWindowWatch } = require('./windows');
const hyprland = require('./hyprland');
const llm = require('./llm');
const ollama = require('./ollama');
const setup = require('./setup');
const { inspectPlatform } = require('./platform');
const { platformText } = require('./platform-labels');
const { storageText } = require('./storage-labels');
const { createJsonStore } = require('./json-store');
const apps = require('./apps');
const launch = require('./launch');
const files = require('./files');
const { ASSISTANTS, assistant } = require('./assistants');
const activeAssistant = () => assistant(config.load().assistant); // Claude Code or Codex
const activeHooks = () => activeAssistant().hooks;
const demoSteps = require('../../scripts/demo-sequence');

// Native Wayland cannot position this desktop overlay or forward pointer events.
// Use XWayland until a layer-shell implementation is available.
if (process.platform === 'linux' && !app.commandLine.hasSwitch('ozone-platform')) {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}
if (process.platform === 'linux') app.commandLine.appendSwitch('class', 'capri');

const ROOT = path.resolve(__dirname, '..', '..');
const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.CAPRI_PORT) || 47823;
const SOUND_EXT = /\.(mp3|wav|ogg|m4a)$/i;

const OLLAMA_SITE = 'https://ollama.com';

protocol.registerSchemesAsPrivileged([
  { scheme: 'capri', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let overlay = null;
let tray = null;
let trayMenu = null; // also what she opens when you right-click her
let demoTimer = null;
let windowWatch = null;
// under Hyprland: her window placed, the pointer read and the keyboard handed over by the compositor
const hypr = process.platform === 'linux' && hyprland.socketPath() ? hyprland.createHyprland() : null;
let pointerTimer = null;
let hyprEvents = null;
// the watcher only speaks when something changes: the overlay asks for this when it (re)loads
let lastWindows = null;
let platformInfo = null;
let diagnosticOpen = false;
let chatModels = null; // the provider's models, as last seen (null: not reached)
let chatError = null;  // why not, when the provider said
let chatErrorCode = null; // 'nokey' or 'nourl': what her setup should ask for
// Ollama's cloud, as last seen: your account ({ name } or { signin }) and the models free with it
let cloud = { at: 0, account: null, free: [] };
const chats = new Map(); // id -> AbortController of an answer being streamed

const userSoundsDir = () => path.join(app.getPath('userData'), 'sounds');

// Her memory of your chats, across restarts: { history: [{ role, content }], claude: Claude Code's session }
const memoryFile = () => path.join(app.getPath('userData'), 'memory.json');
const memoryStore = createJsonStore({ file: memoryFile, defaults: { history: [], claude: null }, normalize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value.history && !Array.isArray(value.history))) {
    throw new Error('Invalid memory');
  }
  return value;
} });
function readMemory() { return memoryStore.load(); }
function saveMemory(patch, options) {
  try {
    memoryStore.write({ ...readMemory(), ...patch }, options);
    return true;
  } catch { notifyStorage('failed'); return false; }
}

const storageNotices = new Set();
function notifyStorage(reason) {
  if (!app.isReady() || storageNotices.has(reason)) return;
  storageNotices.add(reason);
  const t = storageText(resolveLang(config.load().lang));
  dialog.showMessageBox({ type: 'warning', title: t.title, message: t[reason] || t.failed }).catch(() => {});
}

function saveConfig(patch, renderer = false) {
  try {
    if (renderer) config.rendererPatch(patch); else config.save(patch);
    return true;
  } catch (err) {
    if (err.code && err.code !== 'EINVALIDJSON') notifyStorage(config.status().blocked ? 'blocked' : 'failed');
    return false;
  }
}
function forgetChats() {
  if (!saveMemory({ history: [], claude: null }, { discardBackupHistory: true })) return;
  llm.resetClaude();
  sendCommand('forget');
}

// capri://app/...        -> files of this repo
// capri://usersounds/... -> the user's own sound overrides
function serveProtocol() {
  protocol.handle('capri', (request) => {
    const url = new URL(request.url);
    const base = url.host === 'usersounds' ? userSoundsDir() : ROOT;
    const target = path.resolve(base, '.' + decodeURIComponent(url.pathname));
    if (target !== base && !target.startsWith(base + path.sep)) {
      return new Response('forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

// Your screens. In --dev with CAPRI_SCREENS=2 and only one screen, it's cut in two halves side by
// side, to try her going from one to the other without a second monitor.
function displays() {
  const real = screen.getAllDisplays();
  if (!DEV || process.env.CAPRI_SCREENS !== '2' || real.length > 1) return real;
  const d = screen.getPrimaryDisplay();
  const half = (r, i) => ({ x: r.x + Math.floor(r.width / 2) * i, y: r.y, width: Math.floor(r.width / 2), height: r.height });
  return [0, 1].map((i) => ({ ...d, id: d.id * 10 + i + 1, bounds: half(d.bounds, i), workArea: half(d.workArea, i), size: { width: Math.floor(d.size.width / 2), height: d.size.height } }));
}

// The screen a point (DIP) is on, else the nearest one.
function displayAt(p) {
  const all = displays();
  const inside = all.find(({ bounds: b }) => p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height);
  if (inside) return inside;
  const near = screen.getDisplayNearestPoint(p);
  return all.find((d) => d.id === near.id) || all[0];
}

function targetDisplay() {
  const { displayId } = config.load();
  const all = displays();
  return all.find((d) => d.id === displayId) || all.find((d) => d.id === screen.getPrimaryDisplay().id) || all[0];
}

// Her window over to another screen (she's on her way there, screens.js). Set twice: going to a
// screen with another scale, Windows resizes the window once it lands there.
function moveOverlay(id) {
  if (!displays().some((d) => d.id === id)) return null;
  if (!saveConfig({ displayId: id })) return null;
  fitOverlay();
  const { area } = overlayArea();
  overlay.setBounds(area);
  windowWatch?.refresh();
  rebuildTray();
  return area;
}

// Her window: the work area, or the whole screen while she rests on the taskbar (her legs hang
// over it), less its top row of pixels: a window on top covering the whole screen is a fullscreen
// app to Windows (animated wallpapers pause, notifications wait). `gap`: how much of her window is
// below the top of the taskbar (0, or its height).
function overlayArea() {
  const { workArea, bounds } = targetDisplay();
  const area = config.load().rest === 'taskbar' && featureAvailable('taskbarRest')
    ? { ...bounds, y: bounds.y + 1, height: bounds.height - 1 } : workArea;
  return { area, gap: area.y + area.height - (workArea.y + workArea.height) };
}

function fitOverlay() {
  if (!overlay) return;
  const { area, gap } = overlayArea();
  overlay.setBounds(area);
  overlay.webContents.send('overlay:resize', { width: area.width, height: area.height, gap });
  // once now, then after Electron's own moves of her window have landed
  for (const wait of [0, 300, 1500]) setTimeout(placeOnHyprland, wait);
}

// XWayland's coordinates aren't Hyprland's: a window put at its screen's corner by Electron can land
// beside it, or keep an old screen's size when Electron's own moves arrive after Hyprland's. Hyprland
// moves her there itself, and checks now and then that she stays there (it moves nothing otherwise):
// out of place, her click-through window would catch clicks meant for yours.
let placing = false;
function placeOnHyprland() {
  if (!hypr || !overlay || overlay.isDestroyed() || placing) return;
  placing = true;
  const { area } = overlayArea();
  const { bounds } = targetDisplay();
  hypr.place(bounds, area, displays().map((d) => d.bounds))
    .catch((err) => console.error('[capri] Hyprland placement:', err.message))
    .finally(() => { placing = false; });
}

// The pointer, read from Hyprland twenty times a second: her window lets it through, so it never
// hears of it otherwise (Electron forwards it only on Windows and macOS).
function startPointer() {
  if (!hypr) return;
  setInterval(placeOnHyprland, 3000);
  // her place and her chat's hold on the keyboard, again after `hyprctl reload` or a monitor change
  hyprEvents = hyprland.watchEvents((name) => {
    if (!['configreloaded', 'monitoraddedv2', 'monitorremovedv2'].includes(name)) return;
    setTimeout(() => {
      placeOnHyprland();
      hypr.reapply();
    }, 200);
  });
  let last = '';
  let busy = false;
  pointerTimer = setInterval(async () => {
    if (busy || !overlay || overlay.isDestroyed()) return;
    busy = true;
    try {
      const p = await hypr.cursor();
      const key = p ? `${p.x},${p.y}` : '';
      if (p && key !== last) overlay.webContents.send('overlay:pointer', { x: p.x, y: p.y, inside: p.inside });
      last = key;
    } catch { /* Hyprland busy or restarting: the next tick tries again */ } finally { busy = false; }
  }, 50);
}

// The pointer reaches her click-through window through a mouse hook, and Windows drops a hook that
// doesn't answer in time without a word (waking from sleep, a locked screen, a stall): she can't be
// clicked anymore. Off then on puts in a new one; her place on top and her size are set again too.
function rearmOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.setIgnoreMouseEvents(false);
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  fitOverlay();
  sendCommand('rearmed'); // click-through again: she waits for the pointer to be on her
  console.log('[capri] mouse hook set up again');
}

// Back on top of everything, the taskbar included (it comes up over her when it's clicked). Twice:
// the taskbar can come up again a moment later, as its menus and previews open.
function raiseOverlay() {
  for (const wait of [0, 400]) {
    setTimeout(() => {
      if (!overlay || overlay.isDestroyed()) return;
      overlay.setAlwaysOnTop(true, 'screen-saver');
      overlay.moveTop();
    }, wait);
  }
}

function createOverlay() {
  overlay = new BrowserWindow({
    ...overlayArea().area,
    title: 'Capri Overlay',
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // XWayland only lets a window take the keyboard if it said it could when it was mapped: under
    // Hyprland she's focusable from the start, and the compositor decides when she gets it
    focusable: Boolean(hypr),
    hasShadow: false,
    alwaysOnTop: true,
    type: process.platform === 'win32' ? 'toolbar' : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  // Keep a stable title for compositor rules even after the HTML title loads.
  if (process.platform === 'linux') overlay.on('page-title-updated', (event) => event.preventDefault());
  overlay.loadURL('capri://app/src/renderer/index.html');
  // always shown: put away, she's still there as her biochip in the corner. Sized again first:
  // Windows keeps a new window inside the work area, and resting on the taskbar it covers it too.
  overlay.once('ready-to-show', () => {
    fitOverlay();
    overlay.showInactive();
  });
  overlay.webContents.on('render-process-gone', (_e, details) => {
    console.error('[capri] renderer gone:', details.reason);
  });
  if (DEV) {
    overlay.webContents.on('console-message', (e) => {
      const { level, message, lineNumber, sourceId } = e;
      console.log(`[renderer:${level}] ${message} (${String(sourceId).split('/').pop()}:${lineNumber})`);
    });
    if (process.env.CAPRI_DEVTOOLS) overlay.webContents.openDevTools({ mode: 'detach' });
  }
}

function sendCommand(name, payload = {}) {
  overlay?.webContents.send('capri:command', { name, ...payload });
}

// `capri --ask-selection` (a keybind): her chat, with the text you have selected already in it
function askSelection() {
  if (process.platform !== 'linux') return sendCommand('talk');
  execFile('wl-paste', ['--primary', '--no-newline', '--type', 'text'], { timeout: 2000, maxBuffer: 1024 * 1024 },
    (err, out) => sendCommand('talk', { text: err ? '' : String(out).slice(0, 4000), keep: true }));
}

// Ctrl+Alt+C: she folds herself away into her biochip in the corner, or comes back out of it.
function toggleVisible(force) {
  const visible = typeof force === 'boolean' ? force : !config.load().visible;
  if (!saveConfig({ visible })) return;
  sendCommand('stow', { on: !visible });
  rebuildTray();
}

function playDemo() {
  clearTimeout(demoTimer);
  const steps = demoSteps(resolveLang(config.load().lang)); // in her language
  let i = 0;
  const next = () => {
    if (i >= steps.length) return;
    const [delay, evt] = steps[i++];
    demoTimer = setTimeout(() => {
      overlay?.webContents.send('claude:event', evt);
      next();
    }, delay);
  };
  next();
}

// During the demo, a little fake terminal for her to sit on and take over (window tracking is
// Windows only, so only there). Opened without stealing focus; closing it drops her off it.
let demoWin = null;
const DEMO_TERMINAL = `<body style="margin:0;background:#14101c;color:#8f8aa3;font:13px/1.7 Consolas,monospace;padding:14px 18px">
<div style="color:#36ff7a">PS C:\\night-city-api&gt; npm test -- gigs</div>
<div>&nbsp;&nbsp;GET /gigs</div><div style="color:#36ff7a">&nbsp;&nbsp;&nbsp;&nbsp;✓ returns 20 items per page</div>
<div style="color:#36ff7a">&nbsp;&nbsp;&nbsp;&nbsp;✓ paginates with a cursor</div><div style="color:#36ff7a">&nbsp;&nbsp;&nbsp;&nbsp;✓ rejects a bad cursor</div>
<div>&nbsp;&nbsp;6 passing (212ms)</div><div style="color:#36ff7a">PS C:\\night-city-api&gt; _</div></body>`;

function demoWindow(open) {
  demoWin?.destroy();
  demoWin = null;
  if (!open || process.platform !== 'win32') return false;
  const b = overlay.getBounds();
  demoWin = new BrowserWindow({
    x: Math.round(b.x + b.width * 0.5 - 310), y: Math.round(b.y + b.height * 0.42), width: 620, height: 300,
    show: false, alwaysOnTop: true, title: 'night-city-api — npm test', backgroundColor: '#14101c', autoHideMenuBar: true,
  });
  demoWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(DEMO_TERMINAL)}`);
  demoWin.once('ready-to-show', () => demoWin?.showInactive());
  demoWin.on('closed', () => { demoWin = null; });
  return true;
}

// 'auto' -> the first system language Capri speaks, English otherwise.
function resolveLang(setting) {
  if (LANGS.includes(setting)) return setting;
  const preferred = [...app.getPreferredSystemLanguages(), app.getSystemLocale(), app.getLocale()];
  for (const tag of preferred) {
    const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

// What the overlay gets: `lang` is the resolved one, `langSetting` what the user picked.
function rendererConfig() {
  const cfg = config.publicValues();
  const lang = resolveLang(cfg.lang);
  return { ...cfg, keys: config.keys.names(config.load().apiKeys).filter((id) => Object.hasOwn(llm.PROVIDERS, id)),
    keyStorage: config.keys.status(), storageText: storageText(lang),
    assistant: activeAssistant().id, lang, langSetting: cfg.lang,
    floorGap: overlayArea().gap, system: { features: platformInfo?.features || {}, session: platformInfo?.session || null, text: platformText(lang) } };
}

function featureAvailable(name) { return platformInfo?.features[name]?.status !== 'unavailable'; }

async function refreshPlatform(reloadStorage = false) {
  if (reloadStorage) { config.load(true); memoryStore.load(true); }
  platformInfo = await inspectPlatform({ backend: app.commandLine.getSwitchValue('ozone-platform') || 'x11' });
  overlay?.webContents.send('capri:config', rendererConfig());
  rebuildTray();
  return { ...platformInfo, checkedAt: new Date().toISOString(), appVersion: app.getVersion(), electronVersion: process.versions.electron,
    keyStorage: config.keys.status(), settingsStorage: config.status(), memoryStorage: memoryStore.status() };
}

async function showDiagnostics() {
  if (diagnosticOpen) return;
  diagnosticOpen = true;
  try {
    for (;;) {
      const report = await refreshPlatform(true);
      const t = platformText(resolveLang(config.load().lang));
      const detail = [
        `${report.distribution} · ${report.session} · ${report.backend}`,
        `Capri ${report.appVersion} · Electron ${report.electronVersion}`,
        '',
        ...Object.entries(report.features).map(([key, value]) =>
          `${t.features[key]}: ${t.states[value.status]}${value.reason ? ` — ${t.reasons[value.reason]}` : ''}`),
        '', t.trayNote,
        '', storageText(resolveLang(config.load().lang))[report.keyStorage.persistent ? 'persistent' : 'session'],
        ...(report.keyStorage.lockedKeys ? [storageText(resolveLang(config.load().lang)).locked] : []),
        ...[report.settingsStorage, report.memoryStorage].flatMap((state, index) => {
          const text = storageText(resolveLang(config.load().lang));
          return state.blocked ? [text.blocked] : state.error || state.migrationError ? [text.failed]
            : state.recovery !== 'none' ? [text[index === 1
              ? state.recovery === 'backup' ? 'memoryRecovered' : 'memoryReset'
              : state.recovery === 'backup' ? 'recovered' : 'reset']] : [];
        }),
      ].join('\n');
      const { response } = await dialog.showMessageBox({ type: 'info', title: t.title,
        message: t.intro, detail, buttons: [t.copy, t.refresh, t.close], defaultId: 2, cancelId: 2 });
      if (response === 0) { clipboard.writeText(JSON.stringify(report, null, 2)); break; }
      else if (response !== 1) break;
    }
  } finally { diagnosticOpen = false; }
}

function updateConfig(patch, renderer = false) {
  const saved = saveConfig(patch, renderer);
  if (saved && 'rest' in patch) {
    fitOverlay(); // the taskbar in her window or not
    windowWatch?.refresh();
  }
  const cfg = rendererConfig();
  overlay?.webContents.send('capri:config', cfg);
  rebuildTray();
  return saved ? cfg : { ...cfg, saveError: true };
}

function rebuildTray() {
  if (!tray) return;
  const cfg = config.load();
  const hookState = activeHooks().status();
  const watched = activeAssistant();
  const t = Object.fromEntries(Object.entries(TRAY[resolveLang(cfg.lang)]).map(([key, value]) =>
    [key, typeof value === 'string' && watched.id !== 'claude' ? value.replaceAll('Claude Code', watched.name) : value]));
  const system = platformText(resolveLang(cfg.lang));
  const availableItem = (label, feature, options) => ({ ...options,
    label: featureAvailable(feature) ? label : `${label} · ${system.states.unavailable}`,
    enabled: featureAvailable(feature),
  });

  const screens = displays();
  const current = targetDisplay().id;
  // how close she is to you (bond.js): STAGES there, 1000 xp is 100 %
  const xp = cfg.bond?.xp || 0;
  const stage = [0, 100, 300, 550, 850].filter((at) => xp >= at).length - 1;
  // the reminders she keeps (reminders.js), soonest first
  const reminders = [...(cfg.reminders || [])].sort((a, b) => a.at - b.at);
  const when = (at) => {
    const d = new Date(at);
    const sameDay = d.toDateString() === new Date().toDateString();
    return new Intl.DateTimeFormat(resolveLang(cfg.lang), sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  };
  const cancelReminder = (id) => updateConfig({ reminders: (config.load().reminders || []).filter((r) => r.id !== id) });

  const menu = Menu.buildFromTemplate([
    { label: t.online(PORT), enabled: false },
    { label: t.sync(Math.min(100, Math.floor(xp / 10)), t.stages[stage]), enabled: false },
    { type: 'separator' },
    { label: t.teleport, click: () => sendCommand('teleport') },
    { label: t.satellite, click: () => sendCommand('satellite') },
    { label: t.demo, click: playDemo },
    { label: t.help, click: () => sendCommand('welcome') },
    { label: system.title, click: () => showDiagnostics().catch((err) => console.error('[capri] diagnostics:', err.message)) },
    ...(cfg.claude ? [{ label: t.report, click: () => sendCommand('report') }] : []),
    { label: t.talk, click: () => sendCommand('chat') },
    availableItem(t.lookNow, 'screenCapture', { click: () => sendCommand('look') }),
    {
      label: t.reminders,
      submenu: reminders.length
        ? reminders.map((r) => ({
          label: `${when(r.at)} · ${(r.text || '…').slice(0, 50)}`,
          submenu: [{ label: t.cancelReminder, click: () => cancelReminder(r.id) }],
        }))
        : [{ label: t.noReminders, enabled: false }],
    },
    { label: t.custom, click: () => sendCommand('customize') },
    { label: cfg.visible ? t.hide : t.show, accelerator: 'Ctrl+Alt+C', click: () => toggleVisible() },
    { type: 'separator' },
    {
      label: t.size,
      submenu: [[t.small, 0.45], [t.medium, 0.6], [t.large, 0.8]].map(([label, scale]) => ({
        label, type: 'radio', checked: Math.abs(cfg.scale - scale) < 0.01, click: () => updateConfig({ scale }),
      })),
    },
    {
      label: t.sound,
      submenu: [
        { label: t.mute, type: 'checkbox', checked: cfg.muted, click: (item) => updateConfig({ muted: item.checked }) },
        { type: 'separator' },
        {
          label: t.soundsDir,
          click: () => {
            fs.mkdirSync(userSoundsDir(), { recursive: true });
            shell.openPath(userSoundsDir());
          },
        },
      ],
    },
    {
      label: t.screen,
      enabled: screens.length > 1,
      submenu: [
        ...screens.map((d, i) => ({
          label: `${i + 1} — ${d.size.width}×${d.size.height}`,
          type: 'radio',
          checked: d.id === current,
          click: () => d.id !== current && sendCommand('goScreen', { id: d.id }), // she goes over there herself
        })),
        { type: 'separator' },
        { label: t.follow, type: 'checkbox', checked: cfg.follow !== false, click: (item) => updateConfig({ follow: item.checked }) },
      ],
    },
    {
      label: t.chatModel,
      submenu: [
        { label: t.aiSetup, click: () => sendCommand('setupChat') },
        { type: 'separator' },
        ...Object.entries(llm.PROVIDERS).map(([provider, p]) => ({
          label: p.label, type: 'radio', checked: cfg.provider === provider, click: () => pickProvider(provider),
        })),
        { type: 'separator' },
        ...(chatModels?.length
          ? chatModels.map((name) => ({
            label: cloud.free.includes(name) ? `${name} · ${t.cloudFree}` : name,
            type: 'radio', checked: name === pickModel(cfg), click: () => updateConfig({ chatModel: name }),
          }))
          : [{ label: (chatError || t.noOllama).slice(0, 80), enabled: false }]),
        // Ollama's free cloud models when you're signed in to it, fetched on the click (it takes a second)
        ...(cfg.provider === 'ollama' && chatModels ? [
          ...cloud.free.filter((name) => !chatModels.includes(name)).map((name) => ({
            label: `${name} · ${t.cloudFree}`, type: 'radio', checked: false, click: () => fetchModel(name).catch(() => rebuildTray()),
          })),
          ...(cloud.account?.signin ? [{ label: t.cloudSignin, click: signInToOllama }] : []),
        ] : []),
        { type: 'separator' },
        ...(cfg.provider === 'claude' ? [
          { label: `Claude Code: ${cfg.claudeCwd || app.getPath('home')}`, click: pickClaudeFolder },
          {
            label: 'Claude Code permissions',
            submenu: llm.CLAUDE_MODES.map((mode) => ({
              label: mode, type: 'radio', checked: cfg.claudeMode === mode, click: () => updateConfig({ claudeMode: mode }),
            })),
          },
        ] : []),
        { label: t.forget, click: forgetChats },
        // the key (or the address) of the one picked, pasted in her panel
        { label: t.apiKey, click: () => sendCommand('setupKey') },
      ],
    },
    { label: t.wander, type: 'checkbox', checked: cfg.wander, click: (item) => updateConfig({ wander: item.checked }) },
    availableItem(t.possess, 'windowTracking', { type: 'checkbox', checked: cfg.possess && featureAvailable('windowTracking'), click: (item) => updateConfig({ possess: item.checked }) }),
    availableItem(t.jealous, 'aiDetection', { type: 'checkbox', checked: cfg.jealous !== false && featureAvailable('aiDetection'), click: (item) => updateConfig({ jealous: item.checked }) }),
    { label: t.pcReact, type: 'checkbox', checked: cfg.pcReact !== false, click: (item) => updateConfig({ pcReact: item.checked }) },
    {
      // she asks first (what she'll send where), then turns it on herself
      label: t.lookAuto, type: 'checkbox', checked: Boolean(cfg.watchScreen),
      enabled: featureAvailable('screenCapture'),
      click: (item) => {
        sendCommand('watchScreen', { on: item.checked });
        rebuildTray(); // as it is until she's asked
      },
    },
    {
      label: t.rest,
      submenu: [['corner', t.restCorner], ['taskbar', t.restTaskbar]].map(([rest, label]) => ({
        label, enabled: rest !== 'taskbar' || featureAvailable('taskbarRest'),
        type: 'radio', checked: (featureAvailable('taskbarRest') ? cfg.rest : 'corner') === rest, click: () => updateConfig({ rest }),
      })),
    },
    // the coding assistant she watches (a new one: she says hello and offers to plug herself in), or none
    {
      label: t.watch,
      submenu: [
        ...Object.entries(ASSISTANTS).map(([id, { name }]) => ({
          label: name,
          type: 'radio',
          checked: cfg.claude && watched.id === id,
          click: () => {
            const other = watched.id !== id;
            updateConfig({ claude: true, assistant: id, ...(other && { linked: false, welcomed: false }) });
            if (other) sendCommand('assistantChanged');
          },
        })),
        { label: t.watchNone, type: 'radio', checked: !cfg.claude, click: () => updateConfig({ claude: false }) },
      ],
    },
    {
      label: t.motion,
      submenu: [['auto', process.platform === 'win32' ? t.motionAuto : system.systemMotion], ['full', t.motionFull], ['reduced', t.motionReduced]].map(([motion, label]) => ({
        label, type: 'radio', checked: cfg.motion === motion, click: () => updateConfig({ motion, motionAsked: true }),
      })),
    },
    {
      label: t.display,
      // only read when she starts: she restarts in the mode picked
      submenu: [['auto', t.displayAuto], ['gl', t.displayGl], ['software', t.displaySoftware]].map(([render, label]) => ({
        label, type: 'radio', checked: cfg.render === render,
        click: () => {
          if (cfg.render === render) return;
          if (!saveConfig({ render })) return;
          app.relaunch();
          app.exit(0);
        },
      })),
    },
    {
      label: t.lang,
      submenu: [[t.auto, 'auto'], ...LANGS.map((lang) => [TRAY[lang].name, lang])].map(([label, lang]) => ({
        label, type: 'radio', checked: cfg.lang === lang, click: () => updateConfig({ lang }),
      })),
    },
    {
      label: featureAvailable('autoStart') ? t.startup : `${t.startup} · ${system.states.unavailable}`,
      enabled: featureAvailable('autoStart'),
      type: 'checkbox',
      checked: featureAvailable('autoStart') && app.getLoginItemSettings(loginItemOptions()).openAtLogin,
      click: (item) => app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: item.checked }),
    },
    // her hooks, while she watches Claude Code
    ...(cfg.claude ? [
      { type: 'separator' },
      hookState.installed
        ? { label: t.hooksOn, enabled: false }
        : { label: t.hooksOff, click: () => runHooks('install') },
      ...(hookState.installed ? [{ label: t.hooksRemove, click: () => runHooks('uninstall') }] : []),
    ] : []),
    { type: 'separator' },
    { label: t.quit, click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  trayMenu = menu;
}

// Run from a clone (`npm start`), electron.exe alone would open the default Electron app at login:
// it needs the project folder as argument.
function loginItemOptions() {
  return app.isPackaged ? {} : { path: process.execPath, args: [ROOT] };
}

// From the tray, she says how it went; from her welcome panel (quiet), the panel does.
function runHooks(action, { quiet = false } = {}) {
  let outcome;
  try {
    const result = action === 'install' ? activeHooks().install() : activeHooks().uninstall();
    outcome = { action, ok: true, file: result.file };
  } catch (err) {
    outcome = { action, ok: false, error: err.message };
  }
  if (!quiet) sendCommand('hooks', outcome);
  rebuildTray();
  return outcome;
}

// The model she talks with: the one picked in her menu if it's still installed, else the first one
// on this PC (a cloud model only once you pick it).
function pickModel(cfg = config.load()) {
  if (!chatModels?.length) return null;
  if (chatModels.includes(cfg.chatModel)) return cfg.chatModel;
  return chatModels.find((m) => !ollama.isCloud(m)) || chatModels[0];
}

async function refreshModels() {
  const cfg = config.load();
  chatError = null;
  chatErrorCode = null;
  chatModels = await llm.models(cfg.provider, llmConfig(cfg)).catch((err) => {
    chatError = err.message;
    chatErrorCode = err.code || null;
    return null;
  });
  rebuildTray();
  if (cfg.provider === 'ollama' && chatModels) refreshCloud(); // in the background: it asks ollama.com
  return chatModels;
}

// Whether you're signed in to Ollama, and its free cloud models if so. Once a minute at most.
let cloudCheck = null; // the look under way
function refreshCloud(force = false) {
  if (!force && Date.now() - cloud.at < 60000) return cloudCheck || Promise.resolve(cloud);
  const at = Date.now();
  cloud.at = at;
  cloudCheck = (async () => {
    const account = await ollama.account();
    const free = account?.name ? await ollama.freeModels() : [];
    cloud = { at, account, free };
    rebuildTray();
    return cloud;
  })().finally(() => { cloudCheck = null; });
  return cloudCheck;
}

// A model fetched with Ollama (a cloud one is only a small file), then her chat on it.
async function fetchModel(name, onProgress, signal) {
  await setup.pullModel(name, onProgress, signal);
  updateConfig({ provider: 'ollama' });
  await refreshModels();
  const model = chatModels?.find((m) => m === name || m.startsWith(`${name}:`));
  if (model) updateConfig({ chatModel: model });
  return model;
}

// The page that links this PC to your Ollama account, then a look every few seconds until you're in.
async function signInToOllama() {
  if (!cloud.account?.signin) return;
  shell.openExternal(cloud.account.signin);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if ((await refreshCloud(true)).account?.name) return;
  }
}

// Her answer from the model picked, or from the next one when that one can't: too busy twice in a row
// (Gemini's "high demand", an Ollama cloud model out of free use), not served anymore (an older model
// closed to new keys), or signed out of Ollama. A model on this PC first. The model that answered is
// kept for next time.
async function chatWithFallback(cfg, messages, send, signal, streamed) {
  let model = pickModel(cfg);
  const tried = new Set();
  let busy = 0;
  for (;;) {
    try {
      const text = await llm.chat(cfg.provider, llmConfig(cfg), { model, messages }, send, signal);
      if (model !== pickModel(cfg)) updateConfig({ chatModel: model });
      return text;
    } catch (err) {
      if (signal.aborted || streamed() || !['busy', 'gone', 'signin'].includes(err.code)) throw err;
      if (err.code === 'busy' && busy++ === 0) {
        await new Promise((r) => setTimeout(r, 1500)); // usually gone a moment later
        continue;
      }
      tried.add(model);
      const next = chatModels?.find((m) => !tried.has(m) && !ollama.isCloud(m)) || chatModels?.find((m) => !tried.has(m));
      if (!next || tried.size >= 3) throw err;
      model = next;
      busy = 0;
    }
  }
}

// She looks at your screen (look.js): a picture of the screen she's on, kept here in memory a moment
// for her AI to look at, never written anywhere. 1280 px wide at most: enough to read, light to send.
const snaps = new Map(); // id -> the picture, base64 JPEG
async function snapScreen() {
  const d = targetDisplay();
  // Hyprland: straight from the compositor (grim), no portal asking each time
  if (hypr) {
    const jpeg = await hypr.snapshot(d.bounds, displays().map((x) => x.bounds), 1280).catch(() => null);
    if (jpeg?.length) return jpeg.toString('base64');
  }
  const k = d.scaleFactor || 1;
  const fit = Math.min(1, 1280 / (d.bounds.width * k));
  const size = { width: Math.round(d.bounds.width * k * fit), height: Math.round(d.bounds.height * k * fit) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
  if (!src || src.thumbnail.isEmpty()) throw new Error('no picture of the screen');
  return src.thumbnail.toJPEG(72).toString('base64');
}

// What her AI says about that picture, as her (`persona`), asked `prompt`. With a code when it can't:
// 'noai' (nothing to ask), 'novision' (that model can't look at pictures).
async function sayAboutSnap({ id, persona, prompt, history = [] }) {
  const image = snaps.get(id);
  snaps.delete(id);
  if (!image) return { ok: false, error: 'the picture is gone' };
  const cfg = config.load();
  if (!chatModels?.length) await refreshModels();
  const model = pickModel(cfg);
  if (!model) return { ok: false, code: 'noai' };
  // Claude Code reads pictures from files: the screen goes into a folder of its own, readable for
  // that one question, and is deleted as soon as the answer is in
  if (cfg.provider === 'claude') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-look-'));
    const file = path.join(dir, 'screen.jpg');
    try {
      fs.writeFileSync(file, Buffer.from(image, 'base64'), { mode: 0o600 });
      const ask = `${prompt}\n\n(Your screenshot of the user's screen is the image file ${file}: open it with your Read tool and answer from what you see.)`;
      const text = await llm.chat('claude', llmConfig(cfg), { model, addDir: dir, messages: [{ role: 'system', content: persona }, { role: 'user', content: ask }] },
        () => {}, AbortSignal.timeout(180000));
      return { ok: true, text, model: 'Claude Code' };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (cfg.provider === 'ollama' && !(await ollama.canSee(model))) return { ok: false, code: 'novision', model };
  const user = cfg.provider === 'ollama'
    ? { role: 'user', content: prompt, images: [image] }
    : { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }] };
  // asked in her chat: the conversation so far comes before it (text only)
  const before = (Array.isArray(history) ? history : []).filter((m) => typeof m?.content === 'string' && ['user', 'assistant'].includes(m.role));
  const messages = [{ role: 'system', content: persona }, ...before, user];
  for (let attempt = 0; ; attempt++) {
    try {
      const text = await llm.chat(cfg.provider, llmConfig(cfg), { model, messages }, () => {}, AbortSignal.timeout(120000));
      return { ok: true, text, model };
    } catch (err) {
      if (err.code === 'busy' && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      const novision = /image|vision|multimodal|modalit|image_url|content.*(part|type)/i.test(err.message);
      return { ok: false, error: err.message, code: novision ? 'novision' : err.code || null, model };
    }
  }
}

async function pickProvider(provider) {
  updateConfig({ provider });
  await refreshModels();
  if (chatErrorCode) sendCommand('setupKey'); // it needs a key or an address: she asks for it
}

// Only the main-process provider receives decrypted or session keys.
function llmConfig(cfg = config.load()) {
  return { ...cfg, apiKeys: config.keys.openKeys(cfg.apiKeys) };
}

async function pickClaudeFolder() {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath: config.load().claudeCwd || app.getPath('home') });
  if (canceled || !filePaths[0]) return;
  llm.resetClaude(); // a new folder, a new Claude Code conversation (hers goes on)
  saveMemory({ claude: null });
  updateConfig({ claudeCwd: filePaths[0] });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icons', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Capri');
  tray.on('click', () => sendCommand('status'));
  rebuildTray();
}

function registerIpc() {
  ipcMain.handle('system:info', () => refreshPlatform(true));
  ipcMain.on('overlay:interactive', (_e, on) => {
    overlay?.setIgnoreMouseEvents(!on, { forward: true });
    hypr?.hover(on);
  });
  ipcMain.on('overlay:rearm', () => rearmOverlay()); // the pointer moved over her and she never heard of it
  ipcMain.handle('overlay:cursor', async () => {
    const h = hypr && await hypr.cursor().catch(() => null);
    if (h) return { x: h.x, y: h.y, inside: h.inside, display: h.screen ? displayAt(h.screen).id : targetDisplay().id };
    const p = screen.getCursorScreenPoint();
    const b = overlay.getBounds();
    const inside = p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height;
    return { x: p.x - b.x, y: p.y - b.y, inside, display: displayAt(p).id };
  });
  // your screens (their bounds), the one she's on, and where her window is
  ipcMain.handle('screens:list', () => {
    const o = overlay.getBounds();
    return {
      current: targetDisplay().id,
      origin: { x: o.x, y: o.y },
      list: displays().map(({ id, bounds: b }) => ({ id, x: b.x, y: b.y, w: b.width, h: b.height })),
    };
  });
  ipcMain.handle('screens:move', async (_e, id) => {
    const area = moveOverlay(id);
    if (!area) return null;
    await new Promise((r) => setTimeout(r, 60));
    overlay.setBounds(area); // again, once Windows has settled it on its new screen
    const o = overlay.getBounds();
    return { origin: { x: o.x, y: o.y }, width: o.width, height: o.height, gap: overlayArea().gap };
  });
  ipcMain.handle('config:get', () => rendererConfig());
  ipcMain.handle('hooks:status', () => activeHooks().status());
  ipcMain.handle('config:set', (_e, patch) => updateConfig(patch, true));
  ipcMain.handle('demo:window', (_e, open) => demoWindow(open));
  // right-clicking her: the same menu as the tray icon (which Windows often hides behind the ^ by the clock)
  ipcMain.on('menu:open', () => trayMenu?.popup({ window: overlay }));
  // her welcome panel's buttons
  ipcMain.handle('hooks:install', () => runHooks('install', { quiet: true }));
  ipcMain.handle('claude:found', () => fs.existsSync(path.dirname(activeHooks().status().file))); // Claude Code keeps its settings there
  ipcMain.on('claude:help', () => shell.openExternal(activeAssistant().help));
  ipcMain.handle('windows:get', () => lastWindows);
  // talking to her (chat.js): is Ollama there, with a model to talk with
  ipcMain.handle('chat:status', async () => {
    const cfg = config.load(true); // keys may have been edited by hand
    const { provider } = cfg;
    const models = await refreshModels();
    if (!models) return { ok: false, error: chatError || 'offline', code: chatErrorCode, provider };
    if (!models.length) return { ok: false, error: 'nomodel', provider };
    const model = pickModel();
    llm.warm(provider, model); // loading while you type your first message
    const local = llm.isLocal(provider, cfg, model);
    return { ok: true, provider, model, agent: provider === 'claude', local, warmup: provider === 'ollama' && local };
  });
  // her answer, streamed to the overlay piece by piece as `chat:delta`
  ipcMain.handle('chat:send', async (_e, { id, messages }) => {
    const abort = new AbortController();
    chats.set(id, abort);
    try {
      let streamed = false;
      const send = (text) => {
        streamed = true;
        overlay?.webContents.send('chat:delta', { id, text });
      };
      const cfg = config.load();
      const text = await chatWithFallback(cfg, messages, send, abort.signal, () => streamed);
      if (cfg.provider === 'claude') saveMemory({ claude: llm.claudeMemory() });
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: abort.signal.aborted ? 'stopped' : err.message, code: err.code || null };
    } finally {
      chats.delete(id);
    }
  });
  ipcMain.on('chat:stop', (_e, id) => chats.get(id)?.abort());
  // she looks at your screen (look.js): the picture first, then what her AI says about it
  ipcMain.handle('look:snap', async () => {
    try {
      const id = randomUUID();
      snaps.set(id, await snapScreen());
      setTimeout(() => snaps.delete(id), 120000);
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('look:say', (_e, request) => sayAboutSnap(request || {}));
  // how hard the processor works, in %, since the last time she asked (pc.js)
  let cpuBefore = null;
  ipcMain.handle('pc:cpu', () => {
    const now = os.cpus().map(({ times: t }) => ({ idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq }));
    const before = cpuBefore;
    cpuBefore = now;
    if (!before) return null;
    let idle = 0, total = 0;
    now.forEach((c, i) => {
      idle += c.idle - (before[i]?.idle || 0);
      total += c.total - (before[i]?.total || 0);
    });
    return total > 0 ? Math.round(100 * (1 - idle / total)) : null;
  });
  // where her AI runs, for what she tells you before she looks: { local, provider, model }
  ipcMain.handle('look:where', () => {
    const cfg = config.load();
    const model = pickModel(cfg);
    const provider = cfg.provider === 'ollama' && ollama.isCloud(model) ? 'Ollama' : llm.PROVIDERS[cfg.provider]?.label || cfg.provider;
    return { local: llm.isLocal(cfg.provider, cfg, model), provider, model };
  });
  ipcMain.handle('chat:memory', () => readMemory().history || []);
  ipcMain.on('chat:remember', (_e, history) => Array.isArray(history) && saveMemory({ history }));
  ipcMain.on('chat:ollama', () => shell.openExternal(OLLAMA_SITE));
  // setting her up with buttons (setup.js): Ollama and a model, or a key, or an address
  const progress = (payload) => overlay?.webContents.send('setup:progress', payload);
  let pulling = null; // AbortController of the model being fetched
  ipcMain.handle('setup:info', async () => {
    // the free cloud models too, when Ollama is up and you're signed in to it
    const { free } = (await ollama.models().catch(() => null)) ? await refreshCloud() : { free: [] };
    return { models: setup.MODELS, cloud: free, ram: os.totalmem(), keyed: Object.keys(setup.KEY_PAGES) };
  });
  ipcMain.handle('setup:ollama', () => setup.ollamaState());
  ipcMain.handle('setup:install', () => featureAvailable('ollamaInstall')
    ? setup.installOllama((line) => progress({ kind: 'install', line }))
    : { ok: false, code: 'unavailable', error: platformText(resolveLang(config.load().lang)).reasons.manualOllama });
  ipcMain.handle('setup:start', async () => {
    const res = await setup.startOllama();
    await refreshModels();
    return res;
  });
  ipcMain.handle('setup:pull', async (_e, name) => {
    if (!setup.MODELS.some((m) => m.name === name) && !cloud.free.includes(name)) return { ok: false, error: 'unknown model' };
    pulling?.abort();
    const abort = new AbortController();
    pulling = abort;
    try {
      const model = await fetchModel(name, (p) => progress({ kind: 'pull', ...p }), abort.signal);
      return { ok: true, model };
    } catch (err) {
      return { ok: false, error: abort.signal.aborted ? 'stopped' : err.message };
    } finally {
      if (pulling === abort) pulling = null;
    }
  });
  ipcMain.on('setup:cancel', () => pulling?.abort());
  // Validate a provider before persisting anything. A failed check must not overwrite
  // working settings or leak a key through a server's error message.
  ipcMain.handle('setup:use', async (_e, { provider, key, url } = {}) => {
    const t = storageText(resolveLang(config.load().lang));
    if (typeof provider !== 'string' || !Object.hasOwn(llm.PROVIDERS, provider) || (key !== undefined && (typeof key !== 'string' || !key.trim() || key.length > 16384))
      || (url !== undefined && typeof url !== 'string')) return { ok: false, error: t.providerFailed };
    const rawKey = key?.trim();
    const patch = { provider, ...(url && { customUrl: url.trim() }) };
    const candidate = llmConfig({ ...config.load(), ...patch });
    if (rawKey) candidate.apiKeys[provider] = rawKey;
    try {
      const models = await llm.models(provider, candidate);
      if (!models?.length) return { ok: false, error: t.providerFailed };
      const prepared = rawKey && config.keys.prepare(rawKey);
      if (prepared) {
        patch.apiKeys = { ...config.load().apiKeys };
        if (prepared.value) patch.apiKeys[provider] = prepared.value;
        else delete patch.apiKeys[provider];
      }
      if (!saveConfig(patch)) return { ok: false, error: t.failed };
      if (prepared) config.keys.activate(provider, rawKey, prepared.storage);
      chatModels = models;
      chatError = chatErrorCode = null;
      overlay?.webContents.send('capri:config', rendererConfig());
      rebuildTray();
      return { ok: true, model: pickModel(), storage: prepared?.storage };
    } catch { return { ok: false, error: t.providerFailed }; }
  });
  ipcMain.on('setup:keyPage', (_e, provider) => setup.KEY_PAGES[provider] && shell.openExternal(setup.KEY_PAGES[provider]));
  ipcMain.handle('setup:launch', (_e, integration) => featureAvailable('ollamaLaunch')
    ? setup.launchThroughOllama(integration)
    : { ok: false, code: 'unavailable', error: platformText(resolveLang(config.load().lang)).reasons.manualLaunch });
  // closing an app you asked her to close, once you've clicked to confirm (apps.js)
  const appInfo = (app) => app && { name: app.process, label: app.label };
  ipcMain.handle('apps:list', async () => (await apps.list().catch(() => [])).map(appInfo));
  ipcMain.handle('apps:find', async (_e, wanted) => appInfo(await apps.find(wanted).catch(() => null)));
  ipcMain.handle('apps:close', (_e, { name, force }) => apps.close(name, { force }).catch((err) => ({ error: err.message })));
  // opening things you ask her to (launch.js): an app or a game, your music, a website
  ipcMain.handle('apps:findLaunch', async (_e, text) => {
    const item = await launch.find(String(text || '')).catch(() => null);
    return item && { ...item, risky: launch.risky(item) }; // a program or a script: behind a button
  });
  ipcMain.handle('apps:youtube', (_e, query) => launch.youtube(query).catch(() => null));
  ipcMain.handle('apps:roblox', (_e, query) => launch.roblox(query).catch(() => null));
  // your files (files.js): a search, opening what it found, a screenshot, a search on the web
  ipcMain.handle('files:search', (_e, query) => files.search(query).catch(() => []));
  ipcMain.handle('files:open', (_e, { file, reveal }) => files.open(String(file), { reveal: Boolean(reveal) }).then(() => true, () => false));
  ipcMain.handle('files:screenshot', () => files.screenshot(targetDisplay()).catch(() => null));
  ipcMain.handle('web:search', (_e, query) => {
    const q = String(query || '').trim().slice(0, 300);
    if (!q) return false;
    return shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(q)}`).then(() => true, () => false);
  });
  ipcMain.handle('apps:launch', (_e, item) => launch.launch(item).then(() => ({ ok: true }), (err) => ({ ok: false, error: err.message })));
  ipcMain.handle('apps:media', (_e, action) => launch.media(action));
  ipcMain.handle('apps:music', (_e, query) => launch.music(query).catch(() => false));
  ipcMain.handle('apps:site', (_e, address) => launch.site(address).catch(() => false));
  // typing to her: the overlay takes the keyboard while the chat is open, and gives it back after
  ipcMain.on('overlay:focus', (_e, on) => {
    if (!overlay) return;
    if (!hypr) overlay.setFocusable(Boolean(on));
    // Hyprland doesn't let an X window take the keyboard by itself: it's handed over
    if (hypr?.placed) {
      hypr.focus(on).then(() => {
        // and inside it, the page itself: X focus alone leaves its text field deaf
        if (on && overlay && !overlay.isDestroyed()) {
          overlay.focus();
          overlay.webContents.focus();
        }
      }).catch((err) => console.error('[capri] Hyprland focus:', err.message));
    } else if (on) overlay.focus();
    else overlay.blur();
  });
  // a long task done while you were elsewhere: a desktop notification; clicked, Claude's window
  ipcMain.on('desktop:notify', (_e, note) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: String(note?.title || 'Capri').slice(0, 120),
      body: String(note?.body || '').slice(0, 400),
      icon: path.join(ROOT, 'assets', 'icons', 'tray.png'),
      silent: true,
    });
    const address = String(note?.window || '');
    if (hypr && address) n.on('click', () => hypr.focusWindow(address).catch(() => {}));
    n.show();
  });
  // "Take me there": Claude's window, where it waits for you (Hyprland)
  ipcMain.handle('window:focus', (_e, address) => (hypr ? hypr.focusWindow(address).catch(() => false) : false));
  // her report card's copy button: a picture of that part of the overlay, on the clipboard
  ipcMain.handle('panel:copy', async (_e, rect) => {
    const image = await overlay.webContents.capturePage(rect);
    if (image.isEmpty()) return false;
    const png = new Blob([image.toPNG()], { type: 'image/png' });
    await clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  });
  // her guide: where her tray icon is (it lives in the taskbar, off the overlay, hence overlay
  // coordinates past its edge), and the corner by the clock in case Windows hid it behind the ^
  ipcMain.handle('guide:tray', () => {
    const o = overlay.getBounds();
    const d = targetDisplay().bounds;
    const b = tray?.getBounds();
    const icon = b && b.width > 0 ? { x: b.x - o.x, y: b.y - o.y, w: b.width, h: b.height } : null;
    const corner = { x: d.x + d.width - 150 - o.x, y: d.y + d.height - 44 - o.y, w: 140, h: 40 };
    return { icon, corner };
  });
  // her guide: Claude Code's folder (~/.claude) in Explorer, its settings file selected
  ipcMain.handle('guide:claudeFolder', () => {
    const file = activeHooks().status().file;
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) return { found: false, dir };
    if (fs.existsSync(file)) shell.showItemInFolder(file);
    else shell.openPath(dir);
    return { found: true, dir, file: fs.existsSync(file), label: fs.existsSync(file) ? path.basename(file) : path.basename(dir) };
  });
  ipcMain.handle('sounds:list', () => {
    try {
      return fs.readdirSync(userSoundsDir())
        .filter((f) => SOUND_EXT.test(f))
        .map((f) => ({ name: f.replace(SOUND_EXT, '').toLowerCase(), url: `capri://usersounds/${encodeURIComponent(f)}` }));
    } catch {
      return [];
    }
  });
}

// Only in --dev: lets scripts drive the overlay and grab frames of it (no desktop content, just our window).
const testWins = new Map(); // name -> test window

async function debugHandler(route, body) {
  if (!DEV) throw new Error('debug routes need --dev');
  if (route === 'command') {
    sendCommand(body.name, body);
    return { ok: true };
  }
  if (route === 'reload') {
    overlay.webContents.reloadIgnoringCache();
    return { ok: true };
  }
  if (route === 'unhook') {
    // the pointer no longer passed on to her, as when Windows drops the mouse hook
    overlay.setIgnoreMouseEvents(true);
    return { ok: true };
  }
  if (route === 'testwin') {
    // plain windows to sit on, opened without stealing focus, by name (`id`, default "main");
    // each one opened goes in front of the others. { open: false } without an id closes them all.
    const id = body.id ?? 'main';
    if (!body.open && body.id === undefined) {
      for (const win of testWins.values()) win.destroy();
      testWins.clear();
      return { ok: true };
    }
    testWins.get(id)?.destroy();
    testWins.delete(id);
    if (body.open) {
      const b = overlay.getBounds();
      const win = new BrowserWindow({
        x: b.x + (body.x ?? 300), y: b.y + (body.y ?? 380), width: body.w ?? 720, height: body.h ?? 380,
        show: false, alwaysOnTop: true, title: `Capri test window ${id}`, backgroundColor: '#1b1726',
      });
      win.loadURL('data:text/html,<body style="background:%231b1726"></body>');
      win.showInactive();
      testWins.set(id, win);
    }
    return { ok: true };
  }
  if (route === 'movewin' && testWins.has(body.id ?? 'main')) {
    const win = testWins.get(body.id ?? 'main');
    const [x, y] = win.getPosition();
    win.setPosition(x + (body.dx || 0), y + (body.dy || 0));
    return { ok: true };
  }
  if (route === 'mouse') {
    // the pointer moving over the overlay (css px), and clicking if asked, without touching the real one
    const at = { x: Math.round(body.x), y: Math.round(body.y) };
    overlay.webContents.sendInputEvent({ type: 'mouseMove', ...at });
    if (body.click) {
      overlay.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...at });
      overlay.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...at });
    }
    return { ok: true };
  }
  if (route === 'menu') {
    // her menu as labels, and a click on one of them if asked ({ click: 'beam:cloud · ...' })
    const items = (menu) => menu.items.filter((i) => i.label).map((i) => body.details
      ? { label: i.label, enabled: i.enabled, checked: i.checked, ...(i.submenu && { submenu: items(i.submenu) }) }
      : i.submenu ? { [i.label]: items(i.submenu) } : i.label);
    const find = (menu) => menu.items.reduce((hit, i) => hit || (i.label === body.click ? i : i.submenu && find(i.submenu)), null);
    if (body.click) {
      const item = find(trayMenu);
      if (item?.enabled) item.click();
    }
    return { ok: true, value: items(trayMenu) };
  }
  if (route === 'eval') {
    // a look inside the overlay (app.js puts what's there on window.dev in --dev)
    return { ok: true, value: await overlay.webContents.executeJavaScript(String(body.js || 'null')) };
  }
  if (route === 'drag') {
    // a drag over the overlay with a stand-in pointer, the real one untouched: the button goes down
    // at the first point, follows the others (each `ms` after the one before), and comes up at the last
    const points = Array.isArray(body.points) ? body.points : [];
    if (!points.length) throw new Error('drag needs points');
    const at = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
    overlay.webContents.sendInputEvent({ type: 'mouseMove', ...at(points[0]) });
    overlay.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...at(points[0]) });
    for (const p of points.slice(1)) {
      await new Promise((r) => setTimeout(r, p.ms ?? 16));
      overlay.webContents.sendInputEvent({ type: 'mouseMove', modifiers: ['leftButtonDown'], ...at(p) });
    }
    if (body.up !== false) overlay.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...at(points.at(-1)) });
    return { ok: true };
  }
  if (route === 'type') {
    // typing into the overlay (her chat), and Enter if asked
    if (body.text) await overlay.webContents.insertText(body.text);
    if (body.enter) {
      overlay.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      overlay.webContents.sendInputEvent({ type: 'char', keyCode: 'Return' });
      overlay.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    }
    return { ok: true };
  }
  if (route === 'capture') {
    const image = await overlay.webContents.capturePage();
    // installed, the app's own folder is read-only: its data folder instead
    const dir = path.join(app.isPackaged ? app.getPath('userData') : ROOT, 'captures');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${(body.name || 'frame').replace(/[^\w-]/g, '')}.png`);
    fs.writeFileSync(file, image.toPNG());
    return { ok: true, file };
  }
  throw new Error('unknown debug route');
}

// How her window is drawn, set before Electron starts (her menu › Display). On some PCs her see-through
// window shows up black (NVIDIA with FXAA, MFAA or HDR on, for one): drawing it through OpenGL, or
// without the graphics card, often fixes it.
function applyRender() {
  const { render } = config.load();
  if (render === 'gl') app.commandLine.appendSwitch('use-angle', 'gl');
  if (render === 'software') {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('enable-unsafe-swiftshader'); // her drawing still needs WebGL, done on the CPU
  }
  // --dev: what Chromium ended up drawing with
  if (DEV) app.whenReady().then(() => setTimeout(() => console.log('[capri] display:', render, JSON.stringify(app.getGPUFeatureStatus())), 4000));
}

function main() {
  applyRender();
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  // `capri --talk` (a Hyprland keybind, say): her chat opens, or closes; `--toggle`: as Ctrl+Alt+C
  app.on('second-instance', (_e, argv) => {
    if (argv.includes('--ask-selection')) askSelection();
    else if (argv.includes('--talk')) sendCommand('talk');
    else if (argv.includes('--toggle')) toggleVisible();
    else sendCommand('status');
  });
  if (process.platform === 'win32') app.setAppUserModelId('capri.desktop');

  app.whenReady().then(async () => {
    config.initializeKeys();
    await refreshPlatform();
    if (!['codex', 'claude'].includes(config.load().assistant)) saveConfig({ assistant: activeAssistant().id });
    serveProtocol();
    registerIpc();
    createOverlay();
    createTray();
    readMemory();
    const stored = config.status();
    if (stored.blocked || memoryStore.status().blocked) notifyStorage('blocked');
    else if (stored.migrationError) notifyStorage('failed');
    else if (stored.recovery !== 'none') notifyStorage(stored.recovery === 'backup' ? 'recovered' : 'reset');
    else if (memoryStore.status().recovery !== 'none') notifyStorage(memoryStore.status().recovery === 'backup' ? 'memoryRecovered' : 'memoryReset');
    windowWatch = startWindowWatch({
      overlay,
      onUpdate: (data) => {
        // a click on the taskbar brings it up over her: sitting on it, her legs would vanish behind it
        if (data.taskbar && !lastWindows?.taskbar && config.load().rest === 'taskbar') raiseOverlay();
        lastWindows = data;
        overlay?.webContents.send('windows:update', data);
      },
    });
    createBridge({
      port: PORT,
      // her own Claude Code chat's hooks would cover its answer with theirs
      onEvent: (evt) => !llm.isChatSession(evt.session_id) && overlay?.webContents.send('claude:event', evt),
      onDebug: DEV ? debugHandler : null,
    });
    globalShortcut.register('Control+Alt+C', () => toggleVisible());
    startPointer();
    llm.restoreClaude(readMemory().claude);
    refreshModels(); // for her menu's model list
    setTimeout(() => launch.launchables().catch(() => {}), 20000); // what she can open, before you ask
    // a screen plugged in, unplugged, or rearranged: her window fitted again, and she learns of it
    const screensChanged = () => {
      fitOverlay();
      windowWatch?.refresh();
      rebuildTray();
      sendCommand('screens');
    };
    screen.on('display-metrics-changed', screensChanged);
    screen.on('display-added', screensChanged);
    screen.on('display-removed', screensChanged);
    // after sleep or a locked screen, once Windows has settled
    powerMonitor.on('resume', () => setTimeout(rearmOverlay, 2000));
    powerMonitor.on('unlock-screen', () => setTimeout(rearmOverlay, 1000));
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    windowWatch?.stop();
    clearInterval(pointerTimer);
    hyprEvents?.close();
    hypr?.restoreSync();
  });
  app.on('window-all-closed', (e) => e.preventDefault());
}

main();
