'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { createMessagingNotifications } = require('../src/main/messaging-notifications');
const { TRAY } = require('../src/main/labels');
const linesPath = require.resolve('../src/renderer/js/lines.js');

function fixture(overrides = {}) {
  let config = {
    messagingEnabled: true,
    messaging: {
      notificationsEnabled: true,
      notificationsPaused: false,
      quietHours: { enabled: false, start: '22:00', end: '08:00' },
      maxPerHour: 10,
      duplicateWindowMs: 900000,
      notificationHistory: [],
    },
    ...overrides,
  };
  const sent = [];
  let timestamp = new Date(2026, 0, 1, 12, 0).getTime();
  const notifier = createMessagingNotifications({
    getConfig: () => config,
    updateConfig: (patch) => { config = { ...config, ...patch }; },
    sendDiscord: async (text) => { sent.push(['discord', text]); return { sent: true }; },
    sendWhatsApp: async () => ({ sent: false }),
    getMessage: (event) => ({ Stop: 'The task is complete.' })[event],
    now: () => timestamp,
  });
  return { notifier, sent, getConfig: () => config, setTime: (value) => { timestamp = value; } };
}

test('development notifications stay off until opted in and pause immediately', async () => {
  const disabled = fixture({ messaging: { notificationsEnabled: false } });
  assert.deepEqual(await disabled.notifier.notify('Stop', 'session-a'), { sent: false, reason: 'disabled' });
  assert.deepEqual(disabled.sent, []);

  const paused = fixture({ messaging: { notificationsEnabled: true, notificationsPaused: true } });
  assert.deepEqual(await paused.notifier.notify('Stop', 'session-a'), { sent: false, reason: 'disabled' });
  assert.deepEqual(paused.sent, []);
});

test('notifications use fixed event text, deduplicate, rate-limit, and persist no session content', async () => {
  const context = fixture({ messaging: { notificationsEnabled: true, maxPerHour: 1 } });
  const first = await context.notifier.notify('Stop', 'private-session-title');
  assert.deepEqual(first, { sent: true });
  assert.deepEqual(context.sent, [['discord', 'The task is complete.']]);
  const history = context.getConfig().messaging.notificationHistory;
  assert.equal(history.length, 1);
  assert.equal(JSON.stringify(history).includes('private-session-title'), false);

  assert.deepEqual(await context.notifier.notify('Stop', 'private-session-title'), { sent: false, reason: 'rate-limited' });
  assert.equal(context.sent.length, 1);
});

test('concurrent duplicate events are serialized before delivery', async () => {
  const context = fixture();
  const results = await Promise.all([
    context.notifier.notify('Stop', 'same-session'),
    context.notifier.notify('Stop', 'same-session'),
  ]);
  assert.deepEqual(results.map((result) => result.sent), [true, false]);
  assert.equal(results[1].reason, 'duplicate');
  assert.equal(context.sent.length, 1);
});

test('unsupported events and missing authorized recipients never send', async () => {
  const context = fixture();
  assert.deepEqual(await context.notifier.notify('Unknown', 'session'), { sent: false, reason: 'unsupported-event' });
  const noRecipient = createMessagingNotifications({
    getConfig: context.getConfig,
    updateConfig: () => {},
    sendDiscord: async () => ({ sent: false }),
    sendWhatsApp: async () => ({ sent: false }),
    getMessage: () => 'fixed notification',
  });
  assert.deepEqual(await noRecipient.notify('Stop', 'session'), { sent: false, reason: 'no-authorized-recipient' });
});

test('notification and preference strings are present in every language', async () => {
  for (const labels of Object.values(TRAY)) {
    for (const key of ['developmentNotifications', 'pauseNotifications', 'notificationPreferences',
      'notificationStarted', 'notificationCompleted', 'notificationFailed', 'notificationApproval']) {
      assert.equal(typeof labels[key], 'string', `missing tray label: ${key}`);
    }
  }
  const { LINES } = await import(pathToFileURL(linesPath));
  for (const localized of Object.values(LINES)) {
    const messaging = localized.setup.messaging;
    for (const key of ['notificationHoursLine', 'notificationHoursHow', 'notificationLimitLine',
      'notificationLimitHow', 'notificationPreferencesSaved', 'notificationPreferencesInvalid']) {
      assert.equal(typeof messaging[key], 'string', `missing setup text: ${key}`);
    }
  }
});
