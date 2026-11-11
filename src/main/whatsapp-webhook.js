'use strict';

const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const {
  extractWhatsAppMessages,
  isAuthorized,
  parseCommand,
  verifyWhatsAppSignature,
} = require('./messaging');

const MAX_BODY_BYTES = 256 * 1024;

function secretMatches(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readRawBody(request, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit && !settled) {
        settled = true;
        chunks.length = 0;
        reject(new RangeError('Webhook payload exceeds the size limit'));
        return;
      }
      if (!settled) chunks.push(chunk);
    });
    request.on('end', () => {
      if (!settled) resolve(Buffer.concat(chunks));
    });
    request.on('error', (error) => {
      if (!settled) reject(error);
    });
  });
}

function createWhatsAppWebhookServer({
  port = 47824,
  host = '127.0.0.1',
  verifyToken,
  appSecret,
  authorizedSenders = [],
  onCommand,
  sendReply,
  serverFactory = http.createServer,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('Invalid webhook port');
  if (host !== '127.0.0.1' && host !== '::1') throw new TypeError('WhatsApp webhook must bind to loopback');
  if (typeof verifyToken !== 'string' || !verifyToken) throw new TypeError('WhatsApp verification token is required');
  if (typeof appSecret !== 'string' || !appSecret) throw new TypeError('WhatsApp app secret is required');
  if (typeof onCommand !== 'function' || typeof sendReply !== 'function') throw new TypeError('WhatsApp handlers are required');

  const allowedSenders = [...new Set(authorizedSenders.map((value) => String(value).replace(/\D/g, '')).filter((value) => /^\d{8,15}$/.test(value)))];
  if (!allowedSenders.length) throw new TypeError('Authorized WhatsApp senders are required');

  const server = serverFactory(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/webhook') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode !== 'subscribe' || !secretMatches(token, verifyToken) || !challenge || challenge.length > 256) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(challenge);
      return;
    }

    if (request.method !== 'POST' || url.pathname !== '/webhook') {
      response.writeHead(404);
      response.end();
      return;
    }

    let rawBody;
    try {
      rawBody = await readRawBody(request);
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(error instanceof RangeError ? 413 : 400);
        response.end();
      }
      return;
    }
    if (!verifyWhatsAppSignature(rawBody, request.headers['x-hub-signature-256'], appSecret)) {
      response.writeHead(401);
      response.end('Invalid signature');
      return;
    }
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      response.writeHead(400);
      response.end('Invalid JSON');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');

    for (const message of extractWhatsAppMessages(payload)) {
      if (!isAuthorized(message.from, allowedSenders)) continue;
      const command = parseCommand(message.text);
      if (!command) continue;
      Promise.resolve(onCommand({ platform: 'whatsapp', command, sender: message.from }, (text) => sendReply(message.from, text)))
        .catch((error) => console.error('[capri] WhatsApp command failed:', error.message));
    }
  });

  server.on('error', (error) => console.error('[capri] WhatsApp webhook server error:', error.message));

  return {
    listen() {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server.removeListener('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          resolve(server.address());
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close((error) => error ? reject(error) : resolve());
      });
    },
    get listening() { return server.listening; },
  };
}

module.exports = { createWhatsAppWebhookServer, secretMatches };
