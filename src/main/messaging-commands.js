'use strict';

const { COMMANDS, rateLimitDecision } = require('./messaging');

function createMessagingCommandHandler({ getConfig, updateConfig, now = Date.now } = {}) {
  if (typeof getConfig !== 'function' || typeof updateConfig !== 'function') {
    throw new TypeError('Messaging command callbacks are required');
  }

  return async ({ command }, reply) => {
    if (!COMMANDS.has(command)) return;
    const cfg = getConfig();
    const messaging = cfg.messaging || {};
    const timestamp = now();
    const history = (messaging.commandHistory || []).filter((event) => Number(event.at) > timestamp - 60 * 60 * 1000);
    if (rateLimitDecision(history, messaging.maxPerHour, timestamp, command, 15000) !== 'allowed') return;
    updateConfig({
      messaging: {
        ...messaging,
        commandHistory: [...history, { at: timestamp, key: command }].slice(-100),
      },
    });

    let response;
    switch (command) {
      case 'status':
        response = `Capri is running. Learning: ${cfg.learningEnabled === true ? 'on' : 'off'}; activity: ${cfg.activityLearning === true ? 'on' : 'off'}; screen observation: ${cfg.watchScreen === true ? 'on' : 'off'}.`;
        break;
      case 'pause':
        updateConfig({ learningEnabled: false, activityLearning: false, watchScreen: false });
        response = 'Learning and screen observation are paused. Screen permission remains saved; observation is off.';
        break;
      case 'resume':
        updateConfig({ learningEnabled: true, activityLearning: false, watchScreen: false });
        response = 'Conversation learning is on. Activity learning and screen observation remain off until enabled on the desktop.';
        break;
      case 'memory':
        response = `Local memory status: ${cfg.memories?.length || 0} manual notes and ${cfg.learningEntries?.length || 0} reviewed learning entries. No memory contents are sent here.`;
        break;
      case 'projects':
        response = 'Current project: Capri desktop. Code analysis and tests are available locally; changes still require desktop review.';
        break;
      case 'report':
        response = `Capri status: running; Discord: connected; WhatsApp: not connected; learning: ${cfg.learningEnabled === true ? 'on' : 'off'}.`;
        break;
      case 'update':
        response = 'Remote code changes are not enabled. Review and apply development changes from Capri on the desktop.';
        break;
      default:
        return;
    }
    await reply(response);
  };
}

module.exports = { createMessagingCommandHandler };
