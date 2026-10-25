'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createInstaller, EVENTS, hookCommand } = require('../scripts/install-codex-hooks');

function fixture(t, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-codex-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'hooks.json');
  if (content !== undefined) fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return { dir, file, installer: createInstaller({ home: dir, command: 'node "C:/Capri/hooks/capri-codex-hook.js"' }) };
}

test('installs supported passive hooks, with bounded timeouts', (t) => {
  const { file, installer } = fixture(t);
  installer.install();
  const settings = JSON.parse(fs.readFileSync(file));
  assert.deepEqual(Object.keys(settings.hooks), EVENTS);
  assert.equal(settings.hooks.Interrupt[0].hooks[0].timeout, 2);
  assert.equal(settings.hooks.SessionEnd[0].hooks[0].async, undefined);
  assert.equal(settings.hooks.Stop[0].hooks[0].async, undefined);
  assert.equal(settings.hooks.UserPromptSubmit[0].hooks[0].async, undefined);
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].async, true);
  assert.equal(installer.status().installed, true);
});

test('preserves other handlers in the same group, backs up and is idempotent', (t) => {
  const other = { type: 'command', command: 'node other.js' };
  const original = { custom: true, hooks: { Stop: [{ matcher: '*', hooks: [other, { type: 'command', command: 'node capri-codex-hook.js' }] }] } };
  const { dir, file, installer } = fixture(t, original);
  installer.install();
  const after = fs.readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(after).hooks.Stop[0].hooks, [other]);
  assert.equal(fs.readdirSync(dir).filter((name) => name.includes('backup')).length, 1);
  installer.install();
  assert.equal(fs.readFileSync(file, 'utf8'), after);
  assert.equal(fs.readdirSync(dir).filter((name) => name.includes('backup')).length, 1);
  installer.uninstall();
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { custom: true, hooks: { Stop: [{ matcher: '*', hooks: [other] }] } });
  assert.equal(installer.status().installed, false);
});

test('does not touch missing files on uninstall or invalid files on install', (t) => {
  const missing = fixture(t);
  assert.equal(missing.installer.uninstall().removed, false);
  assert.equal(fs.existsSync(missing.file), false);
  for (const input of ['{bad', '[]', '{"hooks":[]}', '{"hooks":{"Stop":{}}}', '{"hooks":{"Stop":[{"hooks":"bad"}]}}']) {
    const { file, dir, installer } = fixture(t, input);
    assert.throws(() => installer.install());
    assert.equal(fs.readFileSync(file, 'utf8'), input);
    assert.deepEqual(fs.readdirSync(dir), ['hooks.json']);
  }
});

test('uses quoted absolute runtime paths on Windows and supports packaged Electron', () => {
  const command = hookCommand({ platform: 'win32', execPath: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\Capri Pet\\app.asar\\hooks\\capri-codex-hook.js', electron: false });
  const decode = (value) => Buffer.from(value.split(' ').at(-1), 'base64').toString('utf16le');
  assert.ok(decode(command).includes("'C:/Program Files/nodejs/node.exe'"));
  assert.ok(decode(command).includes('app.asar.unpacked/hooks/capri-codex-hook.js'));
  const packaged = hookCommand({ platform: 'win32', execPath: 'C:\\Capri Pet\\Capri.exe', script: 'C:\\Capri Pet\\app.asar\\hooks\\capri-codex-hook.js', electron: true });
  assert.ok(decode(packaged).includes('ELECTRON_RUN_AS_NODE'));
});

test('installed Windows command forwards stdin from PowerShell, including paths with spaces', { skip: process.platform !== 'win32' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri hook spaces '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, 'capri-codex-hook.js');
  fs.copyFileSync(path.resolve(__dirname, '../hooks/capri-codex-hook.js'), script);
  fs.copyFileSync(path.resolve(__dirname, '../hooks/capri-hook.js'), path.join(dir, 'capri-hook.js'));
  let received;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { received = JSON.parse(body); res.end('{}'); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const result = await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', hookCommand({ script })], {
      env: { ...process.env, CAPRI_PORT: String(server.address().port) }, windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stderr }));
    child.stdin.end(JSON.stringify({ hook_event_name: 'Stop', session_id: 'windows-spaces' }));
  });
  assert.deepEqual(result, { code: 0, stderr: '' });
  assert.equal(received?.session_id, 'windows-spaces');
});
