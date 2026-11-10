'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ingestConversation, ingestWindowActivity, readState } = require('../src/main/learning');

test('learning engine extracts preferences and project context from user messages', () => {
  const state = readState({ enabled: true, facts: [], updatedAt: null });
  const next = ingestConversation('Prefiro que você me chame de Tiago e estou trabalhando no projeto Capri.', state);
  assert.equal(next.facts.length >= 2, true);
  assert.ok(next.facts.some((fact) => fact.category === 'preference' && /Tiago/i.test(fact.text)));
  assert.ok(next.facts.some((fact) => fact.category === 'project' && /Capri/i.test(fact.text)));
});

test('learning engine deduplicates repeated facts and preserves recent updates', () => {
  const first = ingestConversation('Prefiro que você me chame de Tiago.', readState({ enabled: true, facts: [], updatedAt: null }));
  const second = ingestConversation('Prefiro que você me chame de Tiago.', first);
  assert.equal(second.facts.filter((fact) => fact.category === 'preference').length, 1);
  assert.ok(second.facts.some((fact) => /Tiago/i.test(fact.text)));
});

test('conversation learning respects the global pause switch', () => {
  const state = readState({ enabled: false, facts: [], updatedAt: null });
  const next = ingestConversation('Prefiro respostas curtas.', state);
  assert.equal(next.enabled, false);
  assert.deepEqual(next.facts, []);
});

test('learning engine tracks app activity and routines without duplicating entries', () => {
  const initial = readState({ enabled: true, facts: [], activity: { enabled: true, apps: {}, routines: [], updatedAt: null }, updatedAt: null });
  const next = ingestWindowActivity({ app: 'Code.exe', title: 'private-project — secrets.txt' }, initial, 15000);
  assert.ok(next.activity.apps.code);
  assert.equal(next.activity.apps.code.totalMs, 15000);
  assert.equal(Object.hasOwn(next.activity.apps.code, 'projects'), false);
  assert.ok(next.activity.routines.some((entry) => entry.routine === 'coding'));
  const repeat = ingestWindowActivity({ app: 'Code.exe' }, next, 15000);
  assert.equal(repeat.activity.apps.code.count, 2);
  assert.equal(repeat.activity.apps.code.totalMs, 30000);
  assert.equal(repeat.activity.routines.some((entry) => entry.routine === 'coding' && entry.count >= 2), true);
});

test('activity learning stays paused until explicit consent and ignores window titles', () => {
  const initial = readState({ enabled: true, facts: [], updatedAt: null });
  const paused = ingestWindowActivity({ app: 'Code', title: 'private-project — secrets.txt' }, initial);
  assert.equal(paused.activity.enabled, false);
  assert.deepEqual(paused.activity.apps, {});

  const optedIn = { ...initial, activity: { ...initial.activity, enabled: true } };
  const next = ingestWindowActivity({ title: 'private-project — secrets.txt' }, optedIn);
  assert.deepEqual(next.activity.apps, {});
});
