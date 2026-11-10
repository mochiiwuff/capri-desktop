'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { createRemoteControl, isLoopback, isTailnetAuthority } = require('../src/main/remote-control');

async function start(t, options = {}) {
  const calls = [];
  const remote = createRemoteControl({
    staticDir: path.join(__dirname, '../src/renderer/remote'),
    getState: async () => ({
      status: { learningEnabled: true },
      memory: { facts: [], apps: [], routines: [] },
    }),
    control: async (action) => {
      calls.push(action);
      return action === 'screen.resume' ? { ok: false, error: 'screen permission must first be granted at the desktop' } : { ok: true };
    },
    ...options,
  });
  if (!remote.server.listening) await once(remote.server, 'listening');
  t.after(() => remote.close());
  return { remote, calls, port: remote.server.address().port };
}

function rawGet(port, headers = {}, route = '/api/state') {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: route,
      headers,
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

test('remote dashboard binds to loopback and serves static assets with restrictive headers', async (t) => {
  const { remote, port } = await start(t);
  assert.equal(remote.server.address().address, '127.0.0.1');
  assert.match(remote.url, new RegExp(`#token=${remote.token}$`));

  const response = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /LEARNED MEMORY/);
});

test('remote state and memory APIs require bearer authentication and reject hostile origins/hosts', async (t) => {
  const { remote, port } = await start(t);
  const base = `http://127.0.0.1:${port}`;

  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  assert.equal((await fetch(`${base}/api/memory`, {
    headers: { authorization: 'Bearer ' + remote.token },
  })).status, 200);
  assert.equal(await rawGet(port, {
    authorization: 'Bearer ' + remote.token,
    host: `attacker.test:${port}`,
  }), 421);
  assert.equal((await fetch(`${base}/api/state`, {
    headers: { authorization: 'Bearer ' + remote.token, origin: 'https://attacker.test' },
  })).status, 403);
});

test('remote API accepts only matching HTTPS Tailscale proxy hosts', async (t) => {
  const { remote, port } = await start(t);
  const host = 'desktop.example.ts.net';
  const origin = `https://${host}`;

  assert.equal(await rawGet(port, { host, origin }), 401);
  assert.equal(await rawGet(port, {
    host,
    origin,
    authorization: 'Bearer ' + remote.token,
  }), 200);
  assert.equal(await rawGet(port, {
    origin,
    authorization: 'Bearer ' + remote.token,
  }), 200);
  assert.equal(await rawGet(port, {
    host,
    origin: `http://${host}`,
    authorization: 'Bearer ' + remote.token,
  }), 403);
  assert.equal(await rawGet(port, {
    host: 'desktop.example.ts.net.attacker.com',
    origin: 'https://desktop.example.ts.net.attacker.com',
    authorization: 'Bearer ' + remote.token,
  }), 421);
  assert.equal(await rawGet(port, {
    origin: 'https://attacker.example.com',
    authorization: 'Bearer ' + remote.token,
  }), 403);
});

test('remote controls whitelist actions and surface unavailable actions', async (t) => {
  const { remote, calls, port } = await start(t);
  const headers = { authorization: 'Bearer ' + remote.token, 'content-type': 'application/json' };
  const base = `http://127.0.0.1:${port}`;

  const accepted = await fetch(`${base}/api/control`, {
    method: 'POST', headers, body: JSON.stringify({ action: 'learning.pause' }),
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(calls, ['learning.pause']);

  const invalid = await fetch(`${base}/api/control`, {
    method: 'POST', headers, body: JSON.stringify({ action: 'files.delete' }),
  });
  assert.equal(invalid.status, 400);

  const notGranted = await fetch(`${base}/api/control`, {
    method: 'POST', headers, body: JSON.stringify({ action: 'screen.resume' }),
  });
  assert.equal(notGranted.status, 409);
  assert.match((await notGranted.json()).error, /granted at the desktop/);
  assert.equal(await rawGet(port, {}, '/api/notifications'), 401);
  const notifications = await fetch(`${base}/api/notifications`, { headers });
  assert.equal(notifications.status, 200);
  assert.deepEqual((await notifications.json()).notifications.map(({ action }) => action), ['learning.pause']);
});

test('reports require authentication and return an aggregate without raw conversation facts', async (t) => {
  const facts = [{ category: 'private', text: 'do not include in report', confidence: 1 }];
  const apps = Array.from({ length: 7 }, (_, index) => ({ label: `App ${index}`, duration: `${index} min` }));
  const { remote, port } = await start(t, {
    getState: async () => ({
      status: { learningEnabled: true, assistant: 'Capri' },
      memory: { facts, apps, routines: [{ routine: 'work', count: 4 }] },
    }),
  });
  assert.equal(await rawGet(port, {}, '/api/report'), 401);
  const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
    headers: { authorization: 'Bearer ' + remote.token },
  });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.memory.factCount, 1);
  assert.equal(report.memory.appCount, 7);
  assert.equal(report.memory.routineCount, 1);
  assert.equal(report.memory.topApps.length, 5);
  assert.equal(JSON.stringify(report).includes('do not include in report'), false);
  assert.equal(report.status.assistant, 'Capri');
});

test('loopback address guard accepts local IPv4 and IPv6 only', () => {
  assert.equal(isLoopback('127.0.0.1'), true);
  assert.equal(isLoopback('::1'), true);
  assert.equal(isLoopback('::ffff:127.0.0.1'), true);
  assert.equal(isLoopback('192.168.1.10'), false);
});

test('Tailscale authority guard accepts only subdomains of ts.net', () => {
  assert.equal(isTailnetAuthority('desktop.tailnet.ts.net'), true);
  assert.equal(isTailnetAuthority('ts.net'), false);
  assert.equal(isTailnetAuthority('desktop.ts.net.attacker.com'), false);
});

test('remote API reports internal state errors without an unhandled request rejection', async (t) => {
  const { remote, port } = await start(t, {
    getState: async () => { throw new Error('test failure'); },
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/state`, {
    headers: { authorization: 'Bearer ' + remote.token },
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: 'internal error' });
});
