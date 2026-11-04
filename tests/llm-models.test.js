'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const llm = require('../src/main/llm');

test('slow Gemini model verification succeeds without rejecting its key', async () => {
  const original = global.fetch;
  global.fetch = async (_url, { signal, headers }) => {
    assert.equal(headers.authorization, 'Bearer test-key');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 5200);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
    return { ok: true, json: async () => ({ data: [{ id: 'gemini-2.5-flash' }] }) };
  };
  try {
    assert.deepEqual(await llm.models('gemini', { apiKeys: { gemini: 'test-key' } }), ['gemini-2.5-flash']);
  } finally { global.fetch = original; }
});

test('provider rejection keeps Google error for diagnosis', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'API key rejected' } }) });
  try {
    await assert.rejects(llm.models('gemini', { apiKeys: { gemini: 'test-key' } }), /API key rejected/);
  } finally { global.fetch = original; }
});
