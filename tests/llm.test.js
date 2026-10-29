'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const llm = require('../src/main/llm');

const cfg = { apiKeys: { openai: 'test-key' } };

test('OpenAI chat discovery excludes speech, image, embedding and specialized endpoint models', async (t) => {
  const usable = ['gpt-4o-mini', 'gpt-4.1-2025-04-14', 'o3-mini', 'ft:gpt-4o-mini:qa:custom:123'];
  const others = ['tts-1', 'tts-1-hd', 'whisper-1', 'text-embedding-3-small', 'dall-e-3', 'babbage-002',
    'gpt-image-1', 'gpt-4o-mini-tts', 'gpt-4o-transcribe', 'gpt-realtime', 'gpt-4o-audio-preview',
    'gpt-3.5-turbo-instruct', 'gpt-5-codex', 'o1-pro', 'o3-deep-research', 'o1-mini'];
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://api.openai.com/v1/models');
    return Response.json({ data: [...others, ...usable].map((id) => ({ id })) });
  });
  assert.deepEqual(await llm.models('openai', cfg), usable);
});

test('custom servers retain their own model names', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [{ id: 'my-local-model' }] }));
  assert.deepEqual(await llm.models('custom', { customUrl: 'http://127.0.0.1:1234/v1' }), ['my-local-model']);
});

test('billing and quota errors remain actionable instead of requesting model fallback', async (t) => {
  for (const code of ['credit_balance_exhausted', 'insufficient_quota', 'project_spend_limit_exceeded',
    'organization_spend_limit_exceeded', 'organization_usage_limit_exceeded', 'usage_limit_exceeded']) {
    await t.test(code, async (t) => {
      t.mock.method(globalThis, 'fetch', async () => Response.json({
        error: { code, message: 'Check API billing or limits.' },
      }, { status: 429 }));
      await assert.rejects(llm.chat('openai', cfg, {
        model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'test' }],
      }, () => {}, new AbortController().signal), (err) => {
        assert.equal(err.code, 'quota'); assert.equal(err.status, 429);
        assert.equal(err.message, 'Check API billing or limits.');
        return true;
      });
    });
  }
});

test('transient rate limits and overload retain retry classification', async (t) => {
  for (const [status, code] of [[429, 'rate_limit_exceeded'], [429, 'slow_down'], [503, 'server_is_overloaded']]) {
    await t.test(code, async (t) => {
      t.mock.method(globalThis, 'fetch', async () => Response.json({
        error: { code, message: 'Try later.' },
      }, { status }));
      await assert.rejects(llm.chat('openai', cfg, {
        model: 'gpt-4o-mini', messages: [],
      }, () => {}, new AbortController().signal), (err) => err.code === 'busy' && err.status === status);
    });
  }
});
