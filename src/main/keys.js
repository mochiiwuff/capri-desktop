'use strict';

const LINUX_BACKENDS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']);

function createKeyStore({ safeStorage, platform = process.platform }) {
  const session = new Map();
  const locked = new Set();
  const failedLegacy = new Map();
  function status() {
    let backend = platform === 'linux' ? 'unknown' : platform === 'win32' ? 'dpapi' : 'keychain';
    let persistent = false;
    try {
      if (platform === 'linux') {
        const selected = safeStorage.getSelectedStorageBackend();
        backend = selected === 'basic_text' || LINUX_BACKENDS.has(selected) ? selected : 'unknown';
      }
      persistent = safeStorage.isEncryptionAvailable() && (platform !== 'linux' || LINUX_BACKENDS.has(backend));
    } catch { /* locked or absent keyring: retain keys in memory only */ }
    return { persistent, backend, sessionKeys: session.size, lockedKeys: locked.size };
  }
  function prepare(key) {
    const before = status();
    if (before.persistent) {
      try {
        const encrypted = safeStorage.encryptString(key);
        const after = status();
        if (after.persistent && after.backend === before.backend) {
          return { storage: 'encrypted', value: `enc:v1:${before.backend}:${encrypted.toString('base64')}` };
        }
      }
      catch { /* a keyring can lock between the availability check and encryption */ }
    }
    return { storage: 'session', value: null };
  }
  function activate(provider, key, storage) {
    if (storage === 'session') session.set(provider, key);
    else session.delete(provider);
    locked.delete(provider);
    failedLegacy.delete(provider);
  }
  function decrypt(provider, value) {
    try {
      const encoded = /^enc:v1:(?:gnome_libsecret|kwallet\d*|dpapi|keychain):(.+)$/.exec(value)?.[1] || value.slice(4);
      const key = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
      locked.delete(provider);
      failedLegacy.delete(provider);
      return key;
    } catch { locked.add(provider); failedLegacy.set(provider, value); return ''; }
  }
  function migrate(saved = {}) {
    const result = {};
    for (const [provider, value] of Object.entries(saved)) {
      if (!value) continue;
      if (!value.startsWith('enc:')) {
        const prepared = prepare(value);
        activate(provider, value, prepared.storage);
        if (prepared.value) result[provider] = prepared.value;
      } else if (status().backend === 'basic_text') {
        // Read an old weakly encrypted entry only to move it out of the file.
        const key = decrypt(provider, value);
        if (key) session.set(provider, key);
        else result[provider] = value; // preserve ciphertext if it cannot be recovered
      } else if (!value.startsWith('enc:v1:') && status().persistent && failedLegacy.get(provider) !== value) {
        // Legacy envelopes did not record the backend. Rewrap recovered values
        // once with the currently trusted keyring instead of assuming their origin.
        const key = decrypt(provider, value);
        const prepared = key && prepare(key);
        if (prepared && !prepared.value) session.set(provider, key);
        if (!prepared || prepared.value) result[provider] = prepared?.value || value;
      } else result[provider] = value;
    }
    return result;
  }
  function openKeys(saved = {}) {
    const result = {};
    for (const [provider, value] of Object.entries(saved)) {
      if (session.has(provider)) result[provider] = session.get(provider);
      else if (value.startsWith('enc:') && status().persistent) result[provider] = decrypt(provider, value);
      else if (value.startsWith('enc:')) locked.add(provider);
    }
    for (const [provider, key] of session) result[provider] = key;
    return result;
  }
  return { status, prepare, activate, migrate, openKeys, names: (saved) => [...new Set([...Object.keys(saved), ...session.keys()])] };
}

module.exports = { createKeyStore };
