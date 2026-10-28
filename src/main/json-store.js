'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function atomicWrite(file, value, io = fs) {
  io.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = io.openSync(temporary, 'wx', 0o600);
    io.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n', 'utf8');
    io.fsyncSync(fd);
    io.closeSync(fd);
    fd = undefined;
    io.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) io.closeSync(fd);
    try { io.unlinkSync(temporary); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
}

function createJsonStore({ file, defaults, normalize = (v) => v, backupValue = (v) => v, io = fs }) {
  const filename = () => typeof file === 'function' ? file() : file;
  let cache = null;
  let lastGood = null;
  let state = { recovery: 'none', blocked: false, error: null };
  const clone = (v) => structuredClone(v);
  function read(target) {
    const text = io.readFileSync(target, 'utf8');
    try { return normalize(JSON.parse(text)); }
    catch (err) { throw Object.assign(new Error('Invalid saved data'), { code: err.code || 'EINVALIDJSON' }); }
  }
  function quarantine(target) {
    // Preserve the original bytes for manual recovery, without exposing them in logs.
    io.chmodSync(target, 0o600);
    io.renameSync(target, `${target}.corrupt-${randomUUID()}`);
  }
  function load(fresh = false) {
    if (cache && !fresh) return clone(cache);
    state = { recovery: 'none', blocked: false, error: null };
    const target = filename();
    let primaryError;
    try {
      cache = read(target);
      lastGood = clone(cache);
      return clone(cache);
    } catch (err) { primaryError = err; }
    if (!['ENOENT', 'EINVALIDJSON'].includes(primaryError.code)) {
      state = { recovery: 'none', blocked: true, error: primaryError.code || 'EREAD' };
      cache = clone(defaults);
      lastGood = null;
      return clone(cache);
    }
    let backup = null;
    let backupError;
    try { backup = backupValue(read(`${target}.bak`)); } catch (err) { backupError = err; }
    try {
      if (backupError && !['ENOENT', 'EINVALIDJSON'].includes(backupError.code)) throw backupError;
      if (primaryError.code !== 'ENOENT') quarantine(target);
      if (backupError?.code === 'EINVALIDJSON') quarantine(`${target}.bak`);
      cache = backup || clone(defaults);
      lastGood = backup && clone(backup);
      if (backup) atomicWrite(target, backup, io);
      state.recovery = backup ? 'backup' : primaryError.code === 'EINVALIDJSON' || backupError?.code === 'EINVALIDJSON' ? 'defaults' : 'none';
    } catch (err) {
      cache = clone(defaults);
      lastGood = null;
      state = { recovery: 'none', blocked: true, error: err.code || 'ERECOVERY' };
    }
    return clone(cache);
  }
  function write(value, { discardBackupHistory = false } = {}) {
    if (!cache) load();
    if (state.blocked) throw Object.assign(new Error('Saved data is not writable'), { code: state.error });
    const next = normalize(clone(value));
    try {
      // An external edit or a newer app may have changed the file since load().
      // Preserve damage and refuse unreadable/future formats before replacing it.
      try { read(filename()); }
      catch (err) {
        if (err.code === 'EINVALIDJSON') { quarantine(filename()); state.recovery = 'backup'; }
        else if (err.code !== 'ENOENT') { state.blocked = true; throw err; }
      }
      if (lastGood || discardBackupHistory) {
        atomicWrite(`${filename()}.bak`, backupValue(clone(discardBackupHistory ? next : lastGood)), io);
      }
      atomicWrite(filename(), next, io);
      cache = next;
      lastGood = clone(next);
      state.error = null;
      return clone(cache);
    } catch (err) {
      state.error = err.code || 'EWRITE';
      throw Object.assign(new Error('Could not save data'), { code: state.error });
    }
  }
  return { load, write, status: () => ({ ...state }) };
}

module.exports = { atomicWrite, createJsonStore };
