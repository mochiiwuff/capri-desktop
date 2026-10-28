'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

// Hyprland's IPC socket: one connection per request, as hyprctl does, without spawning a process
// (her pointer is read this way twenty times a second).
function socketPath(env = process.env) {
  const sig = env.HYPRLAND_INSTANCE_SIGNATURE;
  if (!sig || !/^[\w.-]+$/.test(sig)) return null;
  return path.join(env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`, 'hypr', sig, '.socket.sock');
}

function request(text, file = socketPath()) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('not running under Hyprland'));
    const chunks = [];
    const sock = net.createConnection(file, () => sock.end(text));
    sock.setTimeout(2000, () => sock.destroy(new Error('Hyprland IPC timeout')));
    sock.on('data', (chunk) => chunks.push(chunk));
    sock.on('error', reject);
    sock.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

// Hyprland's event socket: a line per event (`name>>data`), so she hears of a window opened, moved
// or closed, a workspace switched or the config reloaded as it happens. Reconnects if Hyprland
// restarts; `close()` stops it.
function watchEvents(onEvent, file = socketPath() && socketPath().replace(/\.socket\.sock$/, '.socket2.sock')) {
  let sock = null;
  let closed = false;
  let retry = null;
  const connect = () => {
    if (closed || !file) return;
    let buffer = '';
    sock = net.createConnection(file);
    sock.setEncoding('utf8');
    sock.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const at = line.indexOf('>>');
        if (at > 0) onEvent(line.slice(0, at), line.slice(at + 2));
      }
    });
    sock.on('error', () => {});
    sock.on('close', () => { if (!closed) retry = setTimeout(connect, 2000); });
  };
  connect();
  return { close() { closed = true; clearTimeout(retry); sock?.destroy(); } };
}

// what changes the windows she perches on, or her own place
const WINDOW_EVENTS = new Set(['openwindow', 'closewindow', 'movewindowv2', 'workspacev2', 'activespecialv2',
  'focusedmonv2', 'activewindowv2', 'changefloatingmode', 'fullscreen', 'minimized', 'pin', 'monitoraddedv2',
  'monitorremovedv2', 'configreloaded']);

function hyprctl(command) {
  return new Promise((resolve, reject) => {
    execFile('hyprctl', ['-j', command], { timeout: 2000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => (
      err ? reject(err) : resolve(out)));
  });
}

function query(command) {
  const read = socketPath() ? request(`j/${command}`) : hyprctl(command);
  return read.then((out) => JSON.parse(out));
}

// A Lua config (Hyprland 0.55+) takes `hl.dsp.*` dispatchers, an older one its named dispatchers.
async function dispatch(lua, legacy, call = request) {
  if ((await call(`dispatch ${lua}`)).trim() === 'ok') return true;
  return legacy ? (await call(`dispatch ${legacy}`)).trim() === 'ok' : false;
}

const OWN_TITLE = 'Capri Overlay';
const ownWindow = (clients, pid) => clients.find((c) => c.pid === pid && c.title === OWN_TITLE && c.mapped) || null;

// a monitor's size in the layout's (logical) pixels: rotated a quarter turn, its sides swap
function logical(m) {
  const [w, h] = m.transform % 2 ? [m.height, m.width] : [m.width, m.height];
  return { id: m.id, workspace: m.activeWorkspace?.id, name: m.name, x: m.x, y: m.y, width: Math.round(w / (m.scale || 1)), height: Math.round(h / (m.scale || 1)) };
}

// XWayland lays its outputs out its own way (often side by side from 0,0), so Electron's screens
// and Hyprland's monitors don't share coordinates, and Electron gives no output names. A screen is
// matched to the monitor of its size, in the same order among those of that size.
function monitorFor(bounds, screens, monitors) {
  const same = (a) => a.width === bounds.width && a.height === bounds.height;
  const order = (a, b) => a.x - b.x || a.y - b.y;
  const peers = screens.filter(same).sort(order);
  const mons = monitors.map(logical).filter(same).sort(order);
  const i = peers.findIndex((b) => b.x === bounds.x && b.y === bounds.y);
  return mons[i] || (monitors.length === 1 && screens.length === 1 ? logical(monitors[0]) : null);
}

// A game in front: its name, from where its program sits (a launcher's library, a Wine prefix's
// Program Files), as on Windows; or a Steam game's window. Its name only, never a path.
const GAME_PATHS = [
  /[\\/]steamapps[\\/]common[\\/]([^\\/]+)[\\/]/i,
  /[\\/]Games[\\/]Heroic[\\/](?!Prefixes[\\/])([^\\/]+)[\\/]/i,
  /[\\/]Ubisoft Game Launcher[\\/]games[\\/]([^\\/]+)[\\/]/i,
  /[\\/](?:Epic Games|GOG Games|GOG Galaxy[\\/]Games|Riot Games|XboxGames)[\\/]([^\\/]+)[\\/]/i,
  /[\\/]Games[\\/](?!Heroic[\\/])([^\\/]+)[\\/]/,
];
const NOT_GAME = /launcher|client|redistributable|steamworks|proton|steamlinuxruntime|prefixes|^common$|^(?:upc|uplay|steam|steamwebhelper|epicgameslauncher|galaxyclient)$/i;
const readCmdline = (pid) => fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
const cmdlines = new Map(); // pid → its command line, read once

function gameOf(active, readCmd = readCmdline) {
  if (!active?.mapped || !Number.isInteger(active.pid) || active.pid <= 0) return null;
  if (/^steam_app_\d+$/.test(active.class || '') && active.title) return active.title.trim().slice(0, 60) || null;
  let cmd = cmdlines.get(active.pid);
  if (cmd === undefined) {
    try { cmd = readCmd(active.pid).replace(/\0/g, ' '); } catch { cmd = ''; }
    if (cmdlines.size > 200) cmdlines.clear();
    cmdlines.set(active.pid, cmd);
  }
  for (const re of GAME_PATHS) {
    const name = re.exec(cmd)?.[1];
    if (name && !NOT_GAME.test(name)) return name.slice(0, 60);
  }
  // a Windows program run full screen through Wine or Proton: most likely a game
  const exe = /([^\\/ ]+)\.exe\b/i.exec(cmd)?.[1];
  return exe && active.fullscreen && !NOT_GAME.test(exe) ? exe.slice(0, 60) : null;
}

// Hyprland reports logical desktop coordinates. Exclude other workspaces and Capri;
// never send window titles or process details to the renderer.
function snapshot(clients, monitors, active, bounds, pid = process.pid, readCmd = readCmdline) {
  const own = ownWindow(clients, pid);
  // her window where Hyprland really put it, not where XWayland says it is
  if (own) bounds = { x: own.at[0], y: own.at[1], width: own.size[0], height: own.size[1] };
  const visible = new Set(monitors.flatMap((m) => [m.activeWorkspace?.id, m.specialWorkspace?.id])
    .filter((id) => Number.isInteger(id) && id !== 0));
  const wins = clients.filter((c) => c.mapped && !c.hidden && c.pid !== pid
    && !/^capri(-desktop)?$/i.test(c.class || '') && (c.pinned || visible.has(c.workspace?.id)))
    .filter((c) => Array.isArray(c.at) && Array.isArray(c.size)
      && [...c.at, ...c.size].every(Number.isFinite) && c.size[0] > 0 && c.size[1] > 0)
    .map((c) => ({ id: c.address, x: c.at[0] - bounds.x, y: c.at[1] - bounds.y,
      w: c.size[0], h: c.size[1], max: Boolean(c.fullscreen) }))
    .filter((w) => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0);
  const game = active?.pid !== pid ? gameOf(active, readCmd) : null;
  // a video, a slideshow… full screen on her monitor: she steps aside too, without a word
  const full = Boolean(!game && active?.mapped && active.fullscreen === 2 && active.pid !== pid
    && (!own || active.monitor === own.monitor));
  return { fg: active?.address || null, taskbar: false, ai: [], game, full, usb: [], plug: null, wins };
}

function startWindowWatch({ overlay, onUpdate, read = query, events = read === query ? watchEvents : null, every = 1000 }) {
  let stopped = false;
  let busy = false;
  let last = null;
  let previous = '';
  let warned = false;
  function send() {
    if (stopped || !last || overlay.isDestroyed()) return;
    const data = snapshot(...last, overlay.getBounds());
    const serialized = JSON.stringify(data);
    if (serialized !== previous) { previous = serialized; onUpdate(data); }
  }
  async function poll() {
    if (stopped || busy) return;
    busy = true;
    try {
      last = await Promise.all(['clients', 'monitors', 'activewindow'].map(read));
      if (!Array.isArray(last[0]) || !Array.isArray(last[1])) throw new Error('invalid Hyprland snapshot');
      send();
      warned = false;
    } catch (err) {
      if (!stopped && !warned) console.error('[capri] Hyprland window watch:', err.message);
      warned = true;
      last = [[], [], null];
      send(); // remove stale perches after a compositor/IPC failure
    } finally { busy = false; }
  }
  // events for what happens at once, a slower poll for what has none (a window dragged or resized)
  let soon = null;
  const stream = events ? events((name) => {
    if (!WINDOW_EVENTS.has(name) || soon) return;
    soon = setTimeout(() => { soon = null; poll(); }, 30);
  }) : null;
  const timer = setInterval(poll, every);
  poll();
  return {
    stop() { stopped = true; clearInterval(timer); clearTimeout(soon); stream?.close(); },
    refresh() { previous = ''; send(); },
  };
}

// Her overlay as Hyprland sees it: put on the right monitor, the pointer read from the compositor
// (XWayland only knows where it is over X windows, and hers lets it through), and the keyboard
// handed to her chat and back.
function createHyprland({ pid = process.pid, call = request } = {}) {
  const ask = (command) => call(`j/${command}`).then((out) => JSON.parse(out));
  let own = null; // { address, x, y, width, height }, in Hyprland's coordinates
  let monitors = [];
  let screens = []; // Electron's screen bounds, matched with `monitors`
  let before = null; // the window that had the keyboard before her chat took it
  let followMouse = null; // your input:follow_mouse, while her chat holds it at 2

  async function place(bounds, area, all) {
    screens = all;
    const [mons, clients] = await Promise.all([ask('monitors'), ask('clients')]);
    monitors = mons;
    const mon = monitorFor(bounds, screens, monitors);
    const win = ownWindow(clients, pid);
    if (!mon || !win) return false;
    const x = mon.x + area.x - bounds.x;
    const y = mon.y + area.y - bounds.y;
    const at = `window = "address:${win.address}"`;
    // Hyprland gives XWayland a window's coordinates from the monitor it belongs to, and a pinned
    // window keeps the monitor it had when moved across: left on the other one, her window sits
    // outside XWayland's screens, where its pointer can't reach (clicks on her never arrive).
    // Unpinned, sent to that monitor's workspace, and pinned again, it belongs there.
    if (Number.isInteger(mon.id) && win.monitor !== mon.id && Number.isInteger(mon.workspace)) {
      if (win.pinned) await dispatch(`hl.dsp.window.pin({ ${at} })`, `pin address:${win.address}`, call);
      await dispatch(`hl.dsp.window.move({ workspace = "${mon.workspace}", ${at} })`,
        `movetoworkspacesilent ${mon.workspace},address:${win.address}`, call);
      if (win.pinned) await dispatch(`hl.dsp.window.pin({ ${at} })`, `pin address:${win.address}`, call);
    }
    if (win.size[0] !== area.width || win.size[1] !== area.height) {
      await dispatch(`hl.dsp.window.resize({ x = ${area.width}, y = ${area.height}, ${at} })`,
        `resizewindowpixel exact ${area.width} ${area.height},address:${win.address}`, call);
    }
    if (win.at[0] !== x || win.at[1] !== y) {
      await dispatch(`hl.dsp.window.move({ x = ${x}, y = ${y}, ${at} })`,
        `movewindowpixel exact ${x} ${y},address:${win.address}`, call);
    }
    if (own?.address !== win.address) await settle(win.address);
    own = { address: win.address, x, y, width: area.width, height: area.height };
    return true;
  }

  // Focusable, her full-screen window would be the one under the pointer everywhere for Hyprland:
  // it would take your clicks and Super+drag would move it. So Hyprland skips it (no_focus) except
  // while the pointer is on her (to be clicked) or her chat is open (to be typed to), and the pointer
  // passing over her never takes the keyboard (no_follow_mouse).
  let chatting = false;
  let hovered = false;
  let skipped = null; // no_focus as last set
  const setProp = (address, prop, on) => dispatch(
    `hl.dsp.window.set_prop({ window = "address:${address}", prop = "${prop}", value = "${on ? 1 : 0}" })`,
    `setprop address:${address} ${prop} ${on ? 1 : 0}`, call);
  async function setNoFocus(address, on) {
    if (skipped === on) return true;
    skipped = on;
    return setProp(address, 'no_focus', on);
  }
  async function settle(address) {
    skipped = null;
    await setProp(address, 'no_follow_mouse', true);
    return setNoFocus(address, !chatting && !hovered);
  }

  // the pointer on her body, her panel or her biochip (the renderer's hit test), or off them
  function hover(on) {
    hovered = Boolean(on);
    queue = queue.then(() => own && setNoFocus(own.address, !chatting && !hovered)).catch(() => {});
    return queue;
  }

  // the pointer, over her window ({x, y} in it) and in Electron's screen coordinates (`screen`)
  async function cursor() {
    if (!own) return null;
    const p = await ask('cursorpos');
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return null;
    const x = p.x - own.x;
    const y = p.y - own.y;
    let screen = null;
    for (const b of screens) {
      const m = monitorFor(b, screens, monitors);
      if (m && p.x >= m.x && p.y >= m.y && p.x < m.x + m.width && p.y < m.y + m.height) {
        screen = { x: b.x + p.x - m.x, y: b.y + p.y - m.y };
        break;
      }
    }
    return { x, y, inside: x >= 0 && y >= 0 && x < own.width && y < own.height, screen };
  }

  async function setFollowMouse(value) {
    if ((await call(`eval hl.config({ input = { follow_mouse = ${value} } })`)).trim() !== 'ok') {
      await call(`keyword input:follow_mouse ${value}`);
    }
  }

  // While her chat is open, moving the pointer off it no longer takes the keyboard away from her
  // (follow_mouse 1 → 2: focus on click); clicking another window still does. One at a time: a
  // chat opened and given up at once would otherwise read follow_mouse after it was set to 2.
  let queue = Promise.resolve();
  function focus(on) {
    const run = queue.then(() => handOver(on));
    queue = run.catch(() => {});
    return run;
  }

  async function handOver(on) {
    if (!own) return false;
    chatting = on;
    await setNoFocus(own.address, !chatting && !hovered);
    if (on) {
      const active = await ask('activewindow').catch(() => null);
      if (active?.address && active.address !== own.address) before = active.address;
      if (followMouse === null) {
        const option = await ask('getoption input:follow_mouse').catch(() => null);
        if (option?.int === 1) {
          followMouse = 1;
          await setFollowMouse(2);
        }
      }
      return dispatch(`hl.dsp.focus({ window = "address:${own.address}" })`, `focuswindow address:${own.address}`, call);
    }
    if (followMouse !== null) {
      await setFollowMouse(followMouse);
      followMouse = null;
    }
    const active = await ask('activewindow').catch(() => null);
    const back = before;
    before = null;
    // the keyboard back where it was, unless you've since gone to another window yourself
    if (back && active?.address === own.address) {
      return dispatch(`hl.dsp.focus({ window = "address:${back}" })`, `focuswindow address:${back}`, call);
    }
    return true;
  }

  // `hyprctl reload` puts back your config's follow_mouse, her chat open or not: held at 2 again
  function reapply() {
    queue = queue.then(async () => {
      if (!own) return;
      await settle(own.address);
      if (chatting && followMouse !== null) await setFollowMouse(2);
    }).catch(() => {});
    return queue;
  }

  // quitting with her chat open: your follow_mouse back before she's gone
  function restoreSync() {
    if (followMouse === null) return;
    const value = followMouse;
    followMouse = null;
    try {
      const out = execFileSync('hyprctl', ['eval', `hl.config({ input = { follow_mouse = ${value} } })`], { timeout: 2000 });
      if (String(out).trim() !== 'ok') execFileSync('hyprctl', ['keyword', 'input:follow_mouse', String(value)], { timeout: 2000 });
    } catch { /* Hyprland gone: nothing to restore */ }
  }

  // a picture of the monitor showing that Electron screen, `width` px wide at most (grim, JPEG)
  async function snapshot(bounds, all, width = 1280) {
    const mons = await ask('monitors');
    const mon = monitorFor(bounds, all, mons);
    if (!mon || !/^[\w.-]+$/.test(mon.name)) return null;
    const scale = Math.min(1, width / mon.width).toFixed(3);
    return new Promise((resolve, reject) => execFile('grim', ['-o', mon.name, '-t', 'jpeg', '-q', '72', '-s', scale, '-'],
      { encoding: 'buffer', timeout: 5000, maxBuffer: 32 * 1024 * 1024 }, (err, out) => (err ? reject(err) : resolve(out))));
  }

  // another window to the front (its workspace with it), if it's still there
  async function focusWindow(address) {
    if (!/^0x[0-9a-f]{1,16}$/i.test(address)) return false;
    const clients = await ask('clients');
    if (!clients.some((c) => c.address === address && c.mapped)) return false;
    return dispatch(`hl.dsp.focus({ window = "address:${address}" })`, `focuswindow address:${address}`, call);
  }

  return { place, cursor, focus, focusWindow, snapshot, hover, reapply, restoreSync, get placed() { return Boolean(own); } };
}

module.exports = { snapshot, startWindowWatch, createHyprland, watchEvents, monitorFor, logical, socketPath, gameOf };
