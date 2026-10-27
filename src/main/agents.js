'use strict';

// Your other Claude Code sessions (a terminal, IntelliJ's, VS Code's…), and handing one of them a task
// from her chat. Claude Code lists each running session in ~/.claude/sessions/<pid>.json (its folder,
// its name, busy or idle, its inbox socket) and takes a message on that socket as one from another
// session: it starts a turn with it, and still asks you before anything its permissions don't allow.
// Her own inbox, a socket like theirs, is the address on what she sends: their answers come back to it.

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');

const SEND_MS = 3000;
// how a session marks a message from another one, and reads who to answer
const ENVELOPE = /^<cross-session-message\b([^>]*)>\n?([\s\S]*?)\n?<\/cross-session-message>\s*$/;
const ASK_BACK = 'When you are done, send a short summary of the result back to the sender with SendMessage.';

let inboxPath = null; // her socket, once it's listening

const sessionsDir = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'sessions');

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
};

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // being written, or gone
  }
}

// The sessions you could hand a task to: [{ pid, sessionId, name, cwd, project, status }], the most recent first
function list({ skip = () => false } = {}) {
  let files = [];
  try {
    files = fs.readdirSync(sessionsDir()).filter((f) => /^\d+\.json$/.test(f));
  } catch {
    return [];
  }
  return files
    .map((f) => read(path.join(sessionsDir(), f)))
    .filter((s) => s && s.pid && s.messagingSocketPath && alive(s.pid) && !skip(s.sessionId))
    .sort((a, b) => (b.updatedAt || b.startedAt || 0) - (a.updatedAt || a.startedAt || 0))
    .map((s) => ({
      pid: s.pid,
      sessionId: s.sessionId,
      name: s.name || path.basename(s.cwd || '') || String(s.pid),
      cwd: s.cwd || '',
      project: path.basename(s.cwd || ''),
      status: s.status || 'idle',
    }));
}

const plain = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

// The sessions a name you typed means: its own name or its folder's, whole first, else the start of one
function find(wanted, opts) {
  const w = plain(wanted).replace(/^@/, '').trim();
  if (!w) return [];
  const sessions = list(opts);
  const whole = sessions.filter((s) => plain(s.name) === w || plain(s.project) === w);
  return whole.length ? whole : sessions.filter((s) => plain(s.name).startsWith(w) || plain(s.project).startsWith(w));
}

// Native Windows wants its key first (a named pipe); macOS and Linux take a message without one
function authLine(pid) {
  if (process.platform !== 'win32') return '';
  const key = fs.readdirSync(sessionsDir()).find((f) => f.startsWith(`${pid}.`) && f.endsWith('.key'));
  if (!key) return '';
  const token = fs.readFileSync(path.join(sessionsDir(), key), 'utf8').trim();
  return `${JSON.stringify({ type: 'auth', token })}\n`;
}

// Hands session pid the task: resolves once it's on its socket (its answer comes to her inbox later)
function send(pid, text) {
  const s = read(path.join(sessionsDir(), `${pid}.json`));
  if (!s?.messagingSocketPath || !alive(pid)) return Promise.reject(new Error('session gone'));
  const content = inboxPath
    ? `<cross-session-message from="uds:${inboxPath}" from-name="capri" from-mode="prompting">\n${text}\n\n${ASK_BACK}\n</cross-session-message>`
    : String(text);
  const line = `${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`;
  return new Promise((resolve, reject) => {
    const socket = net.connect(s.messagingSocketPath);
    const timer = setTimeout(() => socket.destroy(new Error('no answer from the session')), SEND_MS);
    socket.on('connect', () => socket.end(authLine(pid) + line));
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on('close', (failed) => {
      clearTimeout(timer);
      if (!failed) resolve();
    });
  });
}

// Her inbox: onMessage({ from, name, text }) for each message a session sends her (an answer to a task
// she handed it). Next to theirs, named like theirs (<pid>.sock): Claude Code only answers such an address.
// Not on Windows (named pipes, and a key of its own).
function inbox(onMessage) {
  if (process.platform === 'win32') return null;
  const theirs = list()[0]?.messagingSocketPath;
  const dir = theirs ? path.dirname(theirs) : path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), 'cc-socks');
  const file = path.join(dir, `${process.pid}.sock`);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.rmSync(file, { force: true });
  } catch {
    return null;
  }
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 2 * 1024 * 1024) socket.destroy();
    });
    socket.on('end', () => {
      for (const raw of buffer.split('\n')) {
        let msg = null;
        try {
          msg = JSON.parse(raw);
        } catch {
          continue;
        }
        const content = msg?.type === 'user' && msg.message?.content;
        if (typeof content !== 'string') continue;
        const [, attrs = '', body = content] = ENVELOPE.exec(content) || [];
        const name = /from-name="([^"]+)"/.exec(attrs)?.[1] || '';
        onMessage({ from: String(msg.from || /from="([^"]+)"/.exec(attrs)?.[1] || ''), name, text: body.trim() });
      }
    });
    socket.on('error', () => {});
  });
  server.on('error', (err) => console.error('[capri] inbox:', err.message));
  server.listen(file, () => {
    fs.chmodSync(file, 0o600);
    inboxPath = file;
  });
  const close = () => {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // gone already
    }
  };
  process.on('exit', close);
  return server;
}

// Busy or idle right now, or null once it's gone
function status(pid) {
  const s = read(path.join(sessionsDir(), `${pid}.json`));
  return s && alive(pid) ? s.status || 'idle' : null;
}

// fn() whenever a session starts, ends or changes (for her menu)
function watch(fn) {
  let timer = null;
  try {
    fs.mkdirSync(sessionsDir(), { recursive: true });
    return fs.watch(sessionsDir(), () => {
      clearTimeout(timer);
      timer = setTimeout(fn, 500);
    });
  } catch {
    return null;
  }
}

module.exports = { list, find, send, status, watch, inbox };
