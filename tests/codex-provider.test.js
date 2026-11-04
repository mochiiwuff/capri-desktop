'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const llm = require('../src/main/llm');

test('Codex chat uses isolated read-only CLI and returns only assistant output', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-codex-test-'));
  const oldPath = process.env.PATH;
  const oldCapture = process.env.CAPRI_TEST_CAPTURE;
  const capture = path.join(dir, 'request.json');
  const exe = path.join(dir, 'codex');
  fs.writeFileSync(exe, `#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv.includes('--version') || process.argv.includes('login')) { console.log('ready'); process.exit(0); }
let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{
 fs.writeFileSync(process.env.CAPRI_TEST_CAPTURE, JSON.stringify({args:process.argv.slice(2),input}));
 console.log(JSON.stringify({type:'item.completed',item:{type:'reasoning',text:'private'}}));
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'สวัสดี'}}));
 console.log(JSON.stringify({type:'turn.completed'}));
});
`);
  fs.chmodSync(exe, 0o755);
  process.env.PATH = `${dir}${path.delimiter}${oldPath}`;
  process.env.CAPRI_TEST_CAPTURE = capture;
  t.after(() => { process.env.PATH = oldPath; if (oldCapture === undefined) delete process.env.CAPRI_TEST_CAPTURE; else process.env.CAPRI_TEST_CAPTURE = oldCapture; fs.rmSync(dir, { recursive: true, force: true }); });
  assert.deepEqual(await llm.models('codex', {}), ['Codex CLI']);
  const deltas = [];
  const messages = [{ role: 'system', content: 'Persona' }, { role: 'user', content: 'สวัสดี' }];
  const answer = await llm.chat('codex', {}, { model: 'Codex CLI', messages }, part => deltas.push(part), new AbortController().signal);
  assert.equal(answer, 'สวัสดี');
  assert.deepEqual(deltas, ['สวัสดี']);
  const request = JSON.parse(fs.readFileSync(capture, 'utf8'));
  assert.ok(request.args.includes('--ephemeral'));
  assert.ok(request.args.includes('--ignore-user-config'));
  assert.ok(request.args.includes('read-only'));
  assert.ok(request.args.includes('hooks'));
  assert.ok(request.input.includes(JSON.stringify(messages)));
  assert.ok(!request.args.some(arg => arg.includes('สวัสดี')));
});

test('Codex chat respects cancellation before starting', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(llm.chat('codex', {}, { messages: [] }, () => {}, abort.signal), /stopped/);
});

test('Codex hook installation points at the durable hook and detects a missing script', (t) => {
  const { configure, status, EVENTS } = require('../scripts/install-codex-hooks');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-codex-hook-test-'));
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = dir;
  t.after(() => { if (previous === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous; fs.rmSync(dir, { recursive: true, force: true }); });
  const durable = path.join(dir, 'persistent', 'capri-codex-hook.js');
  fs.mkdirSync(path.dirname(durable));
  fs.writeFileSync(durable, '// test hook');
  configure(false, durable);
  assert.equal(status().installed, true);
  assert.equal(status().events.length, EVENTS.length);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'hooks.json'), 'utf8'));
  assert.ok(config.hooks.Stop[0].hooks[0].command.includes(durable));
  fs.unlinkSync(durable);
  assert.equal(status().installed, false);
});
