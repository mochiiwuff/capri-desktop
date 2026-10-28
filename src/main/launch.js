'use strict';

// Opening things when you ask her to (chat.js): an app from the Start menu (Store apps like Spotify
// included), a Steam or Epic game, your music (the media keys: pause, next…, so it works with
// Spotify and most players), a Spotify search, or a website. Windows only.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { app, shell } = require('electron');
const { powershell } = require('./apps');
const desktop = require('./desktop-entries');

const WIN = process.platform === 'win32';
// not things to open from a chat: uninstallers, help pages and the like
const SKIP = /uninstall|désinstaller|desinstalar|deinstall|readme|documentation|release notes|support center|website|manual/i;
const STEAM_SKIP = /redistributable|dedicated server|steamworks/i;
// words that don't tell apps apart ("Roblox Player" is "roblox", "AM Music" is "am")
const FILLER = new Set(['player', 'launcher', 'app', 'the', 'for', 'windows', 'desktop', 'client', 'x64', 'x86', 'beta', 'music', 'musique', 'media', 'audio', 'video', 'videos']);
const CACHE_MS = 10 * 60 * 1000; // installed apps hardly change

let cache = null; // { at, items }

const plain = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const words = (text) => plain(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);

// Everything she can open: [{ name, kind: 'app' | 'steam' | 'epic', id }]
async function launchables() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  if (process.platform === 'linux') {
    const seen = new Set();
    const items = desktop.entries().filter((e) => {
      const key = words(e.name).join(' ');
      if (!key || seen.has(key) || SKIP.test(e.name)) return false;
      seen.add(key);
      return true;
    }).map((e) => ({ name: e.name, kind: 'desktop', id: e.id }));
    cache = { at: Date.now(), items };
    return items;
  }
  if (!WIN) return [];
  const items = [];
  const seen = new Set();
  const add = (item) => {
    const key = words(item.name).join(' ');
    if (!key || seen.has(key) || SKIP.test(item.name)) return;
    seen.add(key);
    items.push(item);
  };
  // games first: a game's own entry wins over a shortcut to it
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
    const all = words(item.name);
    const key = all.filter((w) => !FILLER.has(w));
    if (!key.length) key.push(...all); // a name made only of those ("Media Player"): all of it
    if (!key.length) continue;
    const hits = key.filter((w) => said.has(w) || (w.length >= 5 && joined.includes(w)));
    // a word of 3 letters or more, or all of a short name ("am" for AM Music)
    if (!(hits.some((w) => w.length >= 3) || hits.length === key.length) || hits.length / key.length < 0.5) continue;
    const rank = (hits.length / key.length) * 10 + hits.join('').length / 10;
    if (!best || rank > best.rank) best = { item, rank };
  }
  return best?.item || null;
}

// What's on your desktop (yours and the shared one): files, folders and shortcuts, by name.
function desktopItems() {
  const dirs = [app.getPath('desktop')];
  if (WIN) dirs.push(path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'));
  const items = [];
  for (const dir of dirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || /^desktop\.ini$/i.test(e.name)) continue;
      const folder = e.isDirectory();
      items.push({ name: folder ? e.name : e.name.replace(/\.[^.]+$/, ''), kind: folder ? 'folder' : 'file', id: path.join(dir, e.name) });
    }
  }
  return items;
}

// files that run something: never opened without a click, even named by you
const RUNS = /\.(desktop|sh|bash|zsh|fish|run|appimage|bin|exe|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|msi|msp|reg|scr|com|jar|hta|cpl|pif)$/i;
const risky = (item) => item?.kind === 'file' && RUNS.test(item.id);

// Folders asked for by what they are ("ouvre mes téléchargements", "open the file explorer").
const FOLDERS = [
  ['explorer', /explorateur|file explorer|\bexplorer\b|ce pc|this pc|explorador|проводник/i],
  ['recycle', /corbeille|recycle bin|\btrash\b|papelera|lixeira|корзин/i],
  ['downloads', /t[ée]l[ée]chargements?|downloads?|descargas|transfer[êe]ncias|загрузк/i],
  ['desktop', /\bbureau\b|\bdesktop\b|escritorio|[áa]rea de trabalho|рабоч\S* стол/i],
  ['documents', /\bdocuments?\b|documentos|документ/i],
  ['pictures', /\bimages\b|\bphotos\b|\bpictures\b|im[áa]genes|\bfotos\b|imagens|изображени|фото/i],
  ['music', /dossier (de )?musique|music folder|carpeta de m[úu]sica|pasta de m[úu]sica|папк\S* (с )?музык/i],
  ['videos', /\bvid[ée]os\b|v[íi]deos|видео/i],
];

function knownFolder(text) {
  const hit = FOLDERS.find(([, re]) => re.test(text));
  return hit ? { name: hit[0], kind: 'known', id: hit[0] } : null;
}

function openKnown(id) {
  if (!WIN && id === 'explorer') return shell.openPath(app.getPath('home'));
  if (!WIN && id === 'recycle') return shell.openExternal('trash:///');
  if (id === 'explorer') return spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  if (id === 'recycle') return spawn('explorer.exe', ['shell:RecycleBinFolder'], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return shell.openPath(app.getPath(id));
}

// What you asked to open: an app or a game, something on your desktop, else a folder by what it is.
async function find(text) {
  return match([...desktopItems(), ...(await launchables())], text) || knownFolder(text);
}

// Opens one of them (only something she listed herself): a Start menu app through its AppsFolder
// entry (desktop and Store apps alike), a game through its launcher's link, a file or folder from
// your desktop, a folder by what it is.
async function launch({ kind, id } = {}) {
  if (kind === 'known') {
    if (!FOLDERS.some(([key]) => key === id)) throw new Error('not found');
    await openKnown(id);
    return undefined;
  }
  if (kind === 'file' || kind === 'folder') {
    if (!desktopItems().some((i) => i.id === id)) throw new Error('not found');
    const err = await shell.openPath(id);
    if (err) throw new Error(err);
    return undefined;
  }
  const item = (await launchables()).find((i) => i.kind === kind && i.id === id);
  if (!item) throw new Error('not found');
  if (kind === 'steam') return shell.openExternal(`steam://rungameid/${id}`);
  if (kind === 'epic') return shell.openExternal(`com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=launch&silent=true`);
  if (kind === 'desktop') {
    // as the menu would (gio reads its Exec line), with your environment: not her own Claude's
    const env = { ...process.env };
    delete env.CLAUDE_CONFIG_DIR;
    spawn('gio', ['launch', item.id], { detached: true, stdio: 'ignore', env }).on('error', () => {}).unref();
    return undefined;
  }
  spawn('explorer.exe', [`shell:AppsFolder\\${id}`], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return undefined;
}

// The media keys, as if pressed on the keyboard: whatever plays music (Spotify, a browser…) reacts.
// Play and pause are the same key; the volume moves a few steps at a time. Sent as keys (their virtual
// key codes), not typed: typed, they come out as "³" or "°" on a German keyboard.
const MEDIA = { pause: [0xb3, 1], play: [0xb3, 1], next: [0xb0, 1], previous: [0xb1, 1], volup: [0xaf, 5], voldown: [0xae, 5], mute: [0xad, 1] };
const KEY_DOWN = 1; // KEYEVENTF_EXTENDEDKEY
const KEY_UP = 3;   // ...and KEYEVENTF_KEYUP

// Linux: the player through MPRIS (playerctl), the volume through PipeWire (wpctl)
const LINUX_MEDIA = {
  pause: ['playerctl', ['pause']], play: ['playerctl', ['play']], next: ['playerctl', ['next']],
  previous: ['playerctl', ['previous']], mute: ['wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle']],
  volup: ['wpctl', ['set-volume', '-l', '1.0', '@DEFAULT_AUDIO_SINK@', '10%+']],
  voldown: ['wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '10%-']],
};

async function media(action) {
  if (process.platform === 'linux' && LINUX_MEDIA[action]) {
    const [command, args] = LINUX_MEDIA[action];
    return new Promise((resolve) => execFile(command, args, { timeout: 3000 }, (err) => resolve(!err)));
  }
  if (!WIN || !MEDIA[action]) return false;
  const [key, times] = MEDIA[action];
  return powershell(
    'Add-Type -Namespace Capri -Name Keys -MemberDefinition \'[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);\'; '
    + `1..${times} | ForEach-Object { [Capri.Keys]::keybd_event(${key}, 0, ${KEY_DOWN}, [UIntPtr]::Zero); [Capri.Keys]::keybd_event(${key}, 0, ${KEY_UP}, [UIntPtr]::Zero) }`,
  ).then(() => true, () => false);
}

// A Spotify search for it: in the app if it's installed, else on the web.
async function music(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return false;
  try {
    await shell.openExternal(`spotify:search:${encodeURIComponent(q)}`);
  } catch {
    await shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(q)}`);
  }
  return true;
}

// A song on YouTube, the exact video: the first result of a search (no key needed), opened in your
// browser. { title } of what it found, or { title: null } when it could only open the search.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const VIDEO = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/;

async function youtube(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return null;
  const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  let video = null;
  try {
    const res = await fetch(search, {
      // the consent cookie skips Europe's cookie page, which would hide the results
      headers: { 'user-agent': UA, 'accept-language': 'en', cookie: 'CONSENT=YES+1; SOCS=CAI' },
      signal: AbortSignal.timeout(8000),
    });
    const m = VIDEO.exec(await res.text());
    if (m) video = { id: m[1], title: JSON.parse(`"${m[2]}"`) };
  } catch {
    // offline or YouTube changed its page: the search still opens
  }
  await shell.openExternal(video ? `https://www.youtube.com/watch?v=${video.id}` : search);
  return { title: video?.title || null };
}

// A Roblox game by its name ("steal a brain rot"): the first one Roblox's own search gives, started
// straight in the Roblox app through its roblox:// link, or its page in the browser without the app.
// { name, app } of what it started, { name: null } if Roblox found nothing.
async function roblox(query) {
  const q = String(query || '').trim().slice(0, 100);
  if (!q) return null;
  let game = null;
  try {
    const url = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(q)}&pageType=all&sessionId=${randomUUID()}`;
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    game = (body.searchResults || []).filter((r) => r.contentGroupType === 'Game').flatMap((r) => r.contents || [])[0] || null;
  } catch {
    return null;
  }
  if (!game?.rootPlaceId) return { name: null };
  const installed = Boolean(app.getApplicationNameForProtocol('roblox://'));
  await shell.openExternal(installed ? `roblox://experiences/start?placeId=${game.rootPlaceId}` : `https://www.roblox.com/games/${game.rootPlaceId}`);
  // "[💀] Steal a Brainrot" is "Steal a Brainrot"
  const name = String(game.name).replace(/\[[^\]]*\]\s*/g, '').replace(/[\p{Extended_Pictographic}️]/gu, '').trim();
  return { name: name || game.name, app: installed };
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

module.exports = { launchables, match, find, launch, media, music, youtube, roblox, site, siteUrl, risky };
