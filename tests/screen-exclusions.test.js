'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeRules, isExcluded, isAppAllowed } = require('../src/main/screen-exclusions');
const { DEFAULTS } = require('../src/main/config');

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8');
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

test('screen exclusion rules normalize safely and deduplicate', () => {
  assert.deepEqual(normalizeRules(['  KeePass.exe ', 'keepass.exe', '', 3]), ['keepass.exe']);
  assert.equal(normalizeRules('banking').length, 0);
  assert.equal(normalizeRules(Array.from({ length: 60 }, (_, i) => `app${i}`)).length, 40);
});

test('screen exclusion matching blocks an app name or a local window-title term', () => {
  const apps = ['KeePass', 'banking-app.exe'];
  const terms = ['private', 'incognito'];

  assert.equal(isExcluded({ app: 'KeePass.exe', title: 'Vault' }, apps, terms), true);
  assert.equal(isExcluded({ app: 'banking-app', title: 'Account overview' }, apps, terms), true);
  assert.equal(isExcluded({ app: 'chrome', title: 'Private browsing' }, apps, terms), true);
  assert.equal(isExcluded({ app: 'chrome', title: 'New tab' }, apps, terms), false);
});

test('shared privacy app exclusions block screen analysis without storing titles', () => {
  const sharedPrivacyApps = ['privateapp.exe'];
  assert.equal(isExcluded({ app: 'PrivateApp', title: 'Personal conversation' }, sharedPrivacyApps), true);
  assert.equal(isExcluded({ app: 'Browser', title: 'Personal conversation' }, sharedPrivacyApps), false);
});

test('per-modality app permissions are exact, normalized, and unrestricted only when empty', () => {
  assert.equal(isAppAllowed('chrome.exe', []), true);
  assert.equal(isAppAllowed('Chrome.EXE', [' chrome ']), true);
  assert.equal(isAppAllowed('chromium', ['chrome']), false);
  assert.equal(isAppAllowed(null, ['chrome']), false);
  assert.equal(isAppAllowed('chrome', ['  ']), false);
  assert.equal(isAppAllowed('chrome', 'chrome'), false);
});

test('destructive page closing is disabled unless explicitly authorized', () => {
  assert.equal(DEFAULTS.closePages, false);
  assert.equal(DEFAULTS.closePagesAuthorized, false);
});

test('screen consent, activity indicator, and exclusion controls have localized copy', async () => {
  const { LINES } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/lines.js')));
  const { TRAY } = require('../src/main/labels');
  for (const [lang, lines] of Object.entries(LINES)) {
    assert.ok(lines.look.active);
    assert.ok(lines.look.cancel);
    assert.ok(lines.look.exclusionApps);
    assert.ok(lines.look.exclusionTerms);
    assert.ok(lines.look.privacyExclusionLine);
    assert.ok(lines.look.privacyExclusionHint);
    assert.ok(lines.look.activityExclusionLine);
    assert.ok(lines.look.activityExclusionSaved);
    assert.ok(lines.look.activityAllowedAppsLine);
    assert.ok(lines.look.activityAllowedAppsHint);
    assert.ok(lines.look.lookAllowedAppsLine);
    assert.ok(lines.look.lookAllowedAppsHint);
    assert.ok(TRAY[lang].lookExclusions);
    assert.ok(TRAY[lang].lookAllowedApps);
    assert.ok(TRAY[lang].activityAllowedApps);
    assert.ok(TRAY[lang].privacyExclusions);
    assert.ok(TRAY[lang].privacyPause);
    assert.match(TRAY[lang].privacyState(true, true, true, true), /pause|paused|pausad|suspend|приостанов/i);
    assert.ok(TRAY[lang].lookRevoke);
  }
});
