'use strict';

// Who she talks with: Ollama, any OpenAI-compatible server (local, cloud, or a keyless gateway),
// or Claude Code itself (headless `claude -p`, so your messages become its prompts).
// Keys come from config.json's `apiKeys` ({ openai: "sk-..." }) or the provider's env variable.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const ollama = require('./ollama');

const PROVIDERS = {
  ollama: { label: 'Ollama (local)', kind: 'ollama', local: true },
  lmstudio: { label: 'LM Studio (local)', url: 'http://127.0.0.1:1234/v1', local: true },
  llamacpp: { label: 'llama.cpp / vLLM (local :8080)', url: 'http://127.0.0.1:8080/v1', local: true },
  pollinations: {
    label: 'Pollinations (no key)', url: 'https://text.pollinations.ai/openai', modelsUrl: 'https://text.pollinations.ai/models',
  },
  openrouter: { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', env: 'OPENROUTER_API_KEY' },
  openai: { label: 'OpenAI', url: 'https://api.openai.com/v1', env: 'OPENAI_API_KEY' },
  groq: { label: 'Groq', url: 'https://api.groq.com/openai/v1', env: 'GROQ_API_KEY' },
  gemini: { label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', env: 'GEMINI_API_KEY' },
  deepseek: { label: 'DeepSeek', url: 'https://api.deepseek.com/v1', env: 'DEEPSEEK_API_KEY' },
  mistral: { label: 'Mistral', url: 'https://api.mistral.ai/v1', env: 'MISTRAL_API_KEY' },
  custom: { label: 'Custom (customUrl in config)' },
  claude: { label: 'Claude Code (sends to the terminal agent)', kind: 'claude' },
};

// no bypassPermissions: a chat bubble on the desktop shouldn't run anything without asking
const CLAUDE_MODES = ['default', 'acceptEdits'];

function endpoint(id, cfg) {
  const p = PROVIDERS[id];
  const url = (id === 'custom' ? cfg.customUrl : p.url) || '';
  const key = cfg.apiKeys?.[id] || (p.env && process.env[p.env]) || '';
  return { ...p, url: url.replace(/\/+$/, ''), key };
}

const headers = (key) => ({ 'content-type': 'application/json', ...(key && { authorization: `Bearer ${key}` }) });

// Keep cloud and local chat requests inside a predictable context budget. The visible
// transcript remains untouched; only the copy sent to the model is compacted.
function boundMessages(messages, maxChars = 18000) {
  const input = Array.isArray(messages) ? messages : [];
  const system = input.find((message) => message?.role === 'system');
  const latest = input.at(-1);
  const systemMessage = system
    ? { role: 'system', content: String(system.content || '').slice(0, 6000) }
    : null;
  const systemSize = systemMessage ? systemMessage.content.length : 0;
  const latestBudget = Math.max(2000, maxChars - systemSize - 32);
  const latestContent = String(latest?.content || '');
  const boundedLatest = latestContent.length > latestBudget
    ? `${latestContent.slice(0, Math.floor(latestBudget * 0.55))}\n[…contexto reduzido…]\n${latestContent.slice(-Math.floor(latestBudget * 0.45))}`
    : latestContent;
  const latestMessage = latest ? { ...latest, content: boundedLatest } : null;
  const reserved = (systemMessage?.content.length || 0) + (latestMessage?.content.length || 0);
  let remaining = Math.max(0, maxChars - reserved);
  const middle = [];
  for (let i = input.length - 2; i >= 0; i--) {
    const message = input[i];
    if (!message || message === system || message.role === 'system') continue;
    const content = String(message.content || '');
    const cost = content.length + 16;
    if (cost > remaining) continue;
    middle.unshift({ ...message, content });
    remaining -= cost;
  }
  return [...(systemMessage ? [systemMessage] : []), ...middle, ...(latestMessage ? [latestMessage] : [])];
}

function classifyFailure(status, message) {
  if (/tokens per day|\bTPD\b|daily token|insufficient_quota|quota (?:exceeded|reached)/i.test(message)) return 'quota';
  if (status === 429 || status === 503 || /overloaded|high demand|unavailable/i.test(message)) return 'busy';
  if (status === 404) return 'gone';
  return null;
}

// Why a server said no (Gemini sends its error inside an array), and whether retrying makes sense.
async function failure(res) {
  const body = await res.text().catch(() => '');
  let message = body.slice(0, 200) || `answered ${res.status}`;
  try {
    const parsed = JSON.parse(body);
    const err = (Array.isArray(parsed) ? parsed[0] : parsed)?.error;
    if (err) message = typeof err === 'string' ? err : err.message || message;
  } catch {
    // not JSON: the start of the body says it
  }
  const code = classifyFailure(res.status, message);
  return Object.assign(new Error(message), { status: res.status, code });
}

// Gemini lists every model it has (embeddings, speech, images…): only the ones to chat with, a current
// stable Flash first (older ones get closed to new keys, previews come and go).
function geminiModels(names) {
  const version = (n) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] || 0);
  const rank = (n) => (/preview|exp/.test(n) ? 4 : 0) + (/flash-lite/.test(n) ? 1 : /flash/.test(n) ? 0 : 2);
  return names
    .filter((n) => /gemini/.test(n) && !/embed|tts|image|audio|live|veo|imagen|computer-use|robotics|aqa/.test(n))
    .sort((a, b) => rank(a) - rank(b) || version(b) - version(a));
}

function chatCompletionModels(names) {
  // OpenAI-compatible providers can list speech, embedding and moderation models
  // alongside chat models. Never let fallback select those as a chat model.
  return names.filter((name) => !/(?:whisper|\btts\b|text-to-speech|speech-to-text|transcri(?:be|ption)|embed(?:ding)?|moderation|prompt-guard|rerank)/i.test(name));
}

// The provider's models by name; null when it can't be reached (Ollama only), throws with why otherwise.
async function models(id, cfg) {
  const p = endpoint(id, cfg);
  if (p.kind === 'ollama') return ollama.models().catch(() => null);
  if (p.kind === 'claude') return claudeVersion().then(() => ['Claude Code']);
  // what's missing has a code, so her setup knows what to ask for (setup.js)
  if (!p.url) throw Object.assign(new Error('no address set for this server'), { code: 'nourl' });
  if (p.env && !p.key) throw Object.assign(new Error(`no API key (or ${p.env})`), { code: 'nokey' });
  const res = await fetch(p.modelsUrl || `${p.url}/models`, { headers: headers(p.key), signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw await failure(res);
  const body = await res.json();
  const list = Array.isArray(body) ? body : body.data || body.models || [];
  const names = list.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
  return id === 'gemini' ? geminiModels(names) : chatCompletionModels(names);
}

function warm(id, model) {
  if (PROVIDERS[id].kind === 'ollama') ollama.warm(model);
}

// OpenAI-style streaming (server-sent events): onDelta(piece) as it comes, resolves with all of it.
function openaiMessages(messages, image) {
  if (!image) return messages;
  const copy = messages.map((message) => ({ ...message }));
  const last = copy.at(-1);
  if (last?.role === 'user') {
    last.content = [
      { type: 'text', text: String(last.content || '') },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
    ];
  }
  return copy;
}

async function openaiChat(p, { model, messages, image }, onDelta, signal) {
  const res = await fetch(`${p.url}/chat/completions`, {
    method: 'POST',
    headers: headers(p.key),
    // Let each provider apply its model-specific completion limit. A fixed max_tokens
    // breaks otherwise valid models (for example, some Groq routes allow only 512).
    body: JSON.stringify({ model, messages: openaiMessages(messages, image), stream: true }),
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
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return text;
      const msg = JSON.parse(data);
      if (msg.error) throw new Error(msg.error.message || msg.error);
      const piece = msg.choices?.[0]?.delta?.content || ''; // reasoning comes apart, and is left out
      if (piece) {
        text += piece;
        onDelta(piece);
      }
    }
  }
  return text;
}

// --- Claude Code ---------------------------------------------------------------------------------
// The prompt goes in on stdin, never on the command line: the shell (needed for an npm claude.cmd)
// only ever sees fixed arguments.

const quote = (s) => (process.platform === 'win32' ? `"${s}"` : s); // cmd joins the arguments
// its session id, picked here so her hooks can tell its events from your other sessions' (main.js)
let claudeSession = null;
let claudeStarted = false; // each message after the first continues the same conversation

function claudeVersion() {
  return new Promise((resolve, reject) => {
    execFile('claude', ['--version'], { shell: process.platform === 'win32', timeout: 10000 }, (err, out) => (
      err ? reject(new Error('Claude Code not found (is `claude` on your PATH?)')) : resolve(out.trim())));
  });
}

function claudeChat(cfg, text, persona, onDelta, signal) {
  // her persona, from a file: too long and too full of quotes and newlines for cmd's command line
  const personaFile = path.join(os.tmpdir(), 'capri-persona.txt');
  fs.writeFileSync(personaFile, persona);
  const args = ['-p', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', CLAUDE_MODES.includes(cfg.claudeMode) ? cfg.claudeMode : 'default',
    '--append-system-prompt-file', quote(personaFile)];
  if (!claudeSession) claudeSession = randomUUID();
  args.push(claudeStarted ? '--resume' : '--session-id', claudeSession);
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: cfg.claudeCwd || os.homedir(),
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    const kill = () => (process.platform === 'win32'
      ? execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {})
      : child.kill());
    signal.addEventListener('abort', kill, { once: true });
    let buffer = '';
    let all = '';
    let result = null;
    let errors = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        claudeStarted = true;
        if (msg.type === 'assistant') {
          for (const block of msg.message?.content || []) {
            if (block.type === 'tool_use') {
              console.warn('[capri:agent-tool]', JSON.stringify({ name: block.name || 'unknown', session: claudeSession }));
            }
            if (block.type !== 'text' || !block.text) continue;
            const piece = (all ? '\n' : '') + block.text;
            all += piece;
            onDelta(piece);
          }
        } else if (msg.type === 'result') {
          result = msg;
        }
      }
    });
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.stdin.end(text);
    child.on('error', reject);
    child.on('close', () => {
      if (signal.aborted) return reject(new Error('stopped'));
      if (result?.is_error) return reject(new Error(result.result || 'Claude Code failed'));
      if (!result) return reject(new Error(errors.trim().slice(0, 300) || 'Claude Code gave no answer'));
      resolve(result.result || all);
    });
  });
}

function resetClaude() {
  claudeSession = null;
  claudeStarted = false;
}

// Claude Code's conversation, to save and pick up again after a restart.
const claudeMemory = () => ({ session: claudeSession, started: claudeStarted });
function restoreClaude(saved) {
  claudeSession = saved?.session || null;
  claudeStarted = Boolean(claudeSession && saved.started);
}

const isChatSession = (id) => Boolean(id) && id === claudeSession;

async function chat(id, cfg, { model, messages, image }, onDelta, signal) {
  const p = endpoint(id, cfg);
  messages = boundMessages(messages);
  if (p.kind === 'ollama') return ollama.chat({ model, messages, image }, onDelta, signal);
  // Claude Code keeps its own memory of the conversation: only her persona and your last message go
  if (p.kind === 'claude') return claudeChat(cfg, messages.at(-1).content, messages[0].content, onDelta, signal);
  return openaiChat(p, { model, messages, image }, onDelta, signal);
}

// Whether her answers stay on this PC: a server on this machine.
function isLocal(id, cfg) {
  if (id === 'ollama') return /^(https?:\/\/)?(127\.0\.0\.1|localhost|0\.0\.0\.0|\[?::1\]?)(:|\/|$)/.test(process.env.OLLAMA_HOST || '127.0.0.1');
  if (id === 'custom') return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(cfg.customUrl || '');
  return Boolean(PROVIDERS[id].local);
}


// Models that are known to support vision (image input) per provider.
// For Ollama, we check the model name heuristically (any model with 'llava', 'vision', 'minicpm', 'moondream').
// For cloud providers, we list known vision-capable model name substrings.
const VISION_MODELS = {
  groq: ['llava', 'vision', 'llama-3.2-11b', 'llama-3.2-90b'],
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'o1', 'chatgpt-4o', 'qwen'],
  gemini: ['gemini'],     // all Gemini models support vision
  openrouter: [],         // openrouter: any model may or may not; we allow it optimistically
  ollama: ['llava', 'vision', 'minicpm', 'moondream', 'bakllava', 'cogvlm', 'qwen'],
  lmstudio: ['llava', 'vision', 'minicpm', 'moondream', 'qwen'],
  llamacpp: ['llava', 'vision', 'minicpm', 'moondream', 'qwen'],
  pollinations: ['openai', 'gpt', 'claude', 'gemini', 'qwen'], // pollinations routes to vision-capable backends
  mistral: ['pixtral'],
  deepseek: [],           // DeepSeek does not support vision via OpenAI compat API
  custom: [],             // unknown — allow it (user chose a custom endpoint)
  claude: [],             // Claude Code CLI does not support image input
};

// Returns true when the provider+model combination is expected to handle image_url.
// Returns false when we know it will fail, or the provider never does vision.
// Returns true for unknowns (openrouter, custom) to avoid false blocking.
function isVisionModel(providerId, model) {
  if (!model || !providerId) return false;
  if (providerId === 'claude') return false;
  // Qwen text models are not interchangeable with Qwen-VL models. In particular,
  // Groq's Qwen routes reject OpenAI-style image content arrays.
  if (/qwen/i.test(model)) {
    return /(?:qwen.*(?:\bvl\b|-vl)|vision|qwen\/qwen3\.[68]-27b)/i.test(model);
  }
  if (providerId === 'openrouter' || providerId === 'custom') return true; // optimistic
  if (providerId === 'pollinations') return true; // their gateway forwards to vision models
  const patterns = VISION_MODELS[providerId];
  if (!patterns) return false;
  // if empty list for a cloud provider, that provider never does vision
  if (patterns.length === 0) return false;
  const lc = model.toLowerCase();
  return patterns.some((p) => lc.includes(p));
}

module.exports = { isLocal, isVisionModel, VISION_MODELS, PROVIDERS, CLAUDE_MODES, models, warm, chat, openaiMessages, boundMessages, chatCompletionModels, classifyFailure, resetClaude, isChatSession, claudeMemory, restoreClaude };
