'use strict';

// QA only: run INSIDE the disposable guest. No models, credentials, or external requests.
// CAPRI_QA_GUEST=1 CAPRI_MOCK_PORT=47831 node tests/fixtures/mock-chat.cjs
// Select Custom with http://127.0.0.1:47831/v1 in Capri's AI setup.
if (process.env.CAPRI_QA_GUEST !== '1') {
  console.error('QA fixture: run only in the disposable VM with CAPRI_QA_GUEST=1.');
  process.exit(1);
}
const http = require('node:http');
const port = Number(process.env.CAPRI_MOCK_PORT) || 47831;
const model = 'capri-qa-mock';
const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
};
const server = http.createServer((req, res) => {
  if (req.headers.origin) return json(res, 403, { error: 'QA clients only' });
  if (req.method === 'GET' && req.url === '/v1/models') return json(res, 200, { data: [{ id: model }] });
  // Also catch accidental Ollama warm-up calls without ever loading a real model.
  if (req.url === '/api/tags') return json(res, 200, { models: [{ name: model }] });
  if (req.url === '/api/generate') return json(res, 200, { done: true, response: '' });
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return json(res, 404, { error: 'Unknown mock endpoint' });
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 512 * 1024) req.destroy();
    else chunks.push(chunk);
  });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(Buffer.concat(chunks)); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const text = body.messages?.filter((m) => m.role === 'user').at(-1)?.content || '';
    let answer = 'This is a fixed QA reply. No language model is running. Unicode works: café, 日本語.';
    if (/\bopen\s+textedit\b/i.test(text)) answer = 'Opening the disposable TextEdit app. [[open: TextEdit]]';
    else if (/\bclose\s+textedit\b/i.test(text)) answer = 'Please confirm before I close TextEdit. [[close: TextEdit]]';
    else if (/\blong\b/i.test(text)) answer = `${answer} `.repeat(12);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const pieces = answer.match(/.{1,9}/gu) || [];
    let i = 0;
    const timer = setInterval(() => {
      if (i < pieces.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: pieces[i++] } }] })}\n\n`);
      else { clearInterval(timer); res.end('data: [DONE]\n\n'); }
    }, 60);
    res.on('close', () => clearInterval(timer));
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Capri QA mock: http://127.0.0.1:${port}/v1 (guest only)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
