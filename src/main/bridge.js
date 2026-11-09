'use strict';

// Local HTTP bridge. Claude Code hooks POST their event JSON to /event,
// we hand it to the overlay. Bound to 127.0.0.1 only.

const http = require('node:http');

const MAX_BODY = 512 * 1024;

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function unwrapHookEvent(evt) {
  if (!evt || typeof evt !== 'object') return null;
  if (typeof evt.hook_event_name === 'string') return evt;

  const nested = ['event', 'data', 'payload', 'result', 'body', 'content', 'message']
    .map((key) => evt[key])
    .find((value) => value && typeof value === 'object');
  if (nested) {
    const found = unwrapHookEvent(nested);
    if (found) return found;
  }

  if (typeof evt.type === 'string' && /^(SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|PostToolUseFailure|Notification|Stop|StopFailure|Interrupt|SubagentStart|SubagentStop|PreCompact|SessionEnd)$/.test(evt.type)) {
    return { ...evt, hook_event_name: evt.type };
  }
  return null;
}

function normalizeHookEvent(evt) {
  const out = unwrapHookEvent(evt);
  if (!out) return null;
  if (out.last_assistant_message === undefined) {
    const value = (() => {
      if (typeof out.last_assistant_message === 'string') return out.last_assistant_message;
      const walk = (node) => {
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) {
          for (const item of node) {
            const text = walk(item);
            if (text) return text;
          }
          return '';
        }
        if (node && typeof node === 'object') {
          for (const key of ['text', 'message', 'content', 'output', 'response', 'assistant_message', 'last_assistant_message']) {
            const text = walk(node[key]);
            if (text) return text;
          }
        }
        return '';
      };
      return walk(out);
    })();
    if (value) out.last_assistant_message = value;
  }
  return out;
}

function createBridge({ port, onEvent, onDebug }) {
  const server = http.createServer(async (req, res) => {
    // Browsers always send an Origin header on cross-site requests; hooks never do.
    // Refusing those keeps random web pages from puppeting Capri.
    if (req.headers.origin) return send(res, 403, { ok: false });

    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, name: 'capri', pid: process.pid });
    }

    if (req.method === 'POST' && url.pathname === '/event') {
      try {
        const evt = normalizeHookEvent(await readJson(req));
        if (!evt || typeof evt !== 'object' || typeof evt.hook_event_name !== 'string') {
          return send(res, 400, { ok: false, error: 'missing hook_event_name' });
        }
        onEvent(evt);
        return send(res, 200, { ok: true });
      } catch (err) {
        return send(res, 400, { ok: false, error: err.message });
      }
    }

    if (onDebug && url.pathname.startsWith('/debug/')) {
      try {
        const body = req.method === 'POST' ? await readJson(req).catch(() => ({})) : {};
        return send(res, 200, await onDebug(url.pathname.slice(7), body));
      } catch (err) {
        return send(res, 500, { ok: false, error: err.message });
      }
    }

    send(res, 404, { ok: false });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[capri] port ${port} already in use, Claude events will not reach this instance`);
    } else {
      console.error('[capri] bridge error:', err.message);
    }
  });

  server.listen(port, '127.0.0.1', () => console.log(`[capri] listening on 127.0.0.1:${port}`));
  return server;
}

module.exports = { createBridge };
