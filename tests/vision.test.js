'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const llm = require('../src/main/llm');

function moduleUrl(file) {
  const source = require('node:fs').readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

test('OpenAI-compatible vision requests attach a temporary image without mutating chat history', () => {
  const messages = [
    { role: 'system', content: 'Capri' },
    { role: 'user', content: 'Look at my screen' },
  ];
  const image = 'aGVsbG8=';
  const payload = llm.openaiMessages(messages, image);

  assert.deepEqual(payload[1].content, [
    { type: 'text', text: 'Look at my screen' },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
  ]);
  assert.equal(messages[1].content, 'Look at my screen');
});

test('Ollama vision requests put the temporary image in the final user message', async () => {
  const originalFetch = globalThis.fetch;
  const originalHost = process.env.OLLAMA_HOST;
  let request;
  process.env.OLLAMA_HOST = '127.0.0.1:11434';
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return new Response('{"message":{"content":"I can see the screen"},"done":true}\n');
  };
  try {
    const text = await llm.chat('ollama', {}, {
      model: 'vision-model',
      messages: [{ role: 'user', content: 'Look at my screen' }],
      image: 'aGVsbG8=',
    }, () => {}, new AbortController().signal);
    assert.equal(text, 'I can see the screen');
    assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
    assert.deepEqual(request.body.messages[0], {
      role: 'user', content: 'Look at my screen', images: ['aGVsbG8='],
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = originalHost;
  }
});

test('OpenAI-compatible vision requests send image_url only for the explicit look request', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return new Response('data: [DONE]\n\n');
  };
  try {
    await llm.chat('custom', { customUrl: 'http://localhost:1234/v1' }, {
      model: 'vision-model',
      messages: [{ role: 'user', content: 'Look at my screen' }],
      image: 'aGVsbG8=',
    }, () => {}, new AbortController().signal);
    assert.equal(request.url, 'http://localhost:1234/v1/chat/completions');
    assert.deepEqual(request.body.messages[0].content[1], {
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,aGVsbG8=' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Ctrl+Alt+L chat action captures once and sends the image only with the look request', async (t) => {
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => { delete globalThis.matchMedia; });
  const { Chat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/chat.js')));
  const chat = Object.create(Chat.prototype);
  let captures = 0;
  let sent;
  chat.turn = 0;
  chat.open = true;
  chat.start = async () => {};
  chat.host = { captureScreen: async () => { captures++; return { ok: true, image: 'screen-image' }; } };
  chat.brain = { lang: 'pt' };
  chat.sendMessage = async (prompt, image) => { sent = { prompt, image }; };

  await chat.look();
  assert.equal(captures, 1);
  assert.equal(sent.image, 'screen-image');
  assert.match(sent.prompt, /captura de tela anexada/);
});
