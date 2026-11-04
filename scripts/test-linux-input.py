#!/usr/bin/env python3
"""Native X11 input regression. Requires Xvfb, Python 3, X11/Xext/Xtst and Electron.
Run: python3 scripts/test-linux-input.py [--appimage dist/Capri-0.5.1.AppImage]
Uses an isolated X display and profile; never drives the desktop's real pointer.
"""
import argparse
import ctypes as c
import ctypes.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--appimage', type=Path)
args = parser.parse_args()

x = c.CDLL(ctypes.util.find_library('X11'))
t = c.CDLL(ctypes.util.find_library('Xtst'))
x.XOpenDisplay.argtypes = [c.c_char_p]
x.XOpenDisplay.restype = c.c_void_p
x.XSync.argtypes = [c.c_void_p, c.c_int]
x.XCloseDisplay.argtypes = [c.c_void_p]
x.XGetInputFocus.argtypes = [c.c_void_p, c.POINTER(c.c_ulong), c.POINTER(c.c_int)]
x.XStringToKeysym.argtypes = [c.c_char_p]
x.XStringToKeysym.restype = c.c_ulong
x.XKeysymToKeycode.argtypes = [c.c_void_p, c.c_ulong]
x.XKeysymToKeycode.restype = c.c_uint
t.XTestFakeKeyEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
t.XTestFakeMotionEvent.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_int, c.c_ulong]
t.XTestFakeButtonEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]

with tempfile.TemporaryDirectory(prefix='capri-input-') as work:
    app_process = None
    display = None
    log = open(Path(work) / 'app.log', 'w+')
    server = subprocess.Popen(['Xvfb', '-displayfd', '1', '-screen', '0', '1366x768x24', '-ac'], stdout=subprocess.PIPE, stderr=log, text=True)
    try:
        number = server.stdout.readline().strip()
        assert number.isdigit(), 'Xvfb failed to start'
        display = x.XOpenDisplay(f':{number}'.encode())
        assert display, 'Cannot connect to isolated X display'
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        profile = Path(work) / 'profile'
        profile.mkdir()
        (profile / 'config.json').write_text(json.dumps({'welcomed': True, 'motionAsked': True, 'wander': False, 'follow': False, 'pcReact': False, 'jealous': False, 'motion': 'reduced'}))
        env = {**os.environ, 'DISPLAY': f':{number}', 'XDG_SESSION_TYPE': 'x11', 'CAPRI_PORT': str(port)}
        env.pop('WAYLAND_DISPLAY', None)
        command = ([str(args.appimage.resolve()), '--appimage-extract-and-run'] if args.appimage else [str(ROOT / 'node_modules/electron/dist/electron'), str(ROOT)])
        command += ['--dev', '--ozone-platform=x11', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', f'--user-data-dir={profile}']
        app_process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=log)

        def evaluate(js):
            req = urllib.request.Request(f'http://127.0.0.1:{port}/debug/eval', json.dumps({'js': js}).encode(), {'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=15) as response:
                result = json.load(response)
            assert result.get('ok'), result
            return result.get('value')

        def wait_for(js, seconds=15):
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                try:
                    if evaluate(js):
                        return
                except (OSError, AssertionError):
                    pass
                time.sleep(.1)
            raise AssertionError('Timed out: ' + js)

        def key(name, down):
            code = x.XKeysymToKeycode(display, x.XStringToKeysym(name.encode()))
            assert code, name
            t.XTestFakeKeyEvent(display, code, int(down), 0)
            x.XSync(display, 0)

        def move(px, py):
            t.XTestFakeMotionEvent(display, -1, round(px), round(py), 0)
            x.XSync(display, 0)
            time.sleep(.1)

        def button(down):
            t.XTestFakeButtonEvent(display, 1, int(down), 0)
            x.XSync(display, 0)
            time.sleep(.1)

        wait_for("Boolean(window.dev && !dev.capri.busy && dev.capri.p.alpha > .9)", 90)
        evaluate("dev.guide.answer(null);dev.panel.hide();void dev.guide.askText({line:'Input regression',placeholder:'Test',secret:true});true")
        wait_for('document.hasFocus() && document.activeElement === dev.panel.chatInput')
        evaluate("dev.panel.chatInput.value='';true")
        for char in 'test':
            key(char, True)
            key(char, False)
        wait_for("dev.panel.chatInput.value === 'test'")
        print('PASS native keyboard in secret key field', flush=True)
        payload = 'ทดสอบภาษาไทย test-key'
        evaluate('navigator.clipboard.writeText(' + json.dumps(payload) + ').then(()=>true)')
        key('Control_L', True)
        key('v', True)
        key('v', False)
        key('Control_L', False)
        wait_for('dev.panel.chatInput.value === ' + json.dumps('test' + payload))
        print('PASS native Ctrl+V with Thai clipboard text', flush=True)
        evaluate("dev.guide.answer(null);dev.panel.hide();dev.capri.nextMove=dev.capri.nextGaze=Infinity;window.inputEvents=[];['mousedown','mouseup'].forEach(type=>window.addEventListener(type,e=>inputEvents.push(type)));true")
        wait_for('!dev.capri.busy')
        # The original throw cooldown must not lock Linux pointer interaction.
        evaluate('dev.capri.refuseUntil=performance.now()+60000;true')
        find_point = """(()=>{const c=dev.capri,r=c.canvas.getBoundingClientRect();
          for(let y=Math.max(10,r.top+10);y<Math.min(innerHeight-10,r.bottom-10);y+=4)
          for(let x=Math.max(10,r.left+10);x<Math.min(innerWidth-10,r.right-10);x+=4)
          if(document.elementFromPoint(x,y)===c.canvas && [[0,0],[8,0],[-8,0],[0,8],[0,-8]].every(([dx,dy])=>c.hit(x+dx,y+dy)))return {x,y};return null})()"""
        for iteration in range(5):
            wait_for('!dev.capri.busy')
            point = evaluate(find_point)
            assert point, 'No interactive sprite point'
            before = evaluate('inputEvents.length')
            move(point['x'], point['y'])
            button(True)
            move(point['x']-15, point['y']-15)
            wait_for('dev.capri.dragging', 3)
            time.sleep(.15)  # Release at rest, rather than throwing her.
            button(False)
            wait_for('!dev.capri.dragging && !dev.capri.busy')
            assert evaluate('inputEvents.length') >= before + 2
            # Rearming/keyboard focus changes must preserve subsequent clicks.
            evaluate('host.focusOverlay(true);host.focusOverlay(false);host.rearm();true')
            time.sleep(.7)
        print('PASS five native drags through cooldown, focus and rearm cycles', flush=True)
        evaluate("void dev.guide.askText({line:'Text regression',placeholder:'Test'});true")
        wait_for('document.hasFocus() && document.activeElement === dev.panel.chatInput')
        evaluate("dev.panel.chatInput.value='';true")
        key('a', True)
        key('a', False)
        wait_for("dev.panel.chatInput.value === 'a'")
        print('PASS keyboard restored after closing input and repeated drags', flush=True)
    except Exception:
        log.flush()
        log.seek(0)
        print(log.read()[-5000:])
        raise
    finally:
        if app_process:
            app_process.terminate()
            try:
                app_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                app_process.kill()
                app_process.wait()
        if display:
            x.XCloseDisplay(display)
        server.terminate()
        server.wait(timeout=10)
        log.close()
