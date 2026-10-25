'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { normalize } = require('../hooks/capri-codex-hook');

const event = (name, extra = {}) => ({ hook_event_name: name, session_id: 'thread-1', cwd: '/repo', ...extra });

test('preserves supported lifecycle events and identifies Codex', () => {
  for (const name of ['SessionStart', 'UserPromptSubmit', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact', 'SessionEnd', 'Interrupt']) {
    const result = normalize(event(name, { prompt: 'fix it', last_assistant_message: 'done', turn_id: 'turn-1' }));
    assert.equal(result.hook_event_name, name);
    assert.equal(result.provider, 'codex');
    assert.equal(result.session_id, 'thread-1');
    assert.equal(result.turn_id, 'turn-1');
  }
  for (const value of [null, [], 'bad', {}, event('Unknown')]) assert.equal(normalize(value), null);
});

test('maps approval requests to a passive Capri alert', () => {
  const result = normalize(event('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run tests outside sandbox' } }));
  assert.equal(result.hook_event_name, 'Notification');
  assert.equal(result.notification_type, 'permission_prompt');
  assert.equal(result.message, 'Run tests outside sandbox');
  assert.equal(result.hookSpecificOutput, undefined);
});

test('extracts all patch paths, including moves, without leaking source', () => {
  const patch = '*** Begin Patch\n*** Add File: one.js\n+SECRET\n*** Update File: two.js\n*** Move to: renamed.js\n@@\n-old\n+SECRET\n*** Delete File: three.js\n*** End Patch';
  const result = normalize(event('PreToolUse', { tool_name: 'apply_patch', tool_input: { command: patch } }));
  assert.deepEqual(result.tool_input.files, ['one.js', 'two.js', 'renamed.js', 'three.js']);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  assert.equal(result.tool_input.command, undefined);
});

test('ignores fake patch headers inside added source and bounds output', () => {
  const patch = `*** Begin Patch\n*** Add File: real.js\n+*** Delete File: fake.js\n+${'secret'.repeat(10000)}\n*** End Patch`;
  const result = normalize(event('PreToolUse', { tool_name: 'apply_patch', tool_input: { command: patch } }));
  assert.deepEqual(result.tool_input.files, ['real.js']);
  assert.ok(JSON.stringify(result).length < 1000);
  assert.equal(normalize(event('Stop', { last_assistant_message: 'x'.repeat(9000) })).last_assistant_message.length, 6001);
});

test('recognizes shell and MCP failures without forwarding entire tool results', () => {
  for (const tool_response of [{ exit_code: 2, output: 'Expected 2, got 3' }, { isError: true, content: [{ type: 'text', text: 'Server unavailable' }] }, 'Process exited with code 1\nOutput:\nTest failed']) {
    const result = normalize(event('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response }));
    assert.equal(result.hook_event_name, 'PostToolUseFailure');
    assert.ok(result.error);
    assert.equal(result.tool_response, undefined);
  }
  const ok = normalize(event('PostToolUse', { tool_name: 'Bash', tool_response: { exit_code: 0, output: 'error is just a string' } }));
  assert.equal(ok.hook_event_name, 'PostToolUse');
});

test('keeps only display fields and handles non-object tool inputs', () => {
  const result = normalize(event('PreToolUse', { tool_name: 'mcp__files__write', tool_input: { path: '/repo/a', content: 'SECRET', token: 'SECRET' }, transcript_path: '/private/history' }));
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  assert.equal(result.transcript_path, undefined);
  assert.doesNotThrow(() => normalize(event('PreToolUse', { tool_name: 'Bash', tool_input: null })));
});

function runHook(input, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../hooks/capri-codex-hook.js')], { env: { ...process.env, CAPRI_PORT: String(port) }, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test('delivers an event over loopback and exits silently when offline or given malformed input', async (t) => {
  let received;
  const server = http.createServer((req, res) => {
    assert.equal(req.url, '/event');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { received = JSON.parse(body); res.end('{}'); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = server.address().port;
  assert.deepEqual(await runHook(JSON.stringify(event('Stop', { last_assistant_message: 'All done' })), port), { code: 0, stdout: '', stderr: '' });
  assert.equal(received.last_assistant_message, 'All done');
  await new Promise((resolve) => server.close(resolve));
  assert.deepEqual(await runHook('{}', port), { code: 0, stdout: '', stderr: '' });
  assert.deepEqual(await runHook('not JSON', port), { code: 0, stdout: '', stderr: '' });
  assert.deepEqual(await runHook(JSON.stringify(event('Stop')), port), { code: 0, stdout: '', stderr: '' });
});
