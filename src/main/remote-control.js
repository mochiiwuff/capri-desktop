'use strict';

const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');

const MAX_BODY = 8 * 1024;
const MAX_NOTIFICATIONS = 50;
const FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/remote.js', ['remote.js', 'text/javascript; charset=utf-8']],
  ['/remote.css', ['remote.css', 'text/css; charset=utf-8']],
]);
const ACTIONS = new Set([
  'privacy.pause', 'privacy.resume',
  'learning.pause', 'learning.resume',
  'activity.pause', 'activity.resume',
  'screen.pause', 'screen.resume', 'screen.revoke',
]);

function send(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function isTailnetAuthority(authority) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/i.test(authority);
}

function isTailnetOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:'
      && !url.port
      && !url.username
      && !url.password
      && isTailnetAuthority(url.hostname)
      && url.origin === origin;
  } catch {
    return false;
  }
}

function createRemoteControl({ getState, control, staticDir, port = 0 }) {
  const token = randomBytes(32).toString('base64url');
  const notifications = [];
  let server;

  const isAuthorized = (req) => safeEqual(req.headers.authorization, `Bearer ${token}`);

  const handleRequest = async (req, res) => {
    try {
      if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, { ok: false });

      const authority = (req.headers.host || '').toLowerCase();
      const boundPort = server.address()?.port;
      const localAuthority = authority === `127.0.0.1:${boundPort}`
        || authority === `localhost:${boundPort}`
        || authority === `[::1]:${boundPort}`;
      const tailnetAuthority = isTailnetAuthority(authority);
      if (!localAuthority && !tailnetAuthority) return send(res, 421, { ok: false });

      const url = new URL(req.url, `http://${authority}`);
      const staticFile = FILES.get(url.pathname);
      if (req.method === 'GET' && staticFile) {
        try {
          const body = await fs.readFile(path.join(staticDir, staticFile[0]));
          res.writeHead(200, {
            'content-type': staticFile[1],
            'content-length': body.length,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
            'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          });
          return res.end(body);
        } catch (err) {
          console.error('[capri] remote control page could not be read:', err.message);
          return send(res, 500, { ok: false, error: 'page unavailable' });
        }
      }

      if (req.headers.origin) {
        const expectedOrigin = localAuthority
          ? req.headers.origin === `http://${authority}` || isTailnetOrigin(req.headers.origin)
          : req.headers.origin === `https://${authority}`;
        if (!expectedOrigin) return send(res, 403, { ok: false });
      }

      if (req.method === 'GET' && ['/api/state', '/api/memory', '/api/report'].includes(url.pathname)) {
        if (!isAuthorized(req)) return send(res, 401, { ok: false });
        const state = await getState();
        if (url.pathname === '/api/state') return send(res, 200, state.status);
        if (url.pathname === '/api/memory') return send(res, 200, state.memory);
        return send(res, 200, {
          generatedAt: new Date().toISOString(),
          status: state.status,
          memory: {
            factCount: state.memory.facts.length,
            appCount: state.memory.apps.length,
            routineCount: state.memory.routines.length,
            topApps: state.memory.apps.slice(0, 5),
            routines: state.memory.routines,
          },
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/notifications') {
        if (!isAuthorized(req)) return send(res, 401, { ok: false });
        return send(res, 200, { notifications: notifications.slice(-20).reverse() });
      }
      if (req.method === 'POST' && url.pathname === '/api/control') {
        if (!isAuthorized(req)) return send(res, 401, { ok: false });
        let body;
        try {
          body = await readJson(req);
        } catch (err) {
          if (req.destroyed) return;
          return send(res, 400, { ok: false, error: err.message });
        }
        if (!ACTIONS.has(body?.action)) return send(res, 400, { ok: false, error: 'unsupported action' });
        const result = await control(body.action);
        if (!result?.ok) return send(res, 409, { ok: false, error: result?.error || 'control unavailable' });
        notifications.push({ id: randomBytes(8).toString('hex'), action: body.action, createdAt: new Date().toISOString() });
        if (notifications.length > MAX_NOTIFICATIONS) notifications.shift();
        return send(res, 200, { ok: true, state: (await getState()).status });
      }
      return send(res, 404, { ok: false });
    } catch (err) {
      if (req.destroyed) return;
      console.error('[capri] remote control request failed:', err.message);
      if (res.headersSent) return res.destroy();
      return send(res, 500, { ok: false, error: 'internal error' });
    }
  };
  server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[capri] remote control request failed:', err.message);
      if (!res.headersSent) send(res, 500, { ok: false, error: 'internal error' });
      else res.destroy();
    });
  });

  server.on('error', (err) => console.error('[capri] remote control server:', err.message));
  server.listen(port, '127.0.0.1');
  return {
    server,
    token,
    get url() {
      const address = server.address();
      return address ? `http://127.0.0.1:${address.port}/#token=${token}` : null;
    },
    close() {
      return new Promise((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close((err) => err ? reject(err) : resolve());
      });
    },
  };
}

module.exports = { createRemoteControl, isLoopback, isTailnetAuthority };
