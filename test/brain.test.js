'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let Brain;
before(async () => {
  // Browser modules are loaded unchanged, with their two imports resolved to
  // data URLs so the Electron package can stay CommonJS (and Node 20 compatible).
  global.matchMedia = () => ({ matches: false });
  const dir = path.resolve(__dirname, '../src/renderer/js');
  const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  let source = fs.readFileSync(path.join(dir, 'brain.js'), 'utf8');
  for (const name of ['lines', 'util']) source = source.replace(`'./${name}.js'`, `'${url(fs.readFileSync(path.join(dir, `${name}.js`), 'utf8'))}'`);
  ({ Brain } = await import(url(source)));
});

function fixture(lang = 'en') {
  const messages = [];
  const capri = {
    windows: { fg: 'editor' }, pos: {}, mode: 'idle', celebrations: 0,
    wake() {}, attend() {}, goToWork() {}, pulse() {}, spark() {}, perform() {}, hurt() {},
    towardCenter: () => 1, spot: () => ({}), teleport: async () => {}, summon: async () => {},
    setMode(mode) { this.mode = mode; }, celebrate({ onSpeak }) { this.celebrations++; onSpeak(); }, earnUplink() {},
  };
  const panel = {
    say(message) { messages.push(message); this.current = message; },
    setTicker(value) { this.ticker = value; }, clearKind() {}, updateLog() {}, hide() {},
  };
  const brain = new Brain({ capri, panel, voice: { play() {} }, host: { cursor: async () => null }, lang });
  const send = (name, extra = {}) => brain.handle({ hook_event_name: name, session_id: 'same-id', ...extra });
  return { brain, capri, panel, messages, send };
}

test('Claude remains the default and Codex gets a separate session with its own dialogue', async () => {
  const { brain, messages, send } = fixture();
  send('UserPromptSubmit');
  send('UserPromptSubmit', { provider: 'codex' });
  assert.equal(brain.sessions.size, 2);
  assert.equal(brain.session({ session_id: 'same-id' }).assistant, 'Claude');
  assert.equal(brain.session({ session_id: 'same-id', provider: 'codex' }).assistant, 'Codex');
  await send('Notification', { provider: 'codex', notification_type: 'permission_prompt' });
  assert.ok(messages.at(-1).line.includes('Codex') || !messages.at(-1).line.includes('Claude'));
  brain.status();
  assert.ok(!messages.at(-1).line.includes('{assistant}'));
});

test('all provider-specific dialogue uses the right name in both languages', () => {
  for (const lang of ['en', 'fr']) {
    const { brain, messages } = fixture(lang);
    const s = brain.session({ session_id: 'codex', provider: 'codex' });
    for (const key of ['prompt', 'working', 'done', 'permission', 'waiting', 'error', 'crashed', 'reply']) {
      for (const line of brain.t[key]) {
        brain.say('info', line, s);
        assert.equal(messages.at(-1).line.includes('Claude'), false, `${lang}.${key}`);
        assert.equal(messages.at(-1).line.includes('{assistant}'), false);
      }
    }
  }
});

test('a multi-file patch is one action and counts unique affected files', () => {
  const { brain, panel, send } = fixture();
  send('UserPromptSubmit', { provider: 'codex' });
  send('PreToolUse', { provider: 'codex', tool_name: 'apply_patch', tool_input: { files: ['src/a.js', 'src/b.js', 'src/a.js'] } });
  const s = brain.session({ session_id: 'same-id', provider: 'codex' });
  assert.equal(s.count, 1);
  assert.equal(s.files.size, 2);
  assert.equal(panel.ticker.verb, 'Edits');
  assert.ok(panel.ticker.target.includes('a.js'));
});

test('interrupt ends work and clears permission state without victory', async () => {
  const { brain, capri, panel, send } = fixture();
  send('UserPromptSubmit', { provider: 'codex' });
  await send('Notification', { provider: 'codex', notification_type: 'permission_prompt' });
  send('Interrupt', { provider: 'codex' });
  assert.equal(brain.busySessions.length, 0);
  assert.equal(capri.mode, 'idle');
  assert.equal(capri.celebrations, 0);
  assert.equal(panel.ticker, null);
});

test('interrupting Codex leaves another working Claude session active', () => {
  const { brain, send } = fixture();
  send('UserPromptSubmit');
  send('UserPromptSubmit', { provider: 'codex' });
  send('Interrupt', { provider: 'codex' });
  assert.equal(brain.busySessions.length, 1);
  assert.equal(brain.busySessions[0].assistant, 'Claude');
});

test('completion preserves the answer panel when away from the submitting window', async () => {
  const { capri, messages, send } = fixture();
  send('UserPromptSubmit', { provider: 'codex' });
  capri.windows.fg = 'other';
  await send('Stop', { provider: 'codex', last_assistant_message: 'Fixed the bug.' });
  assert.equal(messages.at(-1).reply, 'Fixed the bug.');
  assert.equal(capri.celebrations, 1);
});

test('late events cannot revive interrupted turns or stop a newer Codex turn', async () => {
  const { brain, capri, send } = fixture();
  const old = { provider: 'codex', turn_id: 'old' };
  const next = { provider: 'codex', turn_id: 'new' };
  send('UserPromptSubmit', old);
  send('Interrupt', old);
  send('PreToolUse', { ...old, tool_name: 'Bash' });
  assert.equal(brain.busySessions.length, 0);
  send('UserPromptSubmit', next);
  await send('Stop', { ...old, last_assistant_message: 'old answer' });
  assert.equal(brain.busySessions.length, 1);
  assert.equal(capri.celebrations, 0);
  await send('Stop', { ...next, last_assistant_message: 'new answer' });
  send('PreToolUse', { ...next, tool_name: 'Bash' });
  assert.equal(brain.busySessions.length, 0);
});

test('a delayed prompt retains tools already observed for the same turn', () => {
  const { brain, send } = fixture();
  const turn = { provider: 'codex', turn_id: 'turn' };
  send('PreToolUse', { ...turn, tool_name: 'Bash' });
  send('UserPromptSubmit', turn);
  assert.equal(brain.busySessions[0].count, 1);
});

test('an early next-turn completion cannot be revived by its delayed prompt', async () => {
  const { brain, send } = fixture();
  send('UserPromptSubmit', { provider: 'codex', turn_id: 'A' });
  await send('Stop', { provider: 'codex', turn_id: 'A' });
  await send('Stop', { provider: 'codex', turn_id: 'B' });
  send('UserPromptSubmit', { provider: 'codex', turn_id: 'B' });
  assert.equal(brain.busySessions.length, 0);
});

test('interrupting Codex preserves a different session approval alert', async () => {
  const { capri, panel, send } = fixture();
  send('UserPromptSubmit');
  await send('Notification', { notification_type: 'permission_prompt', message: 'Claude approval' });
  const alert = panel.current;
  send('UserPromptSubmit', { provider: 'codex' });
  // Real Panel keeps its higher-priority alert while Codex starts working.
  panel.current = alert;
  send('Interrupt', { provider: 'codex' });
  assert.equal(panel.current, alert);
  assert.equal(capri.mode, 'alert');
});

test('delayed or unrelated tool hooks cannot dismiss a Codex approval alert', async () => {
  const { brain, panel, send } = fixture();
  const tool = { provider: 'codex', tool_name: 'Bash', tool_input: { command: 'npm test' } };
  send('UserPromptSubmit', { provider: 'codex' });
  await send('Notification', { ...tool, notification_type: 'permission_prompt' });
  const alert = panel.current;
  send('PreToolUse', tool);
  send('PostToolUse', { ...tool, tool_input: { command: 'git status' } });
  assert.equal(brain.busySessions[0].waiting, true);
  assert.equal(panel.current, alert);
  send('PostToolUse', tool);
  assert.equal(brain.busySessions[0].waiting, false);
});
