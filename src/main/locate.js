'use strict';

// Where a file is shown in the file manager, for her to point at it rather than at its whole window
// (Linux, through the accessibility bus: AT-SPI, asked by Python's own bindings, there on GNOME).
// The file manager selected it (shell.showItemInFolder): the item by that name, selected and in view.

const { execFile } = require('node:child_process');

// prints {"x", "y", "w", "h"} in screen pixels, or nothing. Passed with -c: Python can't read a
// file inside the app archive.
const SCRIPT = String.raw`
import json, sys
import gi
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi

name = sys.argv[1]
S = Atspi.StateType
ITEMS = {'canvas', 'icon', 'table cell', 'list item', 'label'}

def box(a):
    e = a.get_extents(Atspi.CoordType.SCREEN)
    return (e.x, e.y, e.width, e.height)

def inside(b, view):
    return b[2] > 0 and b[3] > 0 and b[0] >= view[0] and b[1] >= view[1] and b[0] + b[2] <= view[0] + view[2] and b[1] + b[3] <= view[1] + view[3]

def find(a, view, depth, out):
    if depth > 20:
        return
    try:
        states = a.get_state_set()
        if depth > 2 and not states.contains(S.SHOWING):
            return
        role = a.get_role_name()
        if role in ('scroll pane', 'viewport'):
            view = box(a)
        if role in ITEMS and a.get_name() == name:
            b = box(a)
            if view is None or inside(b, view):
                out.append((states.contains(S.SELECTED), b))
        for i in range(a.get_child_count()):
            c = a.get_child_at_index(i)
            if c:
                find(c, view, depth + 1, out)
    except Exception:
        pass

desktop = Atspi.get_desktop(0)
found = []
for i in range(desktop.get_child_count()):
    app = desktop.get_child_at_index(i)
    if app and app.get_name() in ('org.gnome.Nautilus', 'nautilus', 'nemo', 'caja', 'Thunar', 'dolphin'):
        for j in range(app.get_child_count()):
            win = app.get_child_at_index(j)
            if win and win.get_state_set().contains(S.SHOWING):
                find(win, None, 0, found)
if found:
    found.sort(key=lambda f: not f[0])  # the selected one first
    x, y, w, h = found[0][1]
    print(json.dumps({'x': x, 'y': y, 'w': w, 'h': h}))
`;

// { x, y, w, h } in physical screen pixels, or null
function locate(name) {
  if (process.platform !== 'linux' || !name) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('python3', ['-I', '-c', SCRIPT, name], { timeout: 4000 }, (err, out) => {
      try {
        resolve(err ? null : JSON.parse(out) || null);
      } catch {
        resolve(null);
      }
    });
  });
}

module.exports = { locate };
