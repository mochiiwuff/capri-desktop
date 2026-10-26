'use strict';

// Quick test: send one chat message to Ollama's cloud API through src/main/ollama.js.
// Run:  OLLAMA_API_KEY=your_key node scripts/test-cloud.js

if (!process.env.OLLAMA_API_KEY) {
  console.error('Set OLLAMA_API_KEY first (see https://ollama.com/settings/keys).');
  process.exit(1);
}

// ollama.js uses `fetch` (available in Node 20+) and nothing from Electron.
const ollama = require('../src/main/ollama');

const MODEL = 'gpt-oss:20b';

(async () => {
  console.log(`[test] cloud mode: ${ollama.isCloud()}`);
  console.log(`[test] sending chat to ${MODEL}...\n`);

  try {
    const reply = await ollama.chat(
      { model: MODEL, messages: [{ role: 'user', content: 'Say hello in one sentence.' }] },
      (piece) => process.stdout.write(piece),
      AbortSignal.timeout(30000),
    );
    console.log('\n\n[test] done. full reply:', reply);
  } catch (err) {
    console.error('\n[test] error:', err.message);
    if (err.message.includes('401')) console.error('  → The key is wrong or missing.');
    if (err.message.includes('402')) console.error('  → This model is not in your plan.');
    if (err.message.includes('404')) console.error('  → Model name not found.');
    if (err.message.includes('429')) console.error('  → Usage limit reached.');
    process.exit(1);
  }
})();
