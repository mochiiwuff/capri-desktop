'use strict';

// Linux's installed apps, from their .desktop files (the freedesktop menu): yours first, then the
// system's and Flatpak's. What she can open from a chat (launch.js), and the names of the apps
// whose windows she can close (apps.js).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function dirs(env = process.env) {
  const home = env.HOME || os.homedir();
  const data = [env.XDG_DATA_HOME || path.join(home, '.local', 'share'),
    ...(env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean),
    path.join(home, '.local', 'share', 'flatpak', 'exports', 'share'), '/var/lib/flatpak/exports/share'];
  return [...new Set(data.map((d) => path.join(d, 'applications')))];
}

// The [Desktop Entry] group's keys (localized ones left out: Name is enough to be asked for)
function parse(text) {
  const out = {};
  let inEntry = false;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]';
      continue;
    }
    const eq = line.indexOf('=');
    if (!inEntry || eq < 1 || line.startsWith('#')) continue;
    const key = line.slice(0, eq).trim();
    if (!key.includes('[') && !(key in out)) out[key] = line.slice(eq + 1).trim();
  }
  return out;
}

// [{ name, id (the file's path), wmClass, file (its name without .desktop) }], one per desktop id:
// the first directory that has it wins, as in the menus
function entries({ env = process.env, read = (p) => fs.readFileSync(p, 'utf8'), list = (d) => fs.readdirSync(d) } = {}) {
  const seen = new Set();
  const out = [];
  for (const dir of dirs(env)) {
    let files = [];
    try { files = list(dir).filter((f) => f.endsWith('.desktop')); } catch { continue; }
    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);
      let e;
      try { e = parse(read(path.join(dir, file))); } catch { continue; }
      if (e.Type !== 'Application' || !e.Name || e.NoDisplay === 'true' || e.Hidden === 'true') continue;
      out.push({ name: e.Name, id: path.join(dir, file), wmClass: e.StartupWMClass || '', file: file.replace(/\.desktop$/, '') });
    }
  }
  return out;
}

module.exports = { dirs, parse, entries };
