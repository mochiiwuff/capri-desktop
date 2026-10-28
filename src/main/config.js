'use strict';

const path = require('node:path');
const { app, safeStorage } = require('electron');
const { createSettingsStore } = require('./settings-store');
const { createKeyStore } = require('./keys');

const keys = createKeyStore({ safeStorage });
const file = () => path.join(app.getPath('userData'), 'config.json');
const store = createSettingsStore({ file, keys });

module.exports = { ...store, keys, file };
