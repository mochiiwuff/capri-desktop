#!/usr/bin/env node
'use strict';

// Requires an X11 display (real, Xorg dummy or xvfb-run). No model, credentials,
// hook installation or external service is needed. Keep this outside tests/*.test.js
// so npm test also works on machines without a graphical session.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '..');

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  return port;
}

async function main() {
  assert.equal(process.platform, 'linux', 'this smoke test currently targets Linux');
  assert.ok(process.env.DISPLAY, 'an X11 display is required; use xvfb-run -a npm run test:smoke');
  const electron = require('electron');
  const port = await availablePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-smoke-'));
  const log = [];
  let exited = false;
  let spawnError;
  // XDG_CONFIG_HOME isolates Electron userData. An explicit Chromium profile also
  // prevents the single-instance lock from attaching to a running user instance.
  const child = spawn(electron, [ROOT, '--dev', `--user-data-dir=${path.join(profile, 'chromium')}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], {
    cwd: ROOT,
    env: { ...process.env, CAPRI_PORT: String(port), XDG_CONFIG_HOME: profile,
      XDG_CACHE_HOME: path.join(profile, 'cache'), HYPRLAND_INSTANCE_SIGNATURE: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.on('error', (err) => { spawnError = err; });
  child.on('exit', () => { exited = true; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      log.push(String(chunk));
      if (log.length > 200) log.shift();
    });
  }

  async function request(route, body) {
    const response = await fetch(`http://127.0.0.1:${port}/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(response.status, 200, `${route} should respond successfully`);
    const result = await response.json();
    assert.equal(result.ok, true, `${route} should succeed: ${JSON.stringify(result)}`);
    return result;
  }

  async function evaluate(js) {
    return (await request('debug/eval', { js })).value;
  }

  async function waitFor(check, description) {
    const deadline = Date.now() + 30000;
    let lastError;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      assert.equal(exited, false, `Electron exited before ${description}`);
      assert.doesNotMatch(log.join(''), /\[capri\] boot failed|\[capri\] renderer gone/);
      try {
        const value = await check();
        if (value) return value;
      } catch (err) { lastError = err; }
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
  }

  try {
    const health = await waitFor(async () => {
      const result = await request('health');
      return result.pid === child.pid && result;
    }, 'the child process HTTP bridge');
    assert.equal(health.name, 'capri');

    const renderer = await waitFor(() => evaluate(`(() => {
      const d = window.dev;
      const gl = d?.capri?.sprite?.gl;
      const canvas = document.querySelector('#sprite');
      return d?.brain && d.panel && gl && !gl.isContextLost()
        && canvas.width > 0 && canvas.height > 0 && d.capri.lastDraw > 0
        && { assistant: d.brain.assistant, width: canvas.width, height: canvas.height };
    })()`), 'an initialized renderer with a drawn WebGL frame');

    const menu = await request('debug/menu');
    assert.ok(Array.isArray(menu.value) && menu.value.length > 0, 'the application menu is populated');

    const session = `${renderer.assistant === 'claude' ? '' : `${renderer.assistant}:`}smoke-test`;
    await request('event', {
      hook_event_name: 'PreToolUse', session_id: session, cwd: ROOT,
      tool_name: 'Bash', tool_input: { command: 'npm test' },
    });
    await waitFor(() => evaluate(`window.dev.brain.sessions.get(${JSON.stringify(session)})?.count === 1`),
      'the hook event to reach the renderer Brain');
    await request('event', { hook_event_name: 'SessionEnd', session_id: session });
    await waitFor(() => evaluate(`!window.dev.brain.sessions.has(${JSON.stringify(session)})`),
      'the completed session to be removed');
    assert.equal(exited, false);
    assert.doesNotMatch(log.join(''), /\[capri\] boot failed|\[capri\] renderer gone/);
    console.log(`Smoke test passed: Electron, WebGL (${renderer.width}×${renderer.height}), menu and hook delivery.`);
  } catch (err) {
    console.error(log.join(''));
    throw err;
  } finally {
    // Stop only the instance created by this test, and remove only its own profile.
    if (!exited) child.kill();
    const timer = setTimeout(() => { if (!exited) child.kill('SIGKILL'); }, 3000);
    try { await closed; } finally { clearTimeout(timer); }
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
