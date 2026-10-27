'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, protocol, net, shell, globalShortcut, nativeImage,
  clipboard, ClipboardItem, dialog, powerMonitor, desktopCapturer,
} = require('electron');

const config = require('./config');
const { TRAY, LANGS } = require('./labels');
const { createBridge } = require('./bridge');
const { startWindowWatch } = require('./windows');
const llm = require('./llm');
const setup = require('./setup');
const apps = require('./apps');
const launch = require('./launch');
const { ASSISTANTS, assistant } = require('./assistants');
const x11 = require('./x11');
const { locate } = require('./locate');
const agents = require('./agents');
const telegram = require('./telegram');
const activeAssistant = () => assistant(config.load().assistant); // Claude Code or Codex
const activeHooks = () => activeAssistant().hooks;
const demoSteps = require('../../scripts/demo-sequence');

const ROOT = path.resolve(__dirname, '..', '..');
const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.CAPRI_PORT) || 47823;
const SOUND_EXT = /\.(mp3|wav|ogg|m4a)$/i;

const OLLAMA_SITE = 'https://ollama.com';

// Started from a Claude Code session (npm start in its terminal), she'd hand its marks on to all she
// opens: an IDE opened by her, and the Claude Code in its terminal, would take itself for a session's
// child, never list itself in ~/.claude/sessions nor take a task from her. Her own chat's too.
for (const key of ['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'AI_AGENT', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_NEW_INIT',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN']) delete process.env[key];

protocol.registerSchemesAsPrivileged([
  { scheme: 'capri', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let overlay = null;
let tray = null;
let trayMenu = null; // also what she opens when you right-click her
let demoTimer = null;
let windowWatch = null;
// the watcher only speaks when something changes: the overlay asks for this when it (re)loads
let lastWindows = null;
let chatModels = null; // the provider's models, as last seen (null: not reached)
let chatError = null;  // why not, when the provider said
let chatErrorCode = null; // 'nokey' or 'nourl': what her setup should ask for
const chats = new Map(); // id -> AbortController of an answer being streamed

const userSoundsDir = () => path.join(app.getPath('userData'), 'sounds');

// Her memory of your chats, across restarts: { history: [{ role, content }], claude: Claude Code's session }
const memoryFile = () => path.join(app.getPath('userData'), 'memory.json');
function readMemory() {
  try {
    return JSON.parse(fs.readFileSync(memoryFile(), 'utf8'));
  } catch {
    return {};
  }
}
function saveMemory(patch) {
  try {
    fs.writeFileSync(memoryFile(), JSON.stringify({ ...readMemory(), ...patch }));
  } catch (err) {
    console.error('[capri] could not save her memory:', err.message);
  }
}
function forgetChats() {
  llm.resetClaude();
  saveMemory({ history: [], claude: null });
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

// displayId 'all': one window over every screen at once, the box around them all
function targetDisplay() {
  const { displayId } = config.load();
  const displays = screen.getAllDisplays();
  if (displayId === 'all' && displays.length > 1) {
    const box = (key) => {
      const x = Math.min(...displays.map((d) => d[key].x));
      const y = Math.min(...displays.map((d) => d[key].y));
      const right = Math.max(...displays.map((d) => d[key].x + d[key].width));
      const bottom = Math.max(...displays.map((d) => d[key].y + d[key].height));
      return { x, y, width: right - x, height: bottom - y };
    };
    return { id: 'all', bounds: box('bounds'), workArea: box('workArea') };
  }
  return displays.find((d) => d.id === displayId) || screen.getPrimaryDisplay();
}

// Her window: the work area, or the whole screen while she rests on the taskbar (her legs hang
// over it), less its top row of pixels: a window on top covering the whole screen is a fullscreen
// app to Windows (animated wallpapers pause, notifications wait). `gap`: how much of her window is
// below the top of the taskbar (0, or its height).
function overlayArea() {
  const { workArea, bounds } = targetDisplay();
  const area = config.load().rest === 'taskbar' ? { ...bounds, y: bounds.y + 1, height: bounds.height - 1 } : workArea;
  return { area, gap: area.y + area.height - (workArea.y + workArea.height) };
}

function fitOverlay() {
  if (!overlay) return;
  const { area, gap } = overlayArea();
  overlay.setBounds(area);
  overlay.webContents.send('overlay:resize', { width: area.width, height: area.height, gap });
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
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Linux: a window made unfocusable can't take the keyboard later, even made focusable again;
    // made focusable and then not, it can (her chat)
    focusable: process.platform === 'linux',
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
  overlay.loadURL('capri://app/src/renderer/index.html');
  // always shown: put away, she's still there as her biochip in the corner. Sized again first:
  // Windows keeps a new window inside the work area, and resting on the taskbar it covers it too.
  overlay.once('ready-to-show', () => {
    fitOverlay();
    overlay.setFocusable(false);
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

// Her Telegram bot (telegram.js): what you write there goes to her chat in the overlay (chat.js, its
// Telegram side), which answers through telegram:* below. token null: disconnected.
function connectTelegram(token, owner = null, bot = '') {
  const cfg = config.load();
  updateConfig({ telegram: { ...cfg.telegram, token: token ? setup.sealKey(token) : '', owner, bot } });
  startTelegram();
}

function startTelegram() {
  const { telegram: tg } = config.load();
  const token = tg?.token ? setup.openKeys({ t: tg.token }).t : '';
  if (!token) return telegram.stop();
  telegram.start(token, tg.owner ?? null, {
    onMessage: (text) => overlay?.webContents.send('telegram:in', { text }),
    onAction: (message, id) => overlay?.webContents.send('telegram:action', { message, id }),
    onPaired: (owner) => {
      const cfg = config.load();
      updateConfig({ telegram: { ...cfg.telegram, owner } });
      sendCommand('telegramPaired');
      telegram.send(TRAY[resolveLang(cfg.lang)].tgPaired).catch(() => {});
    },
  });
}

// A session done, or one that needs you, while you're away from the PC (2 minutes without a key or
// the mouse, or the screen locked): she tells you on Telegram, with the name to answer it by (@name).
const AWAY_S = 120;
const away = () => powerMonitor.getSystemIdleState(AWAY_S) !== 'active';
function tellAway(evt) {
  const cfg = config.load();
  if (!telegram.paired() || !cfg.telegram.notify || !away()) return;
  const t = TRAY[resolveLang(cfg.lang)];
  const who = agents.list().find((s) => s.sessionId === evt.session_id)?.name || path.basename(evt.cwd || '') || 'Claude';
  let text = null;
  if (evt.hook_event_name === 'Stop') text = `✓ @${who} · ${t.tgDone}\n\n${evt.last_assistant_message || ''}`;
  else if (evt.hook_event_name === 'Notification' && evt.notification_type === 'permission_prompt') text = `⚠ @${who} · ${t.tgNeeds}\n\n${evt.message || ''}`;
  if (text) telegram.send(text.trim()).catch((err) => console.error('[capri] telegram:', err.message));
}

// A session's answer to a task she handed it (agents.js, her inbox): in her chat or her panel, and on
// Telegram if that's where you asked for it, or you're away from the PC.
const handedVia = new Map(); // pid of the session -> 'telegram' | 'desktop', where you handed it the task
function onAgentReply({ from, name, text }) {
  const pid = Number(/(\d+)\.sock$/.exec(from)?.[1]) || 0;
  const via = handedVia.get(pid);
  overlay?.webContents.send('agents:reply', { name, text });
  const cfg = config.load();
  if (telegram.paired() && (via === 'telegram' || (cfg.telegram.notify && away()))) {
    telegram.send(`↩ @${name || 'Claude'}\n\n${text}`).catch((err) => console.error('[capri] telegram:', err.message));
  }
}

// Your Claude Code sessions she can hand a task to (agents.js), not the one answering her own chat
const otherSessions = () => agents.list({ skip: (id) => llm.isChatSession(id) });

function sendCommand(name, payload = {}) {
  overlay?.webContents.send('capri:command', { name, ...payload });
}

// Ctrl+Alt+C: she folds herself away into her biochip in the corner, or comes back out of it.
function toggleVisible(force) {
  const visible = typeof force === 'boolean' ? force : !config.load().visible;
  config.save({ visible });
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
// A screenshot of a window: the app `wanted`'s nearest the front, else the window `id`. Full size
// where the window manager says how big it is (Linux), else as big as a large screen.
async function windowShot(wanted, id) {
  const found = wanted && (await apps.find(wanted).catch(() => null));
  const ids = found?.wins || (id ? [id] : []);
  const snap = process.platform === 'linux' ? await x11.windowSnapshot(0).catch(() => null) : null;
  const geo = snap?.wins.find((w) => ids.includes(w.id)); // front first
  const target = geo?.id ?? ids[0];
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: geo ? { width: geo.w, height: geo.h } : { width: 3840, height: 2160 },
  }).catch(() => []);
  const source = (target && sources.find((src) => src.id.startsWith(`window:${target}:`)))
    || (wanted && sources.find((src) => src.name.toLowerCase().includes(String(wanted).toLowerCase())));
  return source ? savePicture(source.thumbnail, found?.label || source.name) : null;
}

// "~/Pictures/Capri Slack 2026-10-27 11-30-00.png", or null
async function savePicture(image, what = '') {
  if (image.isEmpty()) return null;
  const now = new Date();
  const stamp = new Date(now - now.getTimezoneOffset() * 60e3).toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-'); // local time
  const label = String(what).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  const file = path.join(app.getPath('pictures'), `Capri ${label ? `${label} ` : ''}${stamp}.png`);
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, image.toPNG());
  } catch {
    return null;
  }
  return file;
}

// A file or a folder by its name ("my-project"), a few levels down `roots`, skipping hidden
// folders and dependencies: the one named just so first, else the shortest path with it in its name.
async function findByName(roots, name, { depth = 4, max = 20000 } = {}) {
  const wanted = name.toLowerCase();
  let seen = 0;
  let partial = null;
  let level = roots.map((dir) => ({ dir, d: 0 }));
  while (level.length && seen < max) {
    const next = [];
    for (const { dir, d } of level) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (++seen > max) break;
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        const lower = e.name.toLowerCase();
        if (lower === wanted) return full;
        if (lower.includes(wanted) && (!partial || full.length < partial.length)) partial = full;
        if (e.isDirectory() && d + 1 < depth) next.push({ dir: full, d: d + 1 });
      }
    }
    if (partial) return partial; // the nearest level that has one
    level = next;
  }
  return partial;
}

function rendererConfig() {
  const { apiKeys, telegram: tg, ...cfg } = config.load(); // the keys stay here: the overlay only learns which ones are set
  return { ...cfg, keys: Object.keys(apiKeys || {}), telegram: { bot: tg?.bot || '', paired: telegram.paired() }, assistant: activeAssistant().id, lang: resolveLang(cfg.lang), langSetting: cfg.lang, floorGap: overlayArea().gap };
}

function updateConfig(patch) {
  config.save(patch);
  if ('rest' in patch) fitOverlay(); // the taskbar in her window or not
  const cfg = rendererConfig();
  overlay?.webContents.send('capri:config', cfg);
  rebuildTray();
  return cfg;
}

function rebuildTray() {
  if (!tray) return;
  const cfg = config.load();
  const hookState = activeHooks().status();
  const watched = activeAssistant();
  const t = Object.fromEntries(Object.entries(TRAY[resolveLang(cfg.lang)]).map(([key, value]) =>
    [key, typeof value === 'string' && watched.id !== 'claude' ? value.replaceAll('Claude Code', watched.name) : value]));

  const displays = screen.getAllDisplays();
  const current = targetDisplay().id;
  const sessions = otherSessions();

  const menu = Menu.buildFromTemplate([
    { label: t.online(PORT), enabled: false },
    { type: 'separator' },
    { label: t.teleport, click: () => sendCommand('teleport') },
    { label: t.satellite, click: () => sendCommand('satellite') },
    { label: t.demo, click: playDemo },
    { label: t.help, click: () => sendCommand('welcome') },
    ...(cfg.claude ? [{ label: t.report, click: () => sendCommand('report') }] : []),
    { label: t.talk, accelerator: 'Alt+C', click: () => sendCommand('chat') },
    {
      // your other Claude Code sessions: one picked opens her chat, ready to hand it a task
      label: t.agents,
      submenu: sessions.length
        ? sessions.map((s) => ({
          label: `${s.status === 'busy' ? '◉' : '○'} ${s.name}${s.project && s.project !== s.name ? ` · ${s.project}` : ''}`,
          click: () => sendCommand('chat', { to: s.name }),
        }))
        : [{ label: t.agentsNone, enabled: false }],
    },
    { label: t.custom, click: () => sendCommand('customize') },
    {
      label: t.telegram,
      submenu: telegram.paired()
        ? [
          { label: `@${cfg.telegram.bot}`, enabled: false },
          { label: t.tgNotify, type: 'checkbox', checked: cfg.telegram.notify, click: (item) => updateConfig({ telegram: { ...cfg.telegram, notify: item.checked } }) },
          { label: t.tgDisconnect, click: () => connectTelegram(null) },
        ]
        : [{ label: t.tgConnect, click: () => sendCommand('telegram') }],
    },
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
      enabled: displays.length > 1,
      submenu: [
        ...displays.map((d, i) => ({
          label: `${i + 1} — ${d.size.width}×${d.size.height}`,
          type: 'radio',
          checked: d.id === current,
          click: () => { config.save({ displayId: d.id }); fitOverlay(); rebuildTray(); },
        })),
        {
          label: t.allScreens,
          type: 'radio',
          checked: current === 'all',
          click: () => { config.save({ displayId: 'all' }); fitOverlay(); rebuildTray(); },
        },
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
            label: name, type: 'radio', checked: name === pickModel(cfg), click: () => updateConfig({ chatModel: name }),
          }))
          : [{ label: (chatError || t.noOllama).slice(0, 80), enabled: false }]),
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
    { label: t.possess, type: 'checkbox', checked: cfg.possess, click: (item) => updateConfig({ possess: item.checked }) },
    {
      label: t.rest,
      submenu: [['corner', t.restCorner], ['taskbar', t.restTaskbar]].map(([rest, label]) => ({
        label, type: 'radio', checked: cfg.rest === rest, click: () => updateConfig({ rest }),
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
      submenu: [['auto', t.motionAuto], ['full', t.motionFull], ['reduced', t.motionReduced]].map(([motion, label]) => ({
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
          config.save({ render });
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
      label: t.startup,
      type: 'checkbox',
      checked: app.getLoginItemSettings(loginItemOptions()).openAtLogin,
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

// The model she talks with: the one picked in her menu if it's still installed, else the first.
function pickModel(cfg = config.load()) {
  if (!chatModels?.length) return null;
  return chatModels.includes(cfg.chatModel) ? cfg.chatModel : chatModels[0];
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
  return chatModels;
}

// Her answer from the model picked, or from the next one when that one can't: too busy twice in a row
// (Gemini's "high demand"), or not served anymore (an older model closed to new keys). The model
// that answered is kept for next time.
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
      if (signal.aborted || streamed() || !['busy', 'gone'].includes(err.code)) throw err;
      if (err.code === 'busy' && busy++ === 0) {
        await new Promise((r) => setTimeout(r, 1500)); // usually gone a moment later
        continue;
      }
      tried.add(model);
      const next = chatModels?.find((m) => !tried.has(m));
      if (!next || tried.size >= 3) throw err;
      model = next;
      busy = 0;
    }
  }
}

async function pickProvider(provider) {
  updateConfig({ provider });
  await refreshModels();
  if (chatErrorCode) sendCommand('setupKey'); // it needs a key or an address: she asks for it
}

// What llm.js gets: the config with its keys opened (they're kept encrypted, setup.js)
function llmConfig(cfg = config.load()) {
  return { ...cfg, apiKeys: setup.openKeys(cfg.apiKeys) };
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
  ipcMain.on('overlay:interactive', (_e, on) => {
    overlay?.setIgnoreMouseEvents(!on, { forward: true });
  });
  ipcMain.on('overlay:rearm', () => rearmOverlay()); // the pointer moved over her and she never heard of it
  ipcMain.handle('overlay:cursor', async () => {
    const px = process.platform === 'linux' && (await x11.cursorPoint());
    const scale = screen.getPrimaryDisplay().scaleFactor;
    const p = px ? { x: px.x / scale, y: px.y / scale } : screen.getCursorScreenPoint();
    const b = overlay.getBounds();
    return { x: p.x - b.x, y: p.y - b.y, inside: p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height };
  });
  ipcMain.handle('config:get', () => rendererConfig());
  ipcMain.handle('hooks:status', () => activeHooks().status());
  ipcMain.handle('config:set', (_e, patch) => updateConfig(patch));
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
    llm.warm(provider, pickModel()); // loading while you type your first message
    return { ok: true, provider, model: pickModel(), agent: provider === 'claude', local: llm.isLocal(provider, cfg), warmup: provider === 'ollama' };
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
  ipcMain.handle('chat:memory', () => readMemory().history || []);
  ipcMain.on('chat:remember', (_e, history) => Array.isArray(history) && saveMemory({ history }));
  ipcMain.on('chat:ollama', () => shell.openExternal(OLLAMA_SITE));
  // setting her up with buttons (setup.js): Ollama and a model, or a key, or an address
  const progress = (payload) => overlay?.webContents.send('setup:progress', payload);
  let pulling = null; // AbortController of the model being fetched
  ipcMain.handle('setup:info', () => ({ models: setup.MODELS, ram: os.totalmem(), keyed: Object.keys(setup.KEY_PAGES) }));
  ipcMain.handle('setup:ollama', () => setup.ollamaState());
  ipcMain.handle('setup:install', () => setup.installOllama((line) => progress({ kind: 'install', line })));
  ipcMain.handle('setup:start', async () => {
    const res = await setup.startOllama();
    await refreshModels();
    return res;
  });
  ipcMain.handle('setup:pull', async (_e, name) => {
    if (!setup.MODELS.some((m) => m.name === name)) return { ok: false, error: 'unknown model' };
    pulling?.abort();
    const abort = new AbortController();
    pulling = abort;
    try {
      await setup.pullModel(name, (p) => progress({ kind: 'pull', ...p }), abort.signal);
      updateConfig({ provider: 'ollama' });
      await refreshModels();
      const model = chatModels?.find((m) => m === name || m.startsWith(`${name}:`));
      if (model) updateConfig({ chatModel: model });
      return { ok: true, model };
    } catch (err) {
      return { ok: false, error: abort.signal.aborted ? 'stopped' : err.message };
    } finally {
      if (pulling === abort) pulling = null;
    }
  });
  ipcMain.on('setup:cancel', () => pulling?.abort());
  // who answers her chat, with its key or address if it needs one: saved, tried, and undone if it fails
  ipcMain.handle('setup:use', async (_e, { provider, key, url }) => {
    if (!llm.PROVIDERS[provider]) return { ok: false, error: 'unknown provider' };
    const before = config.load();
    const patch = { provider };
    if (key) patch.apiKeys = { ...before.apiKeys, [provider]: setup.sealKey(String(key).trim()) };
    if (url) patch.customUrl = String(url).trim();
    updateConfig(patch);
    const models = await refreshModels();
    if (models?.length) return { ok: true, model: pickModel() };
    const error = models ? 'no model' : chatError || 'offline';
    updateConfig({ provider: before.provider, apiKeys: before.apiKeys, customUrl: before.customUrl });
    await refreshModels();
    return { ok: false, error };
  });
  ipcMain.on('setup:keyPage', (_e, provider) => setup.KEY_PAGES[provider] && shell.openExternal(setup.KEY_PAGES[provider]));
  ipcMain.handle('setup:launch', (_e, integration) => setup.launchThroughOllama(integration));
  // closing an app you asked her to close, once you've clicked to confirm (apps.js)
  const appInfo = (app) => app && { name: app.process, label: app.label };
  ipcMain.handle('apps:list', async () => (await apps.list().catch(() => [])).map(appInfo));
  ipcMain.handle('apps:find', async (_e, wanted) => appInfo(await apps.find(wanted).catch(() => null)));
  ipcMain.handle('apps:close', (_e, { name, force }) => apps.close(name, { force }).catch((err) => ({ error: err.message })));
  // opening things you ask her to (launch.js): an app or a game, your music, a website
  ipcMain.handle('apps:findLaunch', (_e, text) => launch.find(String(text || '')).catch(() => null));
  ipcMain.handle('apps:launch', (_e, item) => launch.launch(item).then(() => ({ ok: true }), (err) => ({ ok: false, error: err.message })));
  ipcMain.handle('apps:media', (_e, action) => launch.media(action));
  ipcMain.handle('apps:music', (_e, query) => launch.music(query).catch(() => false));
  ipcMain.handle('apps:site', (_e, address) => launch.site(address).catch(() => false));
  // handing a task to one of your other Claude Code sessions (agents.js), once you've clicked to send it
  ipcMain.handle('agents:list', () => otherSessions());
  ipcMain.handle('agents:find', (_e, wanted) => agents.find(String(wanted || ''), { skip: (id) => llm.isChatSession(id) }));
  ipcMain.handle('agents:send', (_e, { pid, text, via }) => {
    handedVia.set(pid, via === 'telegram' ? 'telegram' : 'desktop');
    return agents.send(pid, text).then(() => ({ ok: true }), (err) => ({ ok: false, error: err.message }));
  });
  ipcMain.handle('agents:status', (_e, pid) => agents.status(pid));
  // her Telegram bot: the token checked, then a code for you to send it (whoever sends it is who she answers)
  ipcMain.handle('telegram:connect', async (_e, token) => {
    const res = await telegram.check(String(token || '').trim());
    if (!res.ok) return res;
    connectTelegram(String(token).trim(), null, res.bot);
    return { ok: true, bot: res.bot, code: telegram.pairingCode() };
  });
  ipcMain.handle('telegram:send', (_e, { text, buttons }) => telegram.send(text, buttons));
  ipcMain.handle('telegram:edit', (_e, { id, text, buttons }) => telegram.edit(id, text, buttons));
  ipcMain.handle('telegram:photo', (_e, { file, caption }) => telegram.photo(file, caption));
  ipcMain.on('telegram:typing', () => telegram.typing());
  // her chat: the file you downloaded last (not one still downloading), or null
  ipcMain.handle('files:latest', async () => {
    const dir = app.getPath('downloads');
    const names = await fs.promises.readdir(dir).catch(() => []);
    const files = await Promise.all(names
      .filter((n) => !n.startsWith('.') && !/\.(part|crdownload|download|tmp)$/i.test(n))
      .map((n) => fs.promises.stat(path.join(dir, n)).then((st) => ({ file: path.join(dir, n), at: st.mtimeMs }), () => null)));
    return files.filter(Boolean).sort((a, b) => b.at - a.at)[0]?.file || null;
  });
  // her chat: a screenshot saved in your pictures, its path or null. A window's (an app named `app`,
  // else the window `id`), even covered; else the screen your pointer is on.
  ipcMain.handle('files:screenshot', async (_e, what) => {
    if (what?.app || what?.id) return windowShot(what.app, what.id);
    const px = process.platform === 'linux' && (await x11.cursorPoint());
    const scale = screen.getPrimaryDisplay().scaleFactor;
    const display = screen.getDisplayNearestPoint(px ? { x: Math.round(px.x / scale), y: Math.round(px.y / scale) } : screen.getCursorScreenPoint());
    const { width, height } = display.size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(width * display.scaleFactor), height: Math.round(height * display.scaleFactor) },
    }).catch(() => []);
    const source = sources.find((src) => src.display_id === String(display.id)) || sources[0];
    return source ? savePicture(source.thumbnail) : null;
  });
  // where the file manager shows it, in overlay coordinates (Linux), or null
  ipcMain.handle('files:locate', async (_e, name) => {
    const at = await locate(name);
    if (!at || !overlay) return null;
    const b = overlay.getBounds();
    const scale = screen.getPrimaryDisplay().scaleFactor; // X11: one scale for every screen
    return { x: at.x / scale - b.x, y: at.y / scale - b.y, w: at.w / scale, h: at.h / scale };
  });
  // her chat: a file or a folder you asked to see, selected in the file manager. A relative name is
  // looked for in Claude Code's folder, then in your home, then a few levels down them.
  // Opened (open: true), in the app it goes with; a folder in the file manager.
  ipcMain.handle('files:show', async (_e, wanted, { open = false } = {}) => {
    const home = app.getPath('home');
    const name = String(wanted || '').trim().replace(/^~(?=$|[\\/])/, home);
    const roots = [...new Set([config.load().claudeCwd || home, home])];
    const file = name && (roots.map((dir) => path.resolve(dir, name)).find((f) => fs.existsSync(f))
      || (!/[\\/]/.test(name) && (await findByName(roots, name))));
    if (!file) return { found: false };
    if (!open) shell.showItemInFolder(file);
    else if (await shell.openPath(file)) return { found: false }; // an error message: nothing opens it
    return { found: true, name: path.basename(file), path: file };
  });
  // typing to her: the overlay takes the keyboard while the chat is open, and gives it back after
  // (Linux: blur() leaves it with her, so the window that had it gets it back from the window manager)
  let hadKeyboard = null;
  ipcMain.on('overlay:focus', async (_e, on) => {
    if (!overlay) return;
    const self = process.platform === 'linux' && overlay.getNativeWindowHandle().readUInt32LE(0);
    if (self && on) {
      const active = await x11.activeWindow();
      if (active !== self) hadKeyboard = active; // the window to give it back to: not hers
    }
    overlay.setFocusable(Boolean(on));
    if (on) overlay.focus();
    else overlay.blur();
    // Linux: focus() alone doesn't take the keyboard from the window you're in; the window manager does
    if (self && on) x11.activateWindow(self);
    if (process.platform === 'linux' && !on && hadKeyboard) {
      x11.activateWindow(hadKeyboard);
      hadKeyboard = null;
    }
  });
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
  if (route === 'telegram') {
    // as if you'd written it to her bot: { text }
    overlay?.webContents.send('telegram:in', { text: String(body.text || '') });
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
  app.on('second-instance', () => sendCommand('status'));
  if (process.platform === 'win32') app.setAppUserModelId('capri.desktop');

  app.whenReady().then(() => {
    if (!['codex', 'claude'].includes(config.load().assistant)) config.save({ assistant: activeAssistant().id });
    serveProtocol();
    registerIpc();
    createOverlay();
    createTray();
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
      onEvent: (evt) => {
        if (llm.isChatSession(evt.session_id)) return;
        overlay?.webContents.send('claude:event', evt);
        tellAway(evt);
      },
      onHandoff: ({ session, task }) => {
        if (!task?.trim()) return { ok: false, error: 'no task' };
        const found = agents.find(String(session || ''), { skip: (id) => llm.isChatSession(id) });
        if (!found.length) {
          const names = otherSessions().map((s) => s.name).join(', ') || 'none';
          return { ok: false, error: `no session called "${session}" (running: ${names})` };
        }
        overlay?.webContents.send('agents:handoff', { name: found.length === 1 ? found[0].name : session, task: task.trim() });
        return { ok: true, name: found[0].name };
      },
      onDebug: DEV ? debugHandler : null,
    });
    // --dev: the overlay's console in this terminal, for what goes wrong in there (her Telegram chat…)
    if (DEV) overlay?.webContents.on('console-message', (e) => e.level !== 'debug' && e.level !== 'info' && console.log(`[overlay ${e.level}] ${e.message}`));
    globalShortcut.register('Control+Alt+C', () => toggleVisible());
    if (!globalShortcut.register('Alt+C', () => sendCommand('chat'))) console.error('[capri] Alt+C is taken: her chat has no shortcut'); // her chat, from anywhere
    llm.restoreClaude(readMemory().claude);
    refreshModels(); // for her menu's model list
    // her menu's list of your sessions, as they come and go (their files change at every turn: only then)
    let shownSessions = '';
    startTelegram();
    agents.inbox(onAgentReply); // what your sessions answer, about the tasks she handed them
    agents.watch(() => {
      const now = JSON.stringify(otherSessions().map((s) => [s.pid, s.name, s.status]));
      if (now !== shownSessions) rebuildTray();
      shownSessions = now;
    });
    setTimeout(() => launch.launchables().catch(() => {}), 20000); // what she can open, before you ask
    screen.on('display-metrics-changed', fitOverlay);
    screen.on('display-added', () => { fitOverlay(); rebuildTray(); });
    screen.on('display-removed', () => { fitOverlay(); rebuildTray(); });
    // after sleep or a locked screen, once Windows has settled
    powerMonitor.on('resume', () => setTimeout(rearmOverlay, 2000));
    powerMonitor.on('unlock-screen', () => setTimeout(rearmOverlay, 1000));
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    windowWatch?.stop();
  });
  app.on('window-all-closed', (e) => e.preventDefault());
}

main();
