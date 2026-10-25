#!/usr/bin/env node
'use strict';

// Installs the little GNOME Shell extension that tells Capri where your windows are
// (GNOME on Wayland shows them to no app). GNOME loads it at your next login.
//
//   node scripts/gnome-extension.js              install
//   node scripts/gnome-extension.js --uninstall
//   node scripts/gnome-extension.js --status

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const UUID = 'capri@mochiiwuff.github.io';
const SOURCE = path.resolve(__dirname, '..', 'gnome', UUID);
const dataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const target = () => path.join(dataHome(), 'gnome-shell', 'extensions', UUID);

const isGnome = () => process.platform === 'linux' && /gnome/i.test(process.env.XDG_CURRENT_DESKTOP || '');

function run(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 5000 });
    return { ok: r.status === 0, out: (r.stdout || '').trim() };
  } catch {
    return { ok: false, out: '' };
  }
}

// gsettings speaks GVariant: @as [] or ['a', 'b']
function enabledList() {
  const r = run('gsettings', ['get', 'org.gnome.shell', 'enabled-extensions']);
  return r.ok ? [...r.out.matchAll(/'([^']*)'/g)].map((m) => m[1]) : null;
}

function status() {
  return { gnome: isGnome(), installed: fs.existsSync(path.join(target(), 'metadata.json')), dir: target() };
}

// fs.cpSync can't read out of the app archive (asar), file by file it can
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.writeFileSync(dst, fs.readFileSync(src));
  }
}

function install() {
  const dir = target();
  fs.rmSync(dir, { recursive: true, force: true });
  copyDir(SOURCE, dir);
  run('glib-compile-schemas', [path.join(dir, 'schemas')]);
  // a running shell only enables what it has already loaded: otherwise, straight into the setting
  if (!run('gnome-extensions', ['enable', UUID]).ok) {
    const list = enabledList();
    if (list && !list.includes(UUID)) {
      const value = `[${[...list, UUID].map((u) => `'${u}'`).join(', ')}]`;
      run('gsettings', ['set', 'org.gnome.shell', 'enabled-extensions', value]);
    }
  }
  const userOff = run('gsettings', ['get', 'org.gnome.shell', 'disable-user-extensions']).out === 'true';
  return { dir, userOff };
}

function uninstall() {
  run('gnome-extensions', ['disable', UUID]);
  fs.rmSync(target(), { recursive: true, force: true });
  return { dir: target() };
}

module.exports = { install, uninstall, status, UUID };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--status') {
    console.log(JSON.stringify(status(), null, 2));
  } else if (arg === '--uninstall') {
    console.log(`Removed ${uninstall().dir}`);
  } else {
    const { dir, userOff } = install();
    console.log(`Installed in ${dir}`);
    if (userOff) console.log('Extensions are turned off in GNOME: turn them on in the Extensions app.');
    console.log('Log out and back in: GNOME loads new extensions at login.');
  }
}
