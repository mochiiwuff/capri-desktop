'use strict';

// Local HTTP bridge. Claude Code hooks POST their event JSON to /event,
// we hand it to the overlay. Bound to 127.0.0.1 only.

const http = require('node:http');

const MAX_BODY = 512 * 1024;
const BRAVE_EXTENSION_ORIGIN = 'chrome-extension://hbipfcmbibjaodaagpdkkkgahhdkldjj';

function isExtensionOrigin(origin) {
  return typeof origin === 'string' && (origin === BRAVE_EXTENSION_ORIGIN || origin.startsWith('chrome-extension://'));
}

function send(res, status, body, origin = null) {
  const json = JSON.stringify(body);
  const allowOrigin = isExtensionOrigin(origin) ? origin : null;
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(json),
    ...(allowOrigin && {
      'access-control-allow-origin': allowOrigin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-private-network': 'true',
      'vary': 'Origin',
    }),
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

function createBridge({ port, onEvent, onDebug, onBrowser }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    // Browsers always send an Origin header on cross-site requests; hooks never do.
    // The Capri extension may reach only its two browser-control endpoints.
    const origin = req.headers.origin;
    const browserRoute = ['/browser/health', '/browser/next', '/browser/result'].includes(url.pathname);
    if (origin && !(isExtensionOrigin(origin) && browserRoute)) return send(res, 403, { ok: false }, origin);

    if (onBrowser && req.method === 'OPTIONS' && browserRoute) {
      if (origin && !isExtensionOrigin(origin)) return send(res, 403, { ok: false }, origin);
      res.writeHead(204, {
        'access-control-allow-origin': origin || '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': req.headers['access-control-request-headers'] || 'content-type',
        'access-control-allow-private-network': 'true',
        'access-control-max-age': '600',
        'vary': 'Origin',
      });
      return res.end();
    }

    if (onBrowser && (!origin || isExtensionOrigin(origin)) && req.method === 'GET' && url.pathname === '/browser/next') {
      return send(res, 200, await onBrowser('next'), origin);
    }

    if (onBrowser && (!origin || isExtensionOrigin(origin)) && req.method === 'GET' && url.pathname === '/browser/health') {
      return send(res, 200, { ok: true, name: 'capri-browser' }, origin);
    }

    if (onBrowser && (!origin || isExtensionOrigin(origin)) && req.method === 'POST' && url.pathname === '/browser/result') {
      try {
        const body = await readJson(req);
        return send(res, 200, { ok: onBrowser('result', body) }, origin);
      } catch (err) {
        return send(res, 400, { ok: false, error: err.message }, origin);
      }
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, name: 'capri', pid: process.pid });
    }

    if (req.method === 'POST' && url.pathname === '/event') {
      try {
        const evt = await readJson(req);
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
