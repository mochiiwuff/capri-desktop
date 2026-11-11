'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8');
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

test('memory panel formats facts, app use, and routines without mutating state', async () => {
  const { memoryView } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/memory-view.js')));
  const state = {
    facts: [{ category: 'preference', text: 'Prefers concise replies' }],
    activity: {
      enabled: true,
      apps: {
        browser: { label: 'browser', totalMs: 120000 },
        code: { label: 'code', totalMs: 300000 },
      },
      routines: [
        { routine: 'communication', count: 2 },
        { routine: 'coding', count: 5 },
      ],
    },
  };
  const before = JSON.stringify(state);
  const labels = {
    title: 'Learned memory', facts: 'Conversation memories', activity: 'App usage',
    activityOn: 'on', activityOff: 'paused', patterns: 'Routines',
    noFacts: 'No memories', noApps: 'No app usage', more: (count) => `and ${count} more`,
    categories: { preference: 'preference', general: 'note' },
    routines: { coding: 'coding', communication: 'communication', general: 'general' },
    duration: (minutes) => `${minutes} min`,
  };

  const view = memoryView(state, labels);

  assert.equal(view.line, 'Learned memory');
  assert.match(view.reply, /preference: Prefers concise replies/);
  assert.ok(view.reply.indexOf('• code — 5 min') < view.reply.indexOf('• browser — 2 min'));
  assert.ok(view.reply.indexOf('• coding: 5') < view.reply.indexOf('• communication: 2'));
  assert.equal(JSON.stringify(state), before);
});

test('memory panel handles an empty, paused state and localizes all supported languages', async () => {
  const { memoryView } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/memory-view.js')));
  const { LINES } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/lines.js')));
  const state = { facts: [], activity: { enabled: false, apps: {}, routines: [] } };

  for (const lines of Object.values(LINES)) {
    assert.ok(lines.memory.title);
    assert.ok(lines.memory.clear);
    assert.ok(lines.memory.confirmQuote);
    const view = memoryView(state, lines.memory);
    assert.match(view.reply, new RegExp(lines.memory.noFacts));
    assert.match(view.reply, new RegExp(lines.memory.noApps));
    assert.ok(view.reply.includes(lines.memory.activityOff));
  }
});
