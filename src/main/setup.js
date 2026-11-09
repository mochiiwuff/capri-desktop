'use strict';

// Setting her up with buttons, so nobody has to type in a terminal: Ollama (installed with winget,
// woken up, a model fetched with its progress), an API key pasted in her panel (kept encrypted with
// your Windows account), and Claude Code or Codex run through Ollama in a window of their own.
// Windows; elsewhere the buttons open the right pages instead.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { safeStorage } = require('electron');
const ollama = require('./ollama');

const WIN = process.platform === 'win32';

// The models she offers for her chat, with what they weigh (as Ollama lists them)
const MODELS = [
  { name: 'gemma3:4b', bytes: 3.3e9 }, // better in languages other than English
  { name: 'llama3.2', bytes: 2.0e9 },  // lighter
];

// Where to get a key, by provider (llm.js)
const KEY_PAGES = {
  groq: 'https://console.groq.com/keys',
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
  openai: 'https://platform.openai.com/api-keys',
  mistral: 'https://console.mistral.ai/api-keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
};

function which(cmd) {
  return new Promise((resolve) => {
    execFile(WIN ? 'where.exe' : 'which', [cmd], { windowsHide: true, timeout: 5000 }, (err, out) => (
      resolve(err ? null : String(out).split(/\r?\n/)[0].trim() || null)));
  });
}

// Ollama's own app (it runs the server from the tray) and its command, where its installer puts them
function ollamaFiles() {
  const dir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Ollama');
  return { app: path.join(dir, 'ollama app.exe'), cli: path.join(dir, 'ollama.exe') };
}

// { running, installed, models, winget }: how far along Ollama is on this PC
async function ollamaState() {
  const models = await ollama.models().catch(() => null);
  if (models) return { running: true, installed: true, models, winget: false };
  const [onPath, winget] = await Promise.all([which('ollama'), WIN ? which('winget') : null]);
  return { running: false, installed: fs.existsSync(ollamaFiles().cli) || Boolean(onPath), models: null, winget: Boolean(winget) };
}

// Installs Ollama with winget (Windows' own package manager); onLine(text) for what it prints.
function installOllama(onLine) {
  return new Promise((resolve) => {
    const child = spawn('winget', [
      'install', '--id', 'Ollama.Ollama', '--exact', '--silent',
      '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity',
    ], { windowsHide: true });
    // its progress bars redraw with \r: the last state of each line is enough
    const read = (chunk) => String(chunk).split(/[\r\n]+/).map((l) => l.trim()).filter((l) => /[a-z]{3}/i.test(l)).forEach((l) => onLine?.(l));
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('close', (code) => resolve({ ok: code === 0, code }));
  });
}

// Wakes Ollama up (its app, else `ollama serve` in the background) and waits for it to answer.
async function startOllama() {
  const { app, cli } = ollamaFiles();
  const run = (file, args) => spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
  if (fs.existsSync(app)) run(app, []);
  else run(fs.existsSync(cli) ? cli : 'ollama', ['serve']);
  for (let i = 0; i < 40; i++) {
    if (await ollama.models().catch(() => null)) return { ok: true };
    await new Promise((r) => setTimeout(r, 750));
  }
  return { ok: false, error: 'Ollama did not answer' };
}

// Fetches a model. Ollama sends its pieces one after the other: onProgress({ completed, total })
// adds them up, so the bar goes once from empty to full.
async function pullModel(name, onProgress, signal) {
  const res = await fetch(`${ollama.base()}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: name, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  const pieces = new Map(); // digest -> { completed, total }
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(msg.error);
      if (msg.digest && msg.total) pieces.set(msg.digest, { completed: msg.completed || 0, total: msg.total });
      let completed = 0;
      let total = 0;
      for (const p of pieces.values()) {
        completed += p.completed;
        total += p.total;
      }
      onProgress?.({ completed, total, status: msg.status });
      if (msg.status === 'success') return;
    }
  }
}

// Claude Code (or Codex) through Ollama, in a window of its own: Ollama fetches what's missing and
// asks which model to use. She sees it like any other session, through her hooks.
function launchThroughOllama(integration) {
  if (!WIN || !['claude', 'codex'].includes(integration)) return { ok: false };
  const { cli } = ollamaFiles();
  // `start` opens a new console window (its first quoted argument is the window's title); cmd /k
  // strips the outer quotes of what follows, so a path with spaces in it keeps its own
  const command = `""${fs.existsSync(cli) ? cli : 'ollama'}" launch ${integration}"`;
  spawn('cmd.exe', ['/d', '/c', 'start', '"Capri"', 'cmd.exe', '/k', command], {
    detached: true, stdio: 'ignore', windowsVerbatimArguments: true,
  }).on('error', () => {}).unref();
  return { ok: true };
}

// API keys are kept encrypted in config.json, with your Windows account (DPAPI): "enc:<base64>".
function sealKey(key) {
  return safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(key).toString('base64')}` : key;
}

function openKey(stored) {
  if (typeof stored !== 'string' || !stored.startsWith('enc:')) return stored || '';
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
  } catch {
    return '';
  }
}

const openKeys = (apiKeys = {}) => Object.fromEntries(Object.entries(apiKeys).map(([id, v]) => [id, openKey(v)]));

module.exports = {
  MODELS, KEY_PAGES, ollamaState, installOllama, startOllama, pullModel, launchThroughOllama, sealKey, openKeys,
};
