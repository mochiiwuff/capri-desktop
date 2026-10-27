'use strict';

// Her hands on the PC, for what you ask her (powers.js, out loud or typed): the music, the volume,
// opening a web page or a search (apps and games: launch.js). The music and the volume go through a
// small PowerShell helper (system.ps1, Windows only) started on first use and kept running, so a
// "volume 30" lands at once. She never gets a free hand: only these few things.

const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

// in the installed app it sits next to the app archive (asarUnpack), where PowerShell can read it
const SCRIPT = path.join(__dirname, 'system.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const TIMEOUT_MS = 12000;

let child = null;
let seq = 0;
const pending = new Map(); // id -> { resolve, reject, timer }

function helper() {
  if (child) return child;
  child = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, String(process.pid),
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let res;
    try {
      res = JSON.parse(line);
    } catch {
      return;
    }
    const call = pending.get(res.id);
    if (!call) return;
    pending.delete(res.id);
    clearTimeout(call.timer);
    if (res.error) call.reject(new Error(res.error));
    else call.resolve(res);
  });
  child.stderr.on('data', (d) => console.error('[capri] system:', String(d).trim()));
  const gone = () => {
    child = null;
    for (const call of pending.values()) {
      clearTimeout(call.timer);
      call.reject(new Error('system helper stopped'));
    }
    pending.clear();
  };
  child.on('exit', gone);
  child.on('error', gone);
  return child;
}

function call(op, args = {}) {
  if (process.platform !== 'win32') return Promise.reject(new Error('windows only'));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('system helper timed out'));
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    helper().stdin.write(`${JSON.stringify({ id, op, ...args })}\n`);
  });
}

const simple = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

// ---------- music ----------

const MEDIA = new Set(['play', 'pause', 'toggle', 'next', 'previous', 'stop']);

// What's playing: { title, artist, album, app, status } or null.
async function playing() {
  return (await call('playing')).playing || null;
}

async function media(action) {
  if (!MEDIA.has(action)) throw new Error(`unknown media action ${action}`);
  const res = await call('media', { action });
  return { playing: res.playing || null, keys: Boolean(res.keys) };
}

// ---------- volume ----------

// The apps with a slider in Windows' volume mixer: [{ name, level, muted, active }]
async function sessions() {
  return (await call('sessions')).sessions || [];
}

// change: { set: 0-100, delta: ±n, mute: true/false }, all optional (none: just read it).
// app: one app's own slider, by its name as said ("spotify", "AM Music"); else the whole PC's.
// Resolves with { level, muted, app } ("app" empty for the PC), or { missing: true }.
async function volume({ app = '', set, delta, mute } = {}) {
  const change = {
    set: Number.isFinite(set) ? Math.round(set) : undefined,
    delta: Number.isFinite(delta) ? Math.round(delta) : undefined,
    mute: typeof mute === 'boolean' ? mute : undefined,
  };
  if (!app) return call('volume', change);
  const key = simple(app);
  const found = (await sessions()).find((s) => simple(s.name) === key)
    || (await sessions()).find((s) => key.length >= 3 && (simple(s.name).includes(key) || key.includes(simple(s.name))));
  if (!found) return { missing: true };
  return call('volume', { app: found.name, ...change });
}

// ---------- the web ----------

// A web address as said ("youtube.com", "https://x.y/z"), or null when it isn't one.
// Only http(s): never file:, javascript: or an app's own protocol.
function webAddress(text) {
  let s = String(text || '').trim().replace(/^<|>$/g, '');
  if (!s || /\s/.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^:]+:\d+/.test(s)) return null; // another scheme
    s = `https://${s}`;
  }
  try {
    const url = new URL(s);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Looking something up: on the web, or on a site she knows how to search.
const SEARCH = {
  web: 'https://www.google.com/search?q=',
  youtube: 'https://www.youtube.com/results?search_query=',
  music: 'https://music.youtube.com/search?q=',
  wikipedia: 'https://www.wikipedia.org/search-redirect.php?search=',
  maps: 'https://www.google.com/maps/search/',
  images: 'https://www.google.com/search?tbm=isch&q=',
};

function searchUrl(site, query) {
  return (SEARCH[site] || SEARCH.web) + encodeURIComponent(String(query || '').trim().slice(0, 200));
}

// Something to listen to ("daft punk"): looked up in Spotify when it's installed (its own
// search, which doesn't start playing by itself), else on YouTube Music. launch: launch.js, which
// knows what's installed.
async function musicSearch(query, launch) {
  const q = String(query || '').trim().slice(0, 200);
  const spotify = process.platform === 'win32' && (await launch.find('spotify').catch(() => null));
  if (spotify && /spotify/i.test(spotify.name)) return { url: `spotify:search:${encodeURIComponent(q)}`, where: 'Spotify' };
  return { url: searchUrl('music', q), where: 'YouTube Music' };
}

function stop() {
  child?.stdin.end();
  child?.kill();
  child = null;
}

module.exports = { playing, media, sessions, volume, webAddress, searchUrl, musicSearch, stop };
