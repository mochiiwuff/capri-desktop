#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MARK = 'CAPRI_OPENCODE_PLUGIN';
const PLUGIN = 'capri.js';

function pluginDirectory() {
  return path.join(process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), '.config', 'opencode'), 'plugins');
}

function pluginPath() {
  return path.join(pluginDirectory(), PLUGIN);
}

function status() {
  const file = pluginPath();
  try {
    return { file, installed: fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(MARK) };
  } catch (err) {
    return { file, installed: false, error: err.message };
  }
}

function install() {
  const source = path.resolve(__dirname, '..', 'hooks', 'capri-opencode-plugin.js')
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const file = pluginPath();
  const contents = fs.readFileSync(source, 'utf8');
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (before === contents) return { file, installed: true };
  if (before !== null && !before.includes(MARK)) {
    throw new Error(`Refusing to overwrite ${file}: it is not Capri's plugin.`);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (before !== null) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, `${file}.capri-backup-${stamp}`);
  }
  fs.writeFileSync(file, contents);
  return { file, installed: true };
}

function uninstall() {
  const file = pluginPath();
  if (!fs.existsSync(file)) return { file, removed: false };
  const contents = fs.readFileSync(file, 'utf8');
  if (!contents.includes(MARK)) throw new Error(`Refusing to remove ${file}: it is not Capri's plugin.`);
  fs.unlinkSync(file);
  return { file, removed: true };
}

module.exports = { install, uninstall, status, pluginPath, MARK };

if (require.main === module) {
  const arg = process.argv[2];
  try {
    if (arg === '--status') {
      const result = status();
      console.log(result.installed ? `Installed in ${result.file}` : `Not installed (${result.file})`);
    } else if (arg === '--uninstall') {
      const result = uninstall();
      console.log(result.removed ? `Capri OpenCode plugin removed from ${result.file}` : `No Capri plugin found in ${result.file}`);
    } else {
      const result = install();
      console.log(`Capri OpenCode plugin installed in ${result.file}`);
      console.log('Restart OpenCode for it to take effect.');
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
