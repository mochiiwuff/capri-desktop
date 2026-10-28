'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWrite, createJsonStore } = require('../src/main/json-store');
const { createKeyStore } = require('../src/main/keys');
const { createSettingsStore } = require('../src/main/settings-store');

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-storage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, file: path.join(dir, 'config.json') };
}

// Opaque fake ciphertext lets tests verify storage policy, not reimplement OS crypto.
function keyring(backend = 'gnome_libsecret') {
  const contents = new Map();
  return {
    backend, available: true, encryptions: 0,
    isEncryptionAvailable() { return this.available; },
    getSelectedStorageBackend() { return this.backend; },
    encryptString(value) {
      if (!this.available) throw new Error('keyring locked');
      this.encryptions++;
      const id = randomUUID();
      contents.set(id, value);
      return Buffer.from(id);
    },
    decryptString(value) {
      if (!this.available || !contents.has(value.toString())) throw new Error('key unavailable');
      return contents.get(value.toString());
    },
  };
}

function settings(file, safeStorage = keyring(), io) {
  const keys = createKeyStore({ safeStorage, platform: 'linux' });
  return { keys, store: createSettingsStore({ file, keys, io }) };
}

test('interrupted write, fsync and rename leave the original JSON intact and remove temporary files', (t) => {
  const { dir, file } = temporary(t);
  atomicWrite(file, { volume: 0.2 });
  const original = fs.readFileSync(file, 'utf8');
  for (const method of ['writeFileSync', 'fsyncSync', 'renameSync']) {
    const io = { ...fs, [method](...args) {
      if (method === 'writeFileSync') fs.writeFileSync(args[0], '{partial');
      throw Object.assign(new Error('simulated disk failure'), { code: 'ENOSPC' });
    } };
    assert.throws(() => atomicWrite(file, { volume: 0.8 }, io), { code: 'ENOSPC' });
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.deepEqual(fs.readdirSync(dir), ['config.json']);
  }
});

test('failed persistence does not replace cached settings or report a successful save', (t) => {
  const { file } = temporary(t);
  let fail = false;
  const io = { ...fs, renameSync(from, to) {
    if (fail && to === file) throw Object.assign(new Error('read-only filesystem'), { code: 'EROFS' });
    fs.renameSync(from, to);
  } };
  const { store } = settings(file, keyring(), io);
  store.initializeKeys();
  store.save({ volume: 0.2 });
  fail = true;
  assert.throws(() => store.save({ volume: 0.9 }), { code: 'EROFS' });
  assert.equal(store.load().volume, 0.2);
  assert.equal(JSON.parse(fs.readFileSync(file)).volume, 0.2);
  assert.equal(store.status().error, 'EROFS');
  fail = false;
  store.save({ volume: 0.5 });
  assert.equal(store.status().error, null);
});

test('corrupt settings recover the last good preferences and preserve the original bytes', (t) => {
  const { dir, file } = temporary(t);
  const { store } = settings(file);
  store.initializeKeys();
  store.save({ lang: 'fr', volume: 0.2 });
  store.save({ volume: 0.8 });
  fs.writeFileSync(file, '{interrupted');
  const recovered = settings(file).store;
  assert.equal(recovered.load().volume, 0.2);
  assert.equal(recovered.load().lang, 'fr');
  assert.equal(recovered.status().recovery, 'backup');
  assert.equal(JSON.parse(fs.readFileSync(file)).volume, 0.2);
  const preserved = fs.readdirSync(dir).filter((name) => name.includes('.corrupt-'));
  assert.equal(preserved.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, preserved[0]), 'utf8'), '{interrupted');
});

test('corruption and future formats introduced while running are not silently overwritten', (t) => {
  const { dir, file } = temporary(t);
  const { store } = settings(file);
  store.initializeKeys();
  store.save({ volume: 0.2 });
  fs.writeFileSync(file, '{external damage');
  store.save({ volume: 0.4 });
  const preserved = fs.readdirSync(dir).find((name) => name.includes('.corrupt-'));
  assert.equal(fs.readFileSync(path.join(dir, preserved), 'utf8'), '{external damage');
  const future = '{"schemaVersion":99}';
  fs.writeFileSync(file, future);
  assert.throws(() => store.save({ volume: 0.8 }), { code: 'ECONFIGVERSION' });
  assert.equal(fs.readFileSync(file, 'utf8'), future);
  assert.equal(store.status().blocked, true);
});

test('unrecoverable files are preserved before defaults are used', (t) => {
  const { dir, file } = temporary(t);
  fs.writeFileSync(file, 'null');
  fs.writeFileSync(`${file}.bak`, 'invalid JSON');
  const { store } = settings(file);
  assert.equal(store.load().volume, 0.7);
  assert.equal(store.status().recovery, 'defaults');
  assert.equal(fs.readdirSync(dir).filter((name) => name.includes('.corrupt-')).length, 2);
  store.initializeKeys();
  store.save({ lang: 'en' });
  assert.equal(JSON.parse(fs.readFileSync(file)).lang, 'en');
});

test('unreadable files and unsupported future versions are not overwritten', (t) => {
  const { file } = temporary(t);
  const original = '{"schemaVersion":99,"customFutureSetting":true}';
  fs.writeFileSync(file, original);
  const { store } = settings(file);
  store.initializeKeys();
  assert.equal(store.status().blocked, true);
  assert.throws(() => store.save({ lang: 'fr' }), { code: 'ECONFIGVERSION' });
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  const io = { ...fs, readFileSync() { throw Object.assign(new Error('access denied'), { code: 'EACCES' }); } };
  const unreadable = settings(file, keyring(), io).store;
  unreadable.initializeKeys();
  assert.throws(() => unreadable.save({ muted: true }), { code: 'EACCES' });
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('settings validate known values and block API key injection through ordinary configuration IPC', (t) => {
  const { file } = temporary(t);
  const { store } = settings(file);
  store.initializeKeys();
  store.save({ lang: 'fr' });
  for (const patch of [{ volume: 2 }, { scale: -1 }, { reminders: [{}] }, { bond: { xp: -1, caps: {} } },
    { muted: 'yes' }, { provider: 'constructor' }, { myLines: [12] }, { bond: { xp: 1, caps: new Date() } }]) {
    assert.throws(() => store.rendererPatch(patch));
  }
  for (const patch of [{ apiKeys: { custom: 'fake-key' } }, { schemaVersion: 9 }, { customUnknown: true }]) {
    assert.throws(() => store.rendererPatch(patch));
  }
  assert.equal(store.load().lang, 'fr');
  assert.deepEqual(store.load().apiKeys, {});
});

test('Linux basic_text and unknown backends never encrypt new keys', () => {
  for (const backend of ['basic_text', 'unknown', 'other']) {
    const safeStorage = keyring(backend);
    const keys = createKeyStore({ safeStorage, platform: 'linux' });
    assert.equal(keys.status().persistent, false);
    assert.deepEqual(keys.prepare('synthetic-key'), { storage: 'session', value: null });
    assert.equal(safeStorage.encryptions, 0);
  }
});

test('encryption failure or a backend change during encryption never enables persistence', () => {
  const locked = keyring();
  locked.encryptString = () => { throw new Error('keyring locked during encryption'); };
  assert.deepEqual(createKeyStore({ safeStorage: locked, platform: 'linux' }).prepare('synthetic-key'),
    { storage: 'session', value: null });
  const changed = keyring();
  const encrypt = changed.encryptString.bind(changed);
  changed.encryptString = (value) => { const result = encrypt(value); changed.backend = 'basic_text'; return result; };
  assert.deepEqual(createKeyStore({ safeStorage: changed, platform: 'linux' }).prepare('synthetic-key'),
    { storage: 'session', value: null });
});

test('Windows DPAPI and macOS keychain do not depend on a Linux backend selector', () => {
  for (const platform of ['win32', 'darwin']) {
    const safeStorage = keyring();
    safeStorage.getSelectedStorageBackend = () => { throw new Error('Linux only'); };
    const keys = createKeyStore({ safeStorage, platform });
    const prepared = keys.prepare('synthetic-key');
    assert.equal(prepared.storage, 'encrypted');
    assert.equal(keys.openKeys({ custom: prepared.value }).custom, 'synthetic-key');
  }
});

test('writes are blocked before the key store is initialized', (t) => {
  const { dir, file } = temporary(t);
  const { store } = settings(file);
  assert.throws(() => store.save({ apiKeys: { custom: 'synthetic-key' } }), { code: 'EKEYSNOTREADY' });
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('legacy ciphertext is rewrapped once with a trusted backend', (t) => {
  const { file } = temporary(t);
  const safeStorage = keyring();
  const legacy = `enc:${safeStorage.encryptString('old-encrypted-key').toString('base64')}`;
  fs.writeFileSync(file, JSON.stringify({ apiKeys: { custom: legacy } }));
  const { keys, store } = settings(file, safeStorage);
  store.initializeKeys();
  assert.match(store.load().apiKeys.custom, /^enc:v1:gnome_libsecret:/);
  assert.equal(keys.openKeys(store.load().apiKeys).custom, 'old-encrypted-key');
  store.save({ lang: 'fr' });
  assert.equal(safeStorage.encryptions, 2, 'ordinary preference changes do not encrypt the key again');
});

test('trusted keyrings encrypt keys and locked keyrings fall back to memory only', () => {
  const safeStorage = keyring();
  const keys = createKeyStore({ safeStorage, platform: 'linux' });
  const prepared = keys.prepare('synthetic-key');
  assert.equal(prepared.storage, 'encrypted');
  assert.ok(!prepared.value.includes('synthetic-key'));
  assert.equal(keys.openKeys({ custom: prepared.value }).custom, 'synthetic-key');
  safeStorage.available = false;
  assert.deepEqual(keys.prepare('new-key'), { storage: 'session', value: null });
  assert.equal(keys.openKeys({ custom: prepared.value }).custom, undefined);
  assert.equal(keys.status().lockedKeys, 1);
  safeStorage.available = true;
  assert.equal(keys.openKeys({ custom: prepared.value }).custom, 'synthetic-key');
  assert.equal(keys.status().lockedKeys, 0);
});

test('plaintext legacy keys are migrated without copying them into a backup', (t) => {
  const { dir, file } = temporary(t);
  fs.writeFileSync(file, JSON.stringify({ lang: 'fr', apiKeys: { openai: 'legacy-synthetic-key' } }));
  const { keys, store } = settings(file);
  store.initializeKeys();
  const saved = JSON.parse(fs.readFileSync(file));
  assert.match(saved.apiKeys.openai, /^enc:/);
  assert.equal(keys.openKeys(saved.apiKeys).openai, 'legacy-synthetic-key');
  assert.equal(saved.lang, 'fr');
  for (const name of fs.readdirSync(dir)) assert.ok(!fs.readFileSync(path.join(dir, name), 'utf8').includes('legacy-synthetic-key'));
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`)).apiKeys, {});
});

test('without a keyring legacy keys move to the session and disappear from saved files', (t) => {
  const { dir, file } = temporary(t);
  fs.writeFileSync(file, JSON.stringify({ apiKeys: { custom: 'legacy-session-key' } }));
  const safeStorage = keyring('basic_text');
  const { keys, store } = settings(file, safeStorage);
  store.initializeKeys();
  assert.deepEqual(store.load().apiKeys, {});
  assert.equal(keys.openKeys({}).custom, 'legacy-session-key');
  assert.equal(keys.status().sessionKeys, 1);
  for (const name of fs.readdirSync(dir)) assert.ok(!fs.readFileSync(path.join(dir, name), 'utf8').includes('legacy-session-key'));
  const restarted = settings(file, safeStorage);
  restarted.store.initializeKeys();
  assert.deepEqual(restarted.keys.openKeys(restarted.store.load().apiKeys), {});
});

test('old basic_text ciphertext is recovered into memory, not re-saved with weak encryption', (t) => {
  const { file } = temporary(t);
  const safeStorage = keyring('basic_text');
  const old = `enc:${safeStorage.encryptString('old-weak-key').toString('base64')}`;
  fs.writeFileSync(file, JSON.stringify({ apiKeys: { custom: old } }));
  const { keys, store } = settings(file, safeStorage);
  store.initializeKeys();
  assert.equal(keys.openKeys({}).custom, 'old-weak-key');
  assert.deepEqual(store.load().apiKeys, {});
  assert.equal(safeStorage.encryptions, 1, 'only the legacy fixture used weak encryption');
});

test('unreadable ciphertext is preserved and never treated as a usable API key', (t) => {
  const { file } = temporary(t);
  const old = 'enc:bm90LWRlY3J5cHRhYmxl';
  fs.writeFileSync(file, JSON.stringify({ apiKeys: { custom: old } }));
  const { keys, store } = settings(file);
  store.initializeKeys();
  assert.equal(keys.openKeys(store.load().apiKeys).custom, '');
  assert.equal(keys.status().lockedKeys, 1);
  assert.equal(JSON.parse(fs.readFileSync(file)).apiKeys.custom, old);
});

test('a failed key migration is reported and preserves the original file', (t) => {
  const { file } = temporary(t);
  const before = JSON.stringify({ apiKeys: { custom: 'legacy-migration-key' } });
  fs.writeFileSync(file, before);
  const io = { ...fs, renameSync(from, to) {
    if (to === file) throw Object.assign(new Error('disk failure'), { code: 'ENOSPC' });
    fs.renameSync(from, to);
  } };
  const { store } = settings(file, keyring(), io);
  store.initializeKeys();
  assert.equal(store.status().migrationError, 'ENOSPC');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('backup recovery never restores obsolete API keys and public configuration contains no keys', (t) => {
  const { file } = temporary(t);
  fs.writeFileSync(file, JSON.stringify({ volume: 0.2, apiKeys: { custom: 'synthetic-key' }, unknownSecret: 'private' }));
  const { store } = settings(file);
  store.initializeKeys();
  assert.equal(store.publicValues().apiKeys, undefined);
  assert.equal(store.publicValues().unknownSecret, undefined);
  store.save({ volume: 0.4 });
  fs.writeFileSync(file, 'broken');
  const recovered = settings(file).store;
  recovered.initializeKeys();
  assert.deepEqual(recovered.load().apiKeys, {});
  assert.equal(recovered.load().volume, 0.2);
});

test('saved files and backups are private on POSIX systems', { skip: process.platform === 'win32' }, (t) => {
  const { dir, file } = temporary(t);
  const { store } = settings(file);
  store.initializeKeys();
  store.save({ volume: 0.2 });
  store.save({ volume: 0.4 });
  fs.writeFileSync(file, 'broken');
  settings(file).store.load();
  for (const name of fs.readdirSync(dir)) assert.equal(fs.statSync(path.join(dir, name)).mode & 0o777, 0o600);
});

test('chat memory uses the same recoverable atomic store', (t) => {
  const { file } = temporary(t);
  const store = createJsonStore({ file, defaults: { history: [] } });
  store.write({ history: [{ role: 'user', content: 'hello' }] });
  store.write({ history: [{ role: 'assistant', content: 'hi' }] });
  fs.writeFileSync(file, '{partial');
  assert.deepEqual(createJsonStore({ file, defaults: { history: [] } }).load().history, [{ role: 'user', content: 'hello' }]);
});

test('forgetting conversations clears both the current file and its recovery backup', (t) => {
  const { file } = temporary(t);
  const store = createJsonStore({ file, defaults: { history: [] } });
  store.write({ history: [{ role: 'user', content: 'old private conversation' }] });
  store.write({ history: [], claude: null }, { discardBackupHistory: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).history, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`)).history, []);
});
