'use strict';

// The one tool her chat's Claude Code gets from her (llm.js runs it as an MCP server, over stdio):
// handing a task to one of your other Claude Code sessions. It can't message them itself (gone once it
// has answered, nothing could answer it back): this passes the task to her (main.js, /handoff), and
// she offers it to you with a button, sends it from her own inbox, and brings the answer back to you.

const http = require('node:http');
const readline = require('node:readline');

const PORT = Number(process.env.CAPRI_PORT) || 47823;

const TOOL = {
  name: 'hand_off_task',
  description: 'Hand a task to another of the user\'s Claude Code sessions (one from the list in your instructions). '
    + 'The user confirms it with a button, then the session gets it and its answer comes back to Capri later.',
  inputSchema: {
    type: 'object',
    properties: {
      session: { type: 'string', description: 'The session\'s exact name from the list' },
      task: { type: 'string', description: 'What to tell that session, written for it' },
    },
    required: ['session', 'task'],
  },
};

function toCapri(body) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: '/handoff', method: 'POST', timeout: 5000,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) },
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error(`Capri answered ${res.statusCode}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Capri did not answer')));
    req.on('error', reject);
    req.end(json);
  });
}

async function call(name, args = {}) {
  if (name !== TOOL.name) throw new Error(`no tool ${name}`);
  const res = await toCapri({ session: String(args.session || ''), task: String(args.task || '') });
  if (!res.ok) return { content: [{ type: 'text', text: `Not handed off: ${res.error}` }], isError: true };
  return { content: [{ type: 'text', text: `Capri is asking the user to confirm sending it to ${res.name}. Its answer will come back to her later: tell the user in a few words that you passed it on.` }] };
}

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined) return; // a notification (initialized, cancelled…): nothing to answer
  try {
    let result;
    if (msg.method === 'initialize') {
      result = { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'capri', version: '1' } };
    } else if (msg.method === 'tools/list') {
      result = { tools: [TOOL] };
    } else if (msg.method === 'tools/call') {
      result = await call(msg.params?.name, msg.params?.arguments);
    } else if (msg.method === 'ping') {
      result = {};
    } else {
      send({ id: msg.id, error: { code: -32601, message: `no method ${msg.method}` } });
      return;
    }
    send({ id: msg.id, result });
  } catch (err) {
    send({ id: msg.id, error: { code: -32000, message: err.message } });
  }
});
