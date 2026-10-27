'use strict';

// A few questions for the X server on Linux, over one connection of its own speaking the X protocol
// (no native module):
// - where the pointer is: Electron's screen.getCursorScreenPoint() there only follows it while it's
//   over one of our windows, and her click-through window never has it, so it keeps answering with
//   the last spot it saw;
// - which window has the keyboard, and giving it back: her chat takes it while it's open, and
//   blur() alone leaves it with her once it's closed;
// - the apps' windows, and closing one (apps.js);
// - where the windows are, for her to sit on them (windows.js).

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const pad = (n) => (4 - (n % 4)) % 4;

// The MIT-MAGIC-COOKIE-1 for this display from the Xauthority file, if there is one.
function cookie(number) {
  const file = process.env.XAUTHORITY || path.join(os.homedir(), '.Xauthority');
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  let at = 0;
  const field = () => {
    const len = buf.readUInt16BE(at);
    const value = buf.subarray(at + 2, at + 2 + len);
    at += 2 + len;
    return value;
  };
  while (at + 2 <= buf.length) {
    at += 2; // family
    field(); // address
    const num = field().toString();
    const name = field().toString();
    const data = field();
    if (name === 'MIT-MAGIC-COOKIE-1' && (num === '' || num === number)) return data;
  }
  return null;
}

// { root, request(opcode, byte, body, reply), closed }: request() resolves with the reply (or null on an
// error), or right away for a request that has none.
function connect() {
  const m = /^([^:]*):(\d+)/.exec(process.env.DISPLAY || '');
  if (!m) return Promise.reject(new Error('no X display'));
  const [, host, number] = m;
  const socket = host && host !== 'unix' ? net.connect(6000 + Number(number), host) : net.connect(`/tmp/.X11-unix/X${number}`);
  const auth = cookie(number);
  const name = Buffer.from(auth ? 'MIT-MAGIC-COOKIE-1' : '');
  const data = auth || Buffer.alloc(0);
  const setup = Buffer.alloc(12 + name.length + pad(name.length) + data.length + pad(data.length));
  setup.write('l', 0); // little-endian
  setup.writeUInt16LE(11, 2);
  setup.writeUInt16LE(name.length, 6);
  setup.writeUInt16LE(data.length, 8);
  name.copy(setup, 12);
  data.copy(setup, 12 + name.length + pad(name.length));

  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let root = 0;
    let seq = 0;
    const waiting = new Map(); // by sequence number
    const api = { root: 0, request, closed: false };
    const fail = (err) => {
      api.closed = true;
      reject(err);
      for (const done of waiting.values()) done(null);
      waiting.clear();
    };
    socket.on('error', fail);
    socket.on('close', () => fail(new Error('X connection closed')));
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!root) {
        if (buf.length < 8) return;
        const size = 8 + buf.readUInt16LE(6) * 4;
        if (buf.length < size) return;
        if (buf[0] !== 1) return socket.destroy(new Error('X server refused the connection'));
        const vendor = buf.readUInt16LE(24);
        const formats = buf[29];
        root = buf.readUInt32LE(40 + vendor + pad(vendor) + formats * 8); // the first screen's root window
        buf = buf.subarray(size);
        api.root = root;
        resolve(api);
      }
      // errors and events are 32 bytes, replies 32 and more; no events are asked for
      while (buf.length >= 32) {
        const size = buf[0] === 1 ? 32 + buf.readUInt32LE(4) * 4 : 32;
        if (buf.length < size) return;
        const msg = buf.subarray(0, size);
        buf = buf.subarray(size);
        if (msg[0] > 1) continue;
        const done = waiting.get(msg.readUInt16LE(2));
        waiting.delete(msg.readUInt16LE(2));
        done?.(msg[0] === 1 ? msg : null);
      }
    });
    socket.write(setup);

    function request(opcode, byte, body, reply) {
      const req = Buffer.alloc(4 + body.length + pad(body.length));
      req[0] = opcode;
      req[1] = byte;
      req.writeUInt16LE(req.length / 4, 2);
      body.copy(req, 4);
      if (api.closed) return Promise.resolve(null);
      seq = (seq + 1) & 0xffff;
      socket.write(req);
      if (!reply) return Promise.resolve(null);
      return new Promise((done) => waiting.set(seq, done));
    }
  });
}

let conn = null;
let retryAt = 0;
async function x(ask) {
  if (!conn && Date.now() < retryAt) return null;
  conn ??= connect().catch(() => null);
  const c = await conn;
  const answer = c && (await ask(c));
  if (!c || c.closed) {
    conn = null; // again in a while (the X server restarted, say, or there's none: Wayland)
    retryAt = Date.now() + 5000;
  }
  return answer;
}

const u32 = (...values) => {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => b.writeUInt32LE(v, i * 4));
  return b;
};

// An atom by name, kept for the connection.
async function atom(c, name) {
  c.atoms ??= new Map();
  if (!c.atoms.has(name)) {
    const bytes = Buffer.from(name);
    const body = Buffer.alloc(4 + bytes.length);
    body.writeUInt16LE(bytes.length, 0);
    bytes.copy(body, 4);
    const reply = await c.request(16, 0, body, true); // InternAtom
    c.atoms.set(name, reply ? reply.readUInt32LE(8) : 0);
  }
  return c.atoms.get(name);
}

// A window's property, of any type: its 32-bit values as numbers, or its 8-bit ones as a Buffer;
// null when it has none.
async function property(c, win, name, longs = 1024) {
  const reply = await c.request(20, 0, u32(win, await atom(c, name), 0, 0, longs), true); // GetProperty
  if (!reply || !reply.readUInt32LE(8)) return null;
  const format = reply[1];
  const count = reply.readUInt32LE(16);
  const data = reply.subarray(32, 32 + count * (format / 8));
  return format === 32 ? Array.from({ length: count }, (_, i) => data.readUInt32LE(i * 4)) : data;
}

// A message to the window manager about `win`, as a pager would send it (source 2: no
// focus-stealing check).
async function tellWm(c, win, name, values) {
  const event = Buffer.alloc(32);
  event[0] = 33; // ClientMessage
  event[1] = 32; // format
  event.writeUInt32LE(win, 4);
  event.writeUInt32LE(await atom(c, name), 8);
  u32(...values).copy(event, 12);
  const mask = (1 << 19) | (1 << 20); // SubstructureNotify | SubstructureRedirect
  await c.request(25, 0, Buffer.concat([u32(c.root, mask), event]), false); // SendEvent
}

// The pointer on the root window, in physical pixels, or null if X can't be reached.
function cursorPoint() {
  return x(async (c) => {
    const reply = await c.request(38, 0, u32(c.root), true); // QueryPointer
    return reply && { x: reply.readInt16LE(16), y: reply.readInt16LE(18) };
  });
}

// The window the window manager has active (its id), or null.
function activeWindow() {
  return x(async (c) => (await property(c, c.root, '_NET_ACTIVE_WINDOW', 1))?.[0] || null);
}

// Ask the window manager to make that window active again.
function activateWindow(id) {
  return x((c) => id && tellWm(c, id, '_NET_ACTIVE_WINDOW', [2, 0, 0]));
}

// The windows a taskbar would show: [{ id, pid, wmClass }]
function appWindows() {
  return x(async (c) => {
    const ids = (await property(c, c.root, '_NET_CLIENT_LIST')) || [];
    const skip = await atom(c, '_NET_WM_STATE_SKIP_TASKBAR');
    const normal = await atom(c, '_NET_WM_WINDOW_TYPE_NORMAL');
    const wins = await Promise.all(ids.map(async (id) => {
      const [pid, wmClass, state, type] = await Promise.all([
        property(c, id, '_NET_WM_PID', 1),
        property(c, id, 'WM_CLASS', 64),
        property(c, id, '_NET_WM_STATE', 32),
        property(c, id, '_NET_WM_WINDOW_TYPE', 8),
      ]);
      if (!pid?.[0] || state?.includes(skip) || (type && !type.includes(normal))) return null;
      // WM_CLASS: the instance, then the class ("spotify", "Spotify")
      const [, cls = ''] = wmClass ? wmClass.toString('latin1').split('\0') : [];
      return { id, pid: pid[0], wmClass: cls };
    }));
    return wins.filter(Boolean);
  });
}

// Ask that window to close, as its close button would.
function closeWindow(id) {
  return x((c) => tellWm(c, id, '_NET_CLOSE_WINDOW', [0, 2]));
}

// The windows on screen, front first, as the frames you see (title bar in, client-side shadows
// out), in physical pixels: { fg, wins: [{ id, x, y, w, h, max }] }. Not minimized ones, nor those
// on another workspace, nor docks, panels and the desktop.
function windowSnapshot(self) {
  return x(async (c) => {
    const [stack, active, desk] = await Promise.all([
      property(c, c.root, '_NET_CLIENT_LIST_STACKING'),
      property(c, c.root, '_NET_ACTIVE_WINDOW', 1),
      property(c, c.root, '_NET_CURRENT_DESKTOP', 1),
    ]);
    const [hidden, skip, normal, maxV, maxH] = await Promise.all([
      '_NET_WM_STATE_HIDDEN', '_NET_WM_STATE_SKIP_TASKBAR', '_NET_WM_WINDOW_TYPE_NORMAL',
      '_NET_WM_STATE_MAXIMIZED_VERT', '_NET_WM_STATE_MAXIMIZED_HORZ',
    ].map((name) => atom(c, name)));
    const wins = await Promise.all((stack || []).reverse().filter((id) => id !== self).map(async (id) => {
      const [state, type, onDesk, frame, csd, geo, at] = await Promise.all([
        property(c, id, '_NET_WM_STATE', 32),
        property(c, id, '_NET_WM_WINDOW_TYPE', 8),
        property(c, id, '_NET_WM_DESKTOP', 1),
        property(c, id, '_NET_FRAME_EXTENTS', 4),
        property(c, id, '_GTK_FRAME_EXTENTS', 4),
        c.request(14, 0, u32(id), true), // GetGeometry
        c.request(40, 0, Buffer.concat([u32(id, c.root), Buffer.alloc(4)]), true), // TranslateCoordinates, (0, 0)
      ]);
      if (!geo || !at || state?.includes(hidden) || state?.includes(skip) || (type && !type.includes(normal))) return null;
      if (desk && onDesk && onDesk[0] !== desk[0] && onDesk[0] !== 0xffffffff) return null;
      // _NET_FRAME_EXTENTS: the window manager's frame around it; _GTK_FRAME_EXTENTS: the shadow
      // a GTK app draws inside it (left, right, top, bottom)
      const [fl, fr, ft, fb] = frame || [0, 0, 0, 0];
      const [gl, gr, gt, gb] = csd || [0, 0, 0, 0];
      const win = {
        id,
        x: at.readInt16LE(12) - fl + gl,
        y: at.readInt16LE(14) - ft + gt,
        w: geo.readUInt16LE(16) + fl + fr - gl - gr,
        h: geo.readUInt16LE(18) + ft + fb - gt - gb,
        max: Boolean(state?.includes(maxV) && state?.includes(maxH)),
      };
      return win.w >= 200 && win.h >= 120 ? win : null;
    }));
    return { fg: active?.[0] || 0, wins: wins.filter(Boolean).slice(0, 40) };
  });
}

module.exports = { cursorPoint, activeWindow, activateWindow, appWindows, closeWindow, windowSnapshot };
