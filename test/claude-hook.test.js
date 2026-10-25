'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slim } = require('../hooks/capri-hook');

test('Claude event trimming and full-answer limit stay compatible', () => {
  const input = { hook_event_name: 'PreToolUse', session_id: 'claude', tool_name: 'Write', tool_input: { file_path: '/repo/a.js', content: 'private source' }, transcript_path: '/private' };
  const result = slim(input);
  assert.equal(result.provider, undefined);
  assert.deepEqual(result.tool_input, { file_path: '/repo/a.js', content_len: 14 });
  assert.equal(result.transcript_path, undefined);
  assert.equal(slim({ last_assistant_message: 'x'.repeat(8000) }).last_assistant_message.length, 6001);
});
