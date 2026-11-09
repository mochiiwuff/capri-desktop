'use strict';

// Finding your files when you ask her ("trouve mon CV", "where's my report"). Windows' search
// index first: your whole user folder, by name and by what's in the files, in a blink. If it's off,
// a walk through your usual folders, by name. Then a screenshot when you ask for one.

const fs = require('node:fs');
const path = require('node:path');
const { app, shell, desktopCapturer, screen } = require('electron');
const { powershell } = require('./apps');

const LIMIT = 8;
const found = new Set(); // what a search showed you: the only paths she opens from here

const words = (query) => String(query || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^\p{L}\p{N}.]+/u).filter((w) => w.length >= 2).slice(0, 5);

// never in the results: code dependencies, app data, git internals
const JUNK = ['node_modules', '\\AppData\\', '\\.git\\', '\\site-packages\\', '\\$Recycle.Bin\\'];
// …and their Linux places: caches, app data, the trash, Nix's links into the store
JUNK.push('/.cache/', '/.local/share/Trash/', '/.git/', '/site-packages/', '/.npm/', '/.cargo/', '/result/');
const junk = (p) => JUNK.some((j) => p.includes(j));
// files that are code, left out of a search by what's inside (any word shows up in some library)
const CODE = ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'map', 'lock', 'yml', 'yaml', 'py', 'css', 'html', 'md', 'txt', 'xml', 'log'];

// Windows Search: names first (every word in the name, of one of `exts` if any), then what's in
// documents (not code). null if the index can't be asked.
async function indexed(terms, exts) {
  const safe = terms.map((t) => t.replace(/[^\p{L}\p{N}.]/gu, '')).filter(Boolean);
  const types = exts.map((e) => e.replace(/[^a-z0-9]/gi, '')).filter(Boolean);
  if (!safe.length && !types.length) return [];
  const scope = `file:${app.getPath('home')}`; // backslashes: with slashes the index finds nothing
  const notJunk = "NOT System.ItemUrl LIKE '%node_modules%' AND NOT System.ItemUrl LIKE '%/AppData/%' AND NOT System.ItemUrl LIKE '%/.git/%'";
  const ofType = types.length ? `(${types.map((e) => `System.FileExtension = '.${e}'`).join(' OR ')})` : '';
  const byName = [...safe.map((t) => `System.FileName LIKE '%${t}%'`), ofType].filter(Boolean).join(' AND ');
  const byText = safe.length && !types.length
    ? `CONTAINS(*, '${safe.map((t) => `"${t}"`).join(' AND ')}') AND ${CODE.map((e) => `System.FileExtension <> '.${e}'`).join(' AND ')}`
    : '';
  // ItemUrl (file:C:/Users/…): the real path. ItemPathDisplay is translated (C:\Utilisateurs\…\Bureau)
  const query = (where) => `SELECT TOP ${LIMIT} System.ItemUrl FROM SYSTEMINDEX WHERE SCOPE='${scope}' AND ${notJunk} AND ${where} ORDER BY System.DateModified DESC`;
  const script = [
    '$c = New-Object -ComObject ADODB.Connection',
    "$c.Open(\"Provider=Search.CollatorDSO;Extended Properties='Application=Windows';\")",
    // each query in a single-quoted PowerShell string (its own quotes doubled)
    ...[byName, byText].filter(Boolean).map((w) => `$r = New-Object -ComObject ADODB.Recordset; $r.Open('${query(w).replace(/'/g, "''")}', $c); while (-not $r.EOF) { $r.Fields.Item('System.ItemUrl').Value; $r.MoveNext() }; $r.Close()`),
  ].join('; ');
  if (process.platform !== 'win32') return null; // no Windows Search: the walk below
  const out = await powershell(script, 10000).catch(() => null);
  if (out == null) return null;
  const paths = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^file:/i.test(l));
  return [...new Set(paths.map((l) => decodeURIComponent(l.slice(5)).replace(/\//g, '\\')))];
}

// The walk, when the index isn't there: your usual folders, a few levels down, by name and type.
function walked(terms, exts) {
  const roots = ['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos'].map((k) => app.getPath(k));
  const onedrive = process.env.OneDrive;
  if (onedrive) roots.push(onedrive);
  const hits = [];
  const queue = roots.map((dir) => [dir, 0]);
  let seen = 0;
  while (queue.length && hits.length < LIMIT * 3 && seen < 40000) {
    const [dir, depth] = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      seen++;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      const name = words(e.name).join(' ');
      const ext = path.extname(e.name).slice(1).toLowerCase();
      if (terms.every((t) => name.includes(t)) && (!exts.length || exts.includes(ext))) hits.push(full);
      if (e.isDirectory() && depth < 5) queue.push([full, depth + 1]);
    }
  }
  return hits;
}

// [{ path, name, folder }], the newest first, at most LIMIT. `query`: words of the name; `exts`:
// the kinds of file it is (["aep"] for an After Effects project), when that's what was asked.
async function search({ query = '', exts = [] } = {}) {
  const terms = words(query);
  if (!terms.length && !exts.length) return [];
  const paths = await indexed(terms, exts);
  const results = listed(paths?.length ? paths : walked(terms, exts));
  return results.length || !paths?.length ? results : listed(walked(terms, exts));
}

function listed(paths) {
  const results = paths.filter((p) => !junk(p)).slice(0, LIMIT).map((p) => {
    let time = 0;
    try {
      time = fs.statSync(p).mtimeMs;
    } catch {
      return null; // gone since
    }
    return { path: p, name: path.basename(p), folder: path.basename(path.dirname(p)), time };
  }).filter(Boolean);
  for (const r of results) found.add(r.path);
  return results;
}

// one of the files she found: opened, or shown in its folder
async function open(file, { reveal = false } = {}) {
  if (!found.has(file)) throw new Error('not one she found');
  if (reveal) {
    shell.showItemInFolder(file);
    return;
  }
  const err = await shell.openPath(file);
  if (err) throw new Error(err);
}

// A screenshot of the screen she's on, full size, saved in Pictures › Screenshots (made if needed).
async function screenshot(display) {
  const d = display || screen.getPrimaryDisplay();
  const k = d.scaleFactor || 1;
  const size = { width: Math.round(d.bounds.width * k), height: Math.round(d.bounds.height * k) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
  if (!src || src.thumbnail.isEmpty()) throw new Error('no picture of the screen');
  const dir = path.join(app.getPath('pictures'), 'Screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const file = path.join(dir, `Capri ${stamp}.png`);
  fs.writeFileSync(file, src.thumbnail.toPNG());
  found.add(file);
  return { path: file, name: path.basename(file) };
}

module.exports = { search, open, screenshot };
