'use strict';

// Talking to her: a local model through Ollama (https://ollama.com). Done from here, not from
// the overlay's page, which can't reach other local ports. Everything stays on this machine
// unless OLLAMA_HOST points somewhere else.

function base() {
  let host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
  if (!/^https?:\/\//.test(host)) host = `http://${host}`;
  return host.replace('://0.0.0.0', '://127.0.0.1').replace(/\/+$/, '');
}

// Ollama's errors come as {"error": "..."}
async function failure(res) {
  const body = await res.text().catch(() => '');
  try {
    return new Error(JSON.parse(body).error);
  } catch {
    return new Error(body || `Ollama answered ${res.status}`);
  }
}

// The models installed, by name ("llama3.2:latest"...).
async function models() {
  return (await catalog()).map((m) => m.name);
}

// Families that see pictures, for an Ollama too old to say so itself.
const SEES = /llava|vision|gemma3|qwen2\.5vl|qwen\d*-?vl|minicpm-v|moondream|mistral-small3|llama4/i;

// The models installed, and which of them can look at a picture (her look at your screen):
// [{ name, vision }]. Recent Ollamas list their capabilities; older ones are asked one by one.
async function catalog() {
  const res = await fetch(`${base()}/api/tags`, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw await failure(res);
  const { models: list = [] } = await res.json();
  return Promise.all(list.map(async (m) => {
    if (Array.isArray(m.capabilities)) return { name: m.name, vision: m.capabilities.includes('vision') };
    const shown = await fetch(`${base()}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: m.name }),
      signal: AbortSignal.timeout(2500),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const caps = shown?.capabilities;
    return { name: m.name, vision: Array.isArray(caps) ? caps.includes('vision') : SEES.test(m.name) };
  }));
}

// Loads the model into memory ahead of the first message (the first answer after a fresh start
// otherwise waits for it to load, which can take a while).
function warm(model) {
  fetch(`${base()}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: '15m' }),
  }).catch(() => {});
}

// Her answer, streamed: onDelta(piece) as it comes, resolves with all of it. A message can carry
// `images` (base64): her look at your screen, for a model that sees.
async function chat({ model, messages, long = false }, onDelta, signal) {
  const res = await fetch(`${base()}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      keep_alive: '15m', // she stays loaded while you chat
      options: { temperature: 0.85, num_predict: long ? 400 : 240 }, // long: telling you what she sees
    }),
    signal,
  });
  if (!res.ok) throw await failure(res);
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(msg.error);
      const piece = msg.message?.content || ''; // a thinking model's reasoning comes apart, and is left out
      if (piece) {
        text += piece;
        onDelta(piece);
      }
      if (msg.done) return text;
    }
  }
  return text;
}

module.exports = { base, models, catalog, warm, chat };
