/*
 * capri-shape: sets where an X11 window takes the pointer (its XShape input region), so Capri's
 * full-screen overlay is clickable on her and click-through everywhere else. Electron only offers
 * all or nothing (setIgnoreMouseEvents), and on XWayland it can't forward the pointer either.
 *
 *   capri-shape <window id>
 *
 * One region per line on stdin, in window pixels: "x y w h;x y w h;..." (an empty line: no input
 * at all). Runs until stdin closes.
 */
#include <X11/Xlib.h>
#include <X11/extensions/shape.h>
#include <stdio.h>
#include <stdlib.h>

#define MAX_RECTS 32

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: capri-shape <window id>\n");
    return 2;
  }
  Window win = (Window)strtoul(argv[1], NULL, 0);
  Display *dpy = XOpenDisplay(NULL);
  if (!dpy) {
    fprintf(stderr, "capri-shape: no X display\n");
    return 1;
  }
  int event_base, error_base;
  if (!XShapeQueryExtension(dpy, &event_base, &error_base)) {
    fprintf(stderr, "capri-shape: no XShape extension\n");
    return 1;
  }
  char line[4096];
  XRectangle rects[MAX_RECTS];
  while (fgets(line, sizeof line, stdin)) {
    int n = 0, used = 0, x, y, w, h;
    char *p = line;
    while (n < MAX_RECTS && sscanf(p, " %d %d %d %d%n", &x, &y, &w, &h, &used) == 4) {
      if (w > 0 && h > 0) rects[n++] = (XRectangle){ (short)x, (short)y, (unsigned short)w, (unsigned short)h };
      p += used;
      while (*p == ' ' || *p == ';') p++;
    }
    XShapeCombineRectangles(dpy, win, ShapeInput, 0, 0, rects, n, ShapeSet, Unsorted);
    XFlush(dpy);
  }
  XCloseDisplay(dpy);
  return 0;
}
