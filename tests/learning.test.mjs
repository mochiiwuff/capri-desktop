import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// The renderer source is a browser ES module while the Electron main package is CommonJS.
// Load this import-free module as a data URL so Node tests exercise the exact browser source.
const source = await readFile(new URL('../src/renderer/js/learning.js', import.meta.url), 'utf8');
const learningModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { classifyConversation, Learning, MAX_LEARNING_ENTRIES, redactSensitiveTurn } = learningModule;

function fixture() {
  const writes = [];
  const brain = { custom: { memories: [] } };
  const learning = new Learning({
    brain,
    host: { setConfig: async (patch) => { writes.push(structuredClone(patch)); } },
  });
  return { learning, brain, writes };
}

test('learning is off by default and proposes nothing until explicitly enabled', () => {
  const { learning } = fixture();
  assert.equal(learning.propose('I prefer concise answers'), null);
  learning.configure({ learningEnabled: true });
  assert.equal(learning.propose('I prefer concise answers')?.kind, 'preference');
});

test('global privacy pause stops learning without forgetting the opt-in setting', () => {
  const { learning } = fixture();
  learning.configure({ learningEnabled: true });
  const candidate = learning.propose('I prefer concise answers');
  assert.ok(candidate);

  learning.configure({ learningEnabled: true, privacyPaused: true });
  assert.equal(learning.propose('I prefer concise answers'), null);
  assert.equal(learning.enabled, false);

  learning.configure({ learningEnabled: true, privacyPaused: false });
  assert.equal(learning.propose('I prefer concise answers')?.kind, 'preference');
});

test('recognizes explicit statements by category, without turning ordinary conversation into memory', () => {
  assert.equal(classifyConversation('I prefer concise answers')?.kind, 'preference');
  assert.equal(classifyConversation("I'm working on Capri")?.kind, 'project');
  assert.equal(classifyConversation('I enjoy animation')?.kind, 'interest');
  assert.equal(classifyConversation('Please answer in bullets')?.kind, 'communication-style');
  assert.equal(classifyConversation('No, I meant the second option')?.kind, 'correction');
  assert.equal(classifyConversation('I use VS Code')?.kind, 'fact');
  assert.equal(classifyConversation('I am tired'), null);
  assert.equal(classifyConversation('I am a teacher')?.kind, 'fact');
  assert.equal(classifyConversation('Tell me about animation'), null);
});

test('understands supported statement patterns in Capri’s five languages', () => {
  assert.equal(classifyConversation('Je préfère les réponses courtes')?.kind, 'preference');
  assert.equal(classifyConversation('Réponds de façon concise')?.kind, 'communication-style');
  assert.equal(classifyConversation('Me interesa la animación')?.kind, 'interest');
  assert.equal(classifyConversation('Estou trabalhando em Capri')?.kind, 'project');
  assert.equal(classifyConversation('Нет, я имел в виду второй вариант')?.kind, 'correction');
});

test('does not propose sensitive-looking statements or long text', () => {
  assert.equal(classifyConversation('I prefer to use my API key in this chat'), null);
  assert.equal(classifyConversation('I am taking medication for a diagnosis'), null);
  assert.equal(classifyConversation('I am allergic to peanuts'), null);
  assert.equal(classifyConversation('I love my boyfriend'), null);
  assert.equal(classifyConversation('I prefer being a lesbian'), null);
  assert.equal(classifyConversation(`I prefer ${'x'.repeat(240)}`), null);
});

test('redacts only a newly sensitive chat turn from persistent history, without mutating live messages', () => {
  const history = [
    { role: 'user', content: 'I prefer concise answers' },
    { role: 'assistant', content: 'Understood.' },
    { role: 'user', content: 'My password is not something to remember' },
    { role: 'assistant', content: 'I will not retain that.' },
  ];
  const saved = redactSensitiveTurn(history);
  assert.equal(saved[0].content, history[0].content);
  assert.match(saved[2].content, /omitted/);
  assert.match(saved[3].content, /omitted/);
  assert.equal(history[2].content, 'My password is not something to remember');
  assert.equal(history[3].content, 'I will not retain that.');
});

test('accepted items are local, typed, explicit, deduplicated, and never include the source transcript', async () => {
  const { learning, brain, writes } = fixture();
  learning.configure({ learningEnabled: true });
  const candidate = learning.propose('I prefer concise answers');
  assert.equal(await learning.accept(candidate, 1000), true);
  assert.equal(learning.entries.length, 1);
  assert.equal(learning.entries[0].kind, 'preference');
  assert.equal(learning.entries[0].evidence, 'explicit');
  assert.equal(learning.entries[0].status, 'accepted');
  assert.equal('sourceText' in learning.entries[0], false);
  assert.equal(writes.length, 1);
  assert.deepEqual(brain.custom.learningEntries, learning.entries);
  assert.equal(learning.propose('I prefer concise answers'), null);
});

test('existing manual memories are preserved and prevent duplicate learned entries', () => {
  const { learning, brain } = fixture();
  brain.custom.memories.push('I prefer concise answers');
  learning.configure({ learningEnabled: true });
  assert.equal(learning.propose('I prefer concise answers'), null);
  assert.deepEqual(brain.custom.memories, ['I prefer concise answers']);
});

test('projects and interests expire; durable preferences remain until deleted', async () => {
  const { learning } = fixture();
  const now = 10_000;
  learning.configure({ learningEnabled: true });
  await learning.accept(learning.propose("I'm working on Capri"), now);
  await learning.accept(learning.propose('I prefer concise answers'), now);
  const entries = learning.entries;
  assert.ok(entries[0].expiresAt > now);
  assert.equal(entries[1].expiresAt, null);
  learning.configure({ learningEnabled: true, learningEntries: entries }, now + 181 * 24 * 60 * 60 * 1000);
  assert.deepEqual(learning.entries.map((entry) => entry.kind), ['preference']);
});

test('users can correct, delete, and clear learned entries', async () => {
  const { learning, writes } = fixture();
  learning.configure({ learningEnabled: true });
  const candidate = learning.propose('I prefer concise answers');
  await learning.accept(candidate, 1000);
  const id = learning.entries[0].id;
  assert.equal(await learning.correct(id, 'I prefer short, direct answers', 2000), true);
  assert.equal(learning.entries[0].evidence, 'reviewed');
  assert.equal(learning.entries[0].confidence, 1);
  assert.equal(await learning.remove(id), true);
  assert.equal(learning.entries.length, 0);
  await learning.accept(candidate, 3000);
  assert.equal(await learning.clear(), true);
  assert.equal(learning.entries.length, 0);
  assert.ok(writes.length >= 4);
});

test('enforces the storage limit', async () => {
  const { learning } = fixture();
  learning.configure({ learningEnabled: true });
  for (let i = 0; i < MAX_LEARNING_ENTRIES + 3; i += 1) {
    await learning.accept({ kind: 'preference', text: `I prefer option ${i}`, evidence: 'explicit' }, i + 1);
  }
  assert.equal(learning.entries.length, MAX_LEARNING_ENTRIES);
});
