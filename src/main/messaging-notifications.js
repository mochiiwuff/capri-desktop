'use strict';

const { createHash } = require('node:crypto');
const { notificationDecision } = require('./messaging');

const EVENTS = new Set(['UserPromptSubmit', 'Stop', 'StopFailure', 'PostToolUseFailure', 'Notification']);

function createMessagingNotifications({ getConfig, updateConfig, sendDiscord, sendWhatsApp, getMessage, now = Date.now } = {}) {
  if ([getConfig, updateConfig, sendDiscord, sendWhatsApp, getMessage].some((callback) => typeof callback !== 'function')) {
    throw new TypeError('Messaging notification callbacks are required');
  }

  let queue = Promise.resolve();

  function notify(event, sessionId) {
    const pending = queue.then(() => sendNotification(event, sessionId));
    queue = pending.catch(() => {});
    return pending;
  }

  async function sendNotification(event, sessionId) {
    if (!EVENTS.has(event)) return { sent: false, reason: 'unsupported-event' };
    const config = getConfig();
    const messaging = config.messaging || {};
    const timestamp = now();
    const history = (messaging.notificationHistory || [])
      .filter((entry) => Number(entry.at) > timestamp - 60 * 60 * 1000)
      .slice(-100);
    const key = createHash('sha256').update(`${event}\0${String(sessionId || '')}`).digest('hex').slice(0, 24);
    const preferences = {
      ...messaging,
      enabled: config.messagingEnabled === true || messaging.whatsapp?.enabled === true,
    };
    const decision = notificationDecision({ preferences, history, key, now: timestamp });
    if (decision !== 'allowed') return { sent: false, reason: decision };

    const text = getMessage(event);
    const results = await Promise.allSettled([
      sendDiscord(text),
      sendWhatsApp(text),
    ]);
    let sent = false;
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.sent === true) sent = true;
      if (result.status === 'rejected') console.error('[capri] development notification failed:', result.reason?.message || 'unknown error');
    }
    if (!sent) return { sent: false, reason: 'no-authorized-recipient' };

    const current = getConfig().messaging || {};
    updateConfig({
      messaging: {
        ...current,
        notificationHistory: [...(current.notificationHistory || [])
          .filter((entry) => Number(entry.at) > timestamp - 60 * 60 * 1000), { at: timestamp, key }]
          .slice(-100),
      },
    });
    return { sent: true };
  }

  return { notify };
}

module.exports = { createMessagingNotifications, EVENTS };
