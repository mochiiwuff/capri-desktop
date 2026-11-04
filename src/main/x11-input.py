#!/usr/bin/env python3
"""Apply X11 input-only regions without clipping the overlay's visible pixels."""
import ctypes as c
import ctypes.util
import json
import sys

class Rect(c.Structure):
    _fields_ = [('x', c.c_short), ('y', c.c_short), ('width', c.c_ushort), ('height', c.c_ushort)]

x11 = c.CDLL(ctypes.util.find_library('X11'))
ext = c.CDLL(ctypes.util.find_library('Xext'))
x11.XOpenDisplay.argtypes = [c.c_char_p]
x11.XOpenDisplay.restype = c.c_void_p
x11.XFlush.argtypes = [c.c_void_p]
ext.XShapeCombineRectangles.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_int, c.c_int, c.POINTER(Rect), c.c_int, c.c_int, c.c_int]
display = x11.XOpenDisplay(None)
if not display:
    sys.exit('Cannot open X display')
window = int(sys.argv[1])
for line in sys.stdin:
    try:
        data = json.loads(line)
        rects = (Rect * len(data))(*(Rect(*r) for r in data))
        ext.XShapeCombineRectangles(display, window, 2, 0, 0, rects, len(data), 0, 0)
        x11.XFlush(display)
    except (ValueError, TypeError, OverflowError) as exc:
        print(exc, file=sys.stderr, flush=True)
