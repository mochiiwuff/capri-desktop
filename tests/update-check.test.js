'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkForUpdate, compareVersions, RELEASES_API, RELEASES_PAGE } = require('../src/main/update-check');
const { TRAY } = require('../src/main/labels');

test('update checker compares stable semantic versions correctly', () => {
  assert.equal(compareVersions('0.5.2', '0.5.2'), 0);
  assert.equal(compareVersions('v0.6.0', '0.5.99'), 1);
  assert.equal(compareVersions('0.5.1', '0.5.2'), -1);
  assert.equal(compareVersions('nightly', '0.5.2'), null);
});

test('update-check action is localized in every tray language', () => {
  for (const labels of Object.values(TRAY)) {
    for (const key of ['updateCheck', 'updateCurrentTitle', 'updateAvailableTitle', 'updateCheckFailed', 'openReleaseFailed',
      'updateCurrent', 'updateAvailable', 'openRelease', 'later']) {
      assert.ok(labels[key], `missing update label: ${key}`);
    }
  }
});

test('update check only reads public release metadata and never downloads an installer', async () => {
  let request;
  const result = await checkForUpdate({
    currentVersion: '0.5.2',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ tag_name: 'v0.6.0', assets: [{ browser_download_url: 'https://example.invalid/setup.exe' }] }) };
    },
  });
  assert.equal(request.url, RELEASES_API);
  assert.equal(request.options.method, undefined);
  assert.deepEqual(result, {
    currentVersion: '0.5.2',
    latestVersion: '0.6.0',
    updateAvailable: true,
    releaseUrl: RELEASES_PAGE,
  });
});

test('update check reports current version and validates external responses', async () => {
  const result = await checkForUpdate({
    currentVersion: '0.5.2',
    fetchImpl: async () => ({ ok: true, json: async () => ({ tag_name: '0.5.2' }) }),
  });
  assert.equal(result.updateAvailable, false);

  await assert.rejects(() => checkForUpdate({
    currentVersion: '0.5.2',
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }), /503/);
  await assert.rejects(() => checkForUpdate({
    currentVersion: '0.5.2',
    fetchImpl: async () => ({ ok: true, json: async () => ({ tag_name: 'latest' }) }),
  }), /invalid Capri release version/);
  await assert.rejects(() => checkForUpdate({ currentVersion: 'development' }), /stable semantic version/);
});
