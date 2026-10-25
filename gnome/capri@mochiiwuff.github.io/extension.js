// Tells Capri where the windows and the pointer are (GNOME on Wayland lets no app see them).
// While Capri runs, she listens on $XDG_RUNTIME_DIR/capri.sock: we connect to it and send one JSON
// line whenever something changes: the focused window and the visible windows in stacking order
// (front first) as frame bounds, and the pointer. No titles, no contents. Her shortcut too, since
// X11 key grabs don't see the keys typed in Wayland windows.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const TICK = 33; // ms, the pointer
const WINDOWS_EVERY = 5; // ticks, the windows (~150 ms, like on Windows)
const RETRY_EVERY = 60; // ticks, looking for Capri (~2 s)
const MAX_WINDOWS = 40;
const TYPES = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG];

const encoder = new TextEncoder();

export default class CapriExtension extends Extension {
  enable() {
    this._path = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'capri.sock']);
    this._settings = this.getSettings();
    this._socket = null;
    this._tick = 0;
    this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK, () => {
      this._step();
      return GLib.SOURCE_CONTINUE;
    });
  }

  disable() {
    GLib.source_remove(this._timer);
    this._timer = 0;
    this._close();
    this._settings = null;
  }

  _step() {
    this._tick++;
    if (!this._socket) {
      if (this._tick % RETRY_EVERY === 1) this._connect();
      return;
    }
    if (this._pending && !this._flush()) return;
    const [x, y] = global.get_pointer();
    const pointer = `{"p":[${x},${y}]}`;
    if (pointer !== this._lastPointer && this._send(pointer)) this._lastPointer = pointer;
    if (this._tick % WINDOWS_EVERY === 0) {
      const wins = this._snapshot();
      if (wins !== this._lastWins && this._send(wins)) this._lastWins = wins;
    }
  }

  _connect() {
    if (!GLib.file_test(this._path, GLib.FileTest.EXISTS)) return;
    try {
      const client = new Gio.SocketClient();
      const conn = client.connect(Gio.UnixSocketAddress.new(this._path), null);
      this._conn = conn;
      this._socket = conn.get_socket();
      // never block the shell on her: a full socket drops a frame, and the next one catches up
      this._socket.set_blocking(false);
    } catch {
      this._close();
      return;
    }
    this._pending = null;
    this._lastPointer = this._lastWins = null;
    this._bindKey();
  }

  _close() {
    if (this._bound) Main.wm.removeKeybinding('toggle');
    this._bound = false;
    try {
      this._conn?.close(null);
    } catch {}
    this._conn = this._socket = this._pending = null;
  }

  // her Ctrl+Alt+C, only while she runs
  _bindKey() {
    try {
      Main.wm.addKeybinding('toggle', this._settings, Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, () => this._send('{"key":"toggle"}'));
      this._bound = true;
    } catch (e) {
      console.warn(`[capri] no shortcut: ${e.message}`);
    }
  }

  // false when the line couldn't go out whole (what's left goes first next time)
  _send(line) {
    if (this._pending) return false;
    this._pending = encoder.encode(line + '\n');
    return this._flush();
  }

  _flush() {
    try {
      const sent = this._socket.send(this._pending, null);
      this._pending = sent >= this._pending.length ? null : this._pending.subarray(sent);
      return !this._pending;
    } catch (e) {
      if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.WOULD_BLOCK)) return false;
      this._close(); // she's gone
      return false;
    }
  }

  _snapshot() {
    const workspace = global.workspace_manager.get_active_workspace();
    const stack = global.display.sort_windows_by_stacking(workspace.list_windows()).reverse();
    const wins = [];
    for (const w of stack) {
      if (wins.length >= MAX_WINDOWS) break;
      if (w.minimized || w.is_skip_taskbar() || !TYPES.includes(w.get_window_type())) continue;
      if (!w.showing_on_its_workspace()) continue;
      const r = w.get_frame_rect();
      if (r.width < 200 || r.height < 120) continue;
      const max = w.is_fullscreen() ||
        (typeof w.is_maximized === 'function' ? w.is_maximized() : w.get_maximized() === Meta.MaximizeFlags.BOTH);
      wins.push(`{"id":${w.get_id()},"x":${r.x},"y":${r.y},"w":${r.width},"h":${r.height},"max":${max}}`);
    }
    const fg = global.display.focus_window?.get_id() ?? 0;
    return `{"fg":${fg},"wins":[${wins.join(',')}]}`;
  }
}
