// self-check: keyless gateway + Claude Code through llm.js
const assert = require('node:assert');
const llm = require('../src/main/llm');
(async () => {
  const cfg = { apiKeys: {}, claudeMode: 'default', claudeCwd: process.cwd() };
  const models = await llm.models('pollinations', cfg);
  assert(models.length, 'pollinations models');
  let streamed = '';
  const text = await llm.chat('pollinations', cfg, { model: models[0], messages: [{ role: 'user', content: 'Say just: hi' }] }, (p) => { streamed += p; }, new AbortController().signal);
  assert(text && text === streamed, 'pollinations stream');
  console.log('pollinations:', models[0], '->', text.slice(0, 60));
  await assert.rejects(llm.models('openai', cfg), /no API key/);
  assert.deepStrictEqual(await llm.models('claude', cfg), ['Claude Code']);
  const a = await llm.chat('claude', cfg, { messages: [{ role: 'user', content: 'Remember the word "kiwi". Reply only: ok' }] }, () => {}, new AbortController().signal);
  const b = await llm.chat('claude', cfg, { messages: [{ role: 'user', content: 'What word did I ask you to remember? One word.' }] }, () => {}, new AbortController().signal);
  console.log('claude:', a, '|', b);
  assert(/kiwi/i.test(b), 'claude session resumes');
  console.log('ALL OK');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
