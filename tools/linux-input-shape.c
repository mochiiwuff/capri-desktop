// Linux (X11/XWayland): the parts of her window that take the pointer. Electron's click-through
// forwards no mouse moves on Linux, so she never learns the pointer is on her: instead main.js
// sends here, one line per change, "<xid> x,y,w,h x,y,w,h ..." (physical pixels) and this sets
// the window's input shape to just those rectangles; the rest stays click-through.
// Build: gcc -O2 -o tools/linux-input-shape tools/linux-input-shape.c -lX11 /usr/lib/x86_64-linux-gnu/libXext.so.6
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// from X11/extensions/shape.h (its -dev package isn't needed for four constants and one call)
#define ShapeSet 0
#define ShapeInput 2
extern void XShapeCombineRectangles(Display *, Window, int, int, int, XRectangle *, int, int, int);

int main(void) {
  Display *dpy = XOpenDisplay(NULL);
  if (!dpy) { fprintf(stderr, "linux-input-shape: no X display\n"); return 1; }
  static char line[1 << 16];
  static XRectangle rects[2048];
  while (fgets(line, sizeof line, stdin)) {
    char *save = NULL, *tok = strtok_r(line, " \n", &save);
    if (!tok) continue;
    Window xid = strtoul(tok, NULL, 10);
    int n = 0, x, y, w, h;
    while ((tok = strtok_r(NULL, " \n", &save)) && n < 2048) {
      if (sscanf(tok, "%d,%d,%d,%d", &x, &y, &w, &h) != 4) continue;
      rects[n++] = (XRectangle){ (short)x, (short)y, (unsigned short)w, (unsigned short)h };
    }
    XShapeCombineRectangles(dpy, xid, ShapeInput, 0, 0, rects, n, ShapeSet, 0);
    XFlush(dpy);
  }
  XCloseDisplay(dpy);
  return 0;
}
