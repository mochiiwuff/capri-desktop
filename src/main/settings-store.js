'use strict';

const DEFAULTS = require('./config-defaults');
const { createJsonStore } = require('./json-store');

const record = (v) => v && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v))
  && Object.keys(v).every((k) => !['__proto__', 'constructor', 'prototype'].includes(k));
const strings = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
const choices = {
  lang: ['auto', 'fr', 'en', 'es', 'pt', 'ru'], assistant: ['auto', 'claude', 'codex', 'agy'],
  provider: ['ollama', 'lmstudio', 'llamacpp', 'pollinations', 'openrouter', 'openai', 'groq', 'gemini', 'deepseek', 'mistral', 'custom', 'claude'],
  claudeMode: ['default', 'acceptEdits'], rest: ['corner', 'taskbar'], motion: ['auto', 'full', 'reduced'], render: ['auto', 'gl', 'software'],
};

function normalizeSettings(value) {
  const invalid = () => { throw Object.assign(new Error('Invalid settings'), { code: 'EINVALIDJSON' }); };
  if (!record(value)) invalid();
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) {
    throw Object.assign(new Error('Unsupported settings version'), { code: 'ECONFIGVERSION' });
  }
  for (const [name, entry] of Object.entries(value)) {
    if (!Object.hasOwn(DEFAULTS, name)) continue; // preserve other fields, but never expose them to the renderer
    if (name in choices) { if (!choices[name].includes(entry)) invalid(); }
    else if (typeof DEFAULTS[name] === 'boolean') { if (typeof entry !== 'boolean') invalid(); }
    else if (name === 'scale') { if (!Number.isFinite(entry) || entry <= 0 || entry > 4) invalid(); }
    else if (name === 'volume') { if (!Number.isFinite(entry) || entry < 0 || entry > 1) invalid(); }
    else if (name === 'displayId') { if (entry !== null && !Number.isInteger(entry)) invalid(); }
    else if (['chatModel', 'claudeCwd'].includes(name)) { if (entry !== null && typeof entry !== 'string') invalid(); }
    else if (['myLines', 'memories'].includes(name)) { if (!strings(entry)) invalid(); }
    else if (name === 'apiKeys') {
      if (!record(entry) || Object.entries(entry).some(([id, key]) => !/^[a-z][a-z0-9_-]*$/.test(id) || typeof key !== 'string' || key.length > 16384)) invalid();
    } else if (name === 'reminders') {
      if (!Array.isArray(entry) || entry.some((r) => !record(r) || typeof r.id !== 'string'
        || !Number.isFinite(r.at) || typeof r.text !== 'string' || !Number.isFinite(r.made))) invalid();
    } else if (name === 'bond') {
      if (entry !== null && (!record(entry) || !Number.isFinite(entry.xp) || entry.xp < 0 || entry.xp > 1000
        || !record(entry.caps))) invalid();
    } else if (typeof DEFAULTS[name] === 'string' && typeof entry !== 'string') invalid();
  }
  return { ...structuredClone(DEFAULTS), ...value, schemaVersion: 1 };
}

function createSettingsStore({ file, keys, io }) {
  let initialized = false;
  let migrationError = null;
  const store = createJsonStore({ file, defaults: normalizeSettings({}), normalize: normalizeSettings,
    // Recovery deliberately restores preferences without reintroducing old keys.
    backupValue: (value) => ({ ...value, apiKeys: {} }), io });
  function save(patch) {
    if (!initialized) throw Object.assign(new Error('Key storage is not initialized'), { code: 'EKEYSNOTREADY' });
    if (!record(patch)) throw new Error('Invalid settings patch');
    const next = normalizeSettings({ ...store.load(), ...patch });
    if (initialized) next.apiKeys = keys.migrate(next.apiKeys);
    const result = store.write(next);
    migrationError = null;
    return result;
  }
  function migrateStored(cfg) {
    const migrated = keys.migrate(cfg.apiKeys);
    if (JSON.stringify(migrated) !== JSON.stringify(cfg.apiKeys)) {
      try { save({ apiKeys: migrated }); }
      catch (err) { migrationError = err.code || 'EWRITE'; }
    }
    return status();
  }
  function initializeKeys() {
    initialized = true;
    return migrateStored(store.load());
  }
  function load(fresh = false) {
    const cfg = store.load(fresh);
    if (fresh && initialized) {
      migrateStored(cfg);
      return store.load();
    }
    return cfg;
  }
  function rendererPatch(patch) {
    if (!record(patch) || Object.keys(patch).some((name) => !Object.hasOwn(DEFAULTS, name) || name === 'apiKeys')) {
      throw new Error('Setting cannot be changed through this interface');
    }
    return save(patch);
  }
  function publicValues() {
    const cfg = store.load();
    return Object.fromEntries(Object.keys(DEFAULTS).filter((name) => name !== 'apiKeys').map((name) => [name, cfg[name]]));
  }
  function status() { return { ...store.status(), migrationError }; }
  return { load, save, rendererPatch, publicValues, initializeKeys, status, DEFAULTS };
}

module.exports = { createSettingsStore, normalizeSettings };
