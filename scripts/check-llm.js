// self-check: keyless gateway + Claude Code through llm.js
const assert = require('node:assert');
const http = require('node:http');
const llm = require('../src/main/llm');

const seen = new Set(); // session ids in the hook events Claude Code sends while she chats
process.env.CAPRI_PORT = '47999'; // inherited by claude, then by its hooks: not the running Capri's port
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => { try { seen.add(JSON.parse(body).session_id); } catch {} res.end('{}'); });
}).listen(47999, '127.0.0.1').unref();
(async () => {
  const cfg = { apiKeys: {}, claudeMode: 'default', claudeCwd: process.cwd() };
  // which note her chat shows: "local AI" only when the answers stay on this PC
  assert(llm.isLocal('lmstudio', cfg) && !llm.isLocal('claude', cfg) && !llm.isLocal('pollinations', cfg), 'local providers');
  assert(llm.isLocal('custom', { customUrl: 'http://localhost:5000/v1' }), 'local custom url');
  assert(!llm.isLocal('custom', { customUrl: 'http://localhost.evil.com/v1' }), 'cloud custom url');
  const models = await llm.models('pollinations', cfg);
  assert(models.length, 'pollinations models');
  let streamed = '';
  const text = await llm.chat('pollinations', cfg, { model: models[0], messages: [{ role: 'user', content: 'Say just: hi' }] }, (p) => { streamed += p; }, new AbortController().signal);
  assert(text && text === streamed, 'pollinations stream');
  console.log('pollinations:', models[0], '->', text.slice(0, 60));
  await assert.rejects(llm.models('openai', cfg), /no API key/);
  assert.deepStrictEqual(await llm.models('claude', cfg), ['Claude Code']);
  const persona = { role: 'system', content: 'You are Capri, a playful ghost from Project Capricorn. Keep it to one sentence.' };
  const a = await llm.chat('claude', cfg, { messages: [persona, { role: 'user', content: 'Remember the word "kiwi". Reply only: ok' }] }, () => {}, new AbortController().signal);
  const b = await llm.chat('claude', cfg, { messages: [persona, { role: 'user', content: 'What word did I ask you to remember, and what is your name?' }] }, () => {}, new AbortController().signal);
  console.log('claude:', a, '|', b);
  // her hooks (if installed) post this chat's events to CAPRI_PORT: all of them must be recognised as hers
  if (seen.size) assert([...seen].every(llm.isChatSession), `chat events recognised: ${[...seen]}`);
  console.log('hook sessions seen:', seen.size ? [...seen] : 'none (hooks not installed)');
  assert(/kiwi/i.test(b), 'claude session resumes');
  assert(/capri/i.test(b), 'claude speaks as her');
  console.log('ALL OK');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
