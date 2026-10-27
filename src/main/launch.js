'use strict';

// Opening things when you ask her to (chat.js): an app from the Start menu (Store apps like Spotify
// included), a Steam or Epic game, your music (the media keys: pause, next…, so it works with
// Spotify and most players), a Spotify search, or a website. Windows, and Linux: its apps' .desktop
// entries, Steam's games, the players' MPRIS controls and PulseAudio's (or PipeWire's) volume.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { shell } = require('electron');
const { powershell } = require('./apps');

const WIN = process.platform === 'win32';
const LINUX = process.platform === 'linux';
// not things to open from a chat: uninstallers, help pages and the like
const SKIP = /uninstall|désinstaller|desinstalar|deinstall|readme|documentation|release notes|support center|website|manual/i;
const STEAM_SKIP = /redistributable|dedicated server|steamworks/i;
// words that don't tell apps apart ("Roblox Player" is "roblox")
const FILLER = new Set(['player', 'launcher', 'app', 'the', 'for', 'windows', 'desktop', 'client', 'x64', 'x86', 'beta', 'web', 'browser',
  'edition', 'ultimate', 'community']);
const CACHE_MS = 10 * 60 * 1000; // installed apps hardly change

let cache = null; // { at, items }

const plain = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const words = (text) => plain(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);

// Everything she can open: [{ name, kind: 'app' | 'steam' | 'epic', id }]
async function launchables() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  if (!WIN && !LINUX) return [];
  const items = [];
  const seen = new Set();
  const add = (item) => {
    const key = words(item.name).join(' ');
    if (!key || seen.has(key) || SKIP.test(item.name)) return;
    seen.add(key);
    items.push(item);
  };
  // games first: a game's own entry wins over a shortcut to it
  if (LINUX) {
    for (const game of steamGames(linuxSteamRoot())) add(game);
    for (const app of desktopApps()) add(app);
    cache = { at: Date.now(), items };
    return items;
  }
  for (const game of [...steamGames(await steamRoot()), ...epicGames()]) add(game);
  // the Start menu's list is slow the first time (PowerShell starting cold): main.js asks for it early
  const out = await powershell('Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress', 45000).catch(() => null);
  for (const { Name, AppID } of [].concat(out ? JSON.parse(out) : [])) {
    if (Name && AppID && !/^https?:/i.test(AppID)) add({ name: Name, kind: 'app', id: AppID });
  }
  if (out !== null) cache = { at: Date.now(), items }; // a list that failed isn't kept: next time, again
  return items;
}

function steamRoot() {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      const found = !err && /SteamPath\s+REG_SZ\s+(.+)/.exec(String(out))?.[1].trim();
      resolve(found ? path.normalize(found) : null);
    });
  });
}

function linuxSteamRoot() {
  const home = os.homedir();
  return [path.join(home, '.local', 'share', 'Steam'), path.join(home, '.steam', 'steam')]
    .find((dir) => fs.existsSync(path.join(dir, 'steamapps'))) || null;
}

// Linux: the apps a launcher shows, from the .desktop files in the XDG data folders (snaps and
// flatpaks have theirs there too); the first one of an id wins, as for the desktop
function desktopApps() {
  const home = os.homedir();
  const dirs = [
    process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'),
    ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':'),
    path.join(home, '.local', 'share', 'flatpak', 'exports', 'share'),
    '/var/lib/flatpak/exports/share',
    '/var/lib/snapd/desktop',
  ].filter(Boolean).map((dir) => path.join(dir, 'applications'));
  const ids = new Set();
  const apps = [];
  const walk = (dir, prefix) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file, `${prefix}${entry.name}-`);
      else if (entry.name.endsWith('.desktop') && !ids.has(prefix + entry.name)) {
        ids.add(prefix + entry.name);
        const name = desktopName(file);
        if (name) apps.push({ name, kind: 'desktop', id: file });
      }
    }
  };
  for (const dir of [...new Set(dirs)]) walk(dir, '');
  return apps;
}

// Its [Desktop Entry] keys, the unlocalized ones ({ Name, Exec, ... })
function desktopEntry(file) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    // gone: nothing in it
  }
  const section = /^\[Desktop Entry\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text)?.[1] || '';
  return Object.fromEntries([...section.matchAll(/^([A-Za-z0-9-]+)\s*=\s*(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
}

// Whether the program it runs is there: its path, or a command on the PATH (a leftover entry can
// point at an app long gone)
function installed(command) {
  const program = /^\s*(?:"([^"]+)"|(\S+))/.exec(command || '');
  const file = program?.[1] || program?.[2];
  if (!file) return false;
  const executable = (f) => {
    try {
      fs.accessSync(f, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  if (file.includes('/')) return executable(file);
  return (process.env.PATH || '').split(':').some((dir) => dir && executable(path.join(dir, file)));
}

// Its name, if it's an app to open from a chat: not hidden, not a terminal tool, still installed
function desktopName(file) {
  const e = desktopEntry(file);
  if (e.Type !== 'Application' || e.NoDisplay === 'true' || e.Hidden === 'true' || e.Terminal === 'true' || !e.Exec) return null;
  if (!installed(e.TryExec || e.Exec)) return null;
  return e.Name || null;
}

// Steam's games, from the manifests in each of its libraries
function steamGames(root) {
  if (!root) return [];
  const libraries = new Set([root]);
  try {
    const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.add(path.normalize(m[1].replace(/\\\\/g, '\\')));
  } catch {
    // one library, the main one
  }
  const games = [];
  for (const library of libraries) {
    let files = [];
    try {
      files = fs.readdirSync(path.join(library, 'steamapps')).filter((f) => /^appmanifest_\d+\.acf$/.test(f));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const acf = fs.readFileSync(path.join(library, 'steamapps', file), 'utf8');
        const id = /"appid"\s+"(\d+)"/.exec(acf)?.[1];
        const name = /"name"\s+"([^"]+)"/.exec(acf)?.[1];
        if (id && name && !STEAM_SKIP.test(name)) games.push({ name, kind: 'steam', id });
      } catch {
        // a manifest being written: skip it
      }
    }
  }
  return games;
}

// Epic's games, from its launcher's manifests (not the Unreal Engine plugins it also keeps there)
function epicGames() {
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.item'));
  } catch {
    return [];
  }
  const games = [];
  for (const file of files) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (m.bIsIncompleteInstall || m.CatalogNamespace === 'ue' || !m.DisplayName || !m.AppName) continue;
      games.push({ name: m.DisplayName, kind: 'epic', id: `${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}` });
    } catch {
      // not one of its manifests
    }
  }
  return games;
}

// The one of `items` named in `text` (your message, or the name in her tag): all the words of its
// name in it, else at least half of them; the closest wins. null if nothing fits well enough.
function match(items, text) {
  const said = new Set(words(text));
  const joined = words(text).join('');
  let best = null;
  for (const item of items) {
    const key = words(item.name).filter((w) => !FILLER.has(w));
    if (!key.length) continue;
    const hits = key.filter((w) => said.has(w) || (w.length >= 5 && joined.includes(w)));
    if (!hits.some((w) => w.length >= 3) || hits.length / key.length < 0.5) continue;
    const rank = (hits.length / key.length) * 10 + hits.join('').length / 10;
    if (!best || rank > best.rank) best = { item, rank };
  }
  return best?.item || null;
}

async function find(text) {
  return match(await launchables(), text);
}

// Opens one of them (only something she listed herself): a Start menu app through its AppsFolder
// entry (desktop and Store apps alike), a game through its launcher's link.
async function launch({ kind, id } = {}) {
  const item = (await launchables()).find((i) => i.kind === kind && i.id === id);
  if (!item) throw new Error('not found');
  if (kind === 'steam') return shell.openExternal(`steam://rungameid/${id}`);
  if (kind === 'epic') return shell.openExternal(`com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=launch&silent=true`);
  if (kind === 'desktop') {
    // as the desktop's launcher would: its Exec line, without the files and links it could be given
    const entry = desktopEntry(id);
    const exec = entry.Exec?.replace(/%[fFuUdDnNickvm]/g, '').replace(/%%/g, '%').trim();
    if (!exec) throw new Error('nothing to run');
    spawn('/bin/sh', ['-c', exec], { cwd: entry.Path || os.homedir(), detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    return undefined;
  }
  spawn('explorer.exe', [`shell:AppsFolder\\${id}`], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return undefined;
}

// The media keys, as if pressed on the keyboard: whatever plays music (Spotify, a browser…) reacts.
// Play and pause are the same key; the volume moves a few steps at a time.
const MEDIA = { pause: [179, 1], play: [179, 1], next: [176, 1], previous: [177, 1], volup: [175, 5], voldown: [174, 5], mute: [173, 1] };

async function media(action) {
  if (LINUX) return linuxMedia(action);
  if (!WIN || !MEDIA[action]) return false;
  const [key, times] = MEDIA[action];
  return powershell(`$w = New-Object -ComObject WScript.Shell; 1..${times} | ForEach-Object { $w.SendKeys([string][char]${key}) }`)
    .then(() => true, () => false);
}

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 5000, env: { ...process.env, LC_ALL: 'C' } }, (err, out) => resolve(err ? null : String(out)));
});

// The default sink's volume, in percent (its left channel), or null
async function sinkVolume() {
  const info = await run('pactl', ['info']);
  const sink = /^Default Sink: (.+)$/m.exec(info || '')?.[1];
  const sinks = (await run('pactl', ['list', 'sinks'])) || '';
  const block = sinks.split(/^Sink #/m).find((b) => sink && b.includes(`Name: ${sink}\n`));
  const pct = /^\s*Volume:.*?(\d+)%/m.exec(block || '')?.[1];
  return pct ? Number(pct) : null;
}

// Linux: the players through MPRIS (D-Bus), the one playing first; the volume through pactl.
async function linuxMedia(action) {
  if (action === 'volup' || action === 'voldown') {
    // never past 100%: pactl would go on, louder than the sound card's own
    const now = await sinkVolume();
    const to = action === 'volup' ? Math.min(100, (now ?? 90) + 10) : Math.max(0, (now ?? 10) - 10);
    return (await run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${to}%`])) !== null;
  }
  if (action === 'mute') return (await run('pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'])) !== null;
  const method = { pause: 'Pause', play: 'Play', next: 'Next', previous: 'Previous' }[action];
  if (!method) return false;
  const names = await run('dbus-send', ['--session', '--print-reply', '--dest=org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.ListNames']);
  const players = [...(names || '').matchAll(/"(org\.mpris\.MediaPlayer2\.[^"]+)"/g)].map((m) => m[1]);
  if (!players.length) return false;
  const status = await Promise.all(players.map((p) => run('dbus-send', [
    '--session', '--print-reply', `--dest=${p}`, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties.Get',
    'string:org.mpris.MediaPlayer2.Player', 'string:PlaybackStatus',
  ])));
  const playing = players.filter((_, i) => /"Playing"/.test(status[i] || ''));
  // pausing: all that play; the rest: the one playing, else the first there
  const targets = action === 'pause' ? playing : [playing[0] || players[0]];
  const done = await Promise.all(targets.map((p) => run('dbus-send', [
    '--session', '--print-reply', `--dest=${p}`, '/org/mpris/MediaPlayer2', `org.mpris.MediaPlayer2.Player.${method}`,
  ])));
  return done.some((out) => out !== null);
}

// A Spotify search for it: in the app if it's installed, else on the web.
async function music(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return false;
  // Linux: xdg-open doesn't say when nothing opens spotify: links, so ask first
  const app = !LINUX || Boolean((await run('xdg-mime', ['query', 'default', 'x-scheme-handler/spotify']))?.trim());
  if (!app) {
    await shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(q)}`);
    return true;
  }
  try {
    await shell.openExternal(`spotify:search:${encodeURIComponent(q)}`);
  } catch {
    await shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(q)}`);
  }
  return true;
}

// A website: http or https, with a real host name.
function siteUrl(address) {
  try {
    const url = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}

async function site(address) {
  const url = siteUrl(String(address || '').trim());
  if (!url) return false;
  await shell.openExternal(url.toString());
  return true;
}

module.exports = { launchables, match, find, launch, media, music, site, siteUrl };
