/*
 * Capri Desktop - Linux Window Watcher (X11)
 * Watches top-level windows so Capri can sit on, track, and possess them.
 * Outputs one JSON line whenever window stack, focus, or bounds change.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <X11/Xutil.h>

static Display *disp = NULL;

static int on_x_error(Display *d, XErrorEvent *e) {
    (void)d; (void)e;
    return 0;
}

static void close_win(Window w) {
    if (!disp) return;
    XEvent ev;
    memset(&ev, 0, sizeof(ev));
    ev.xclient.type = ClientMessage;
    ev.xclient.window = w;
    ev.xclient.message_type = XInternAtom(disp, "_NET_CLOSE_WINDOW", False);
    ev.xclient.format = 32;
    ev.xclient.data.l[0] = CurrentTime;
    ev.xclient.data.l[1] = 2; // Source: other client/pager
    XSendEvent(disp, DefaultRootWindow(disp), False,
               SubstructureNotifyMask | SubstructureRedirectMask, &ev);
    XFlush(disp);
}

static void list_apps(void) {
    if (!disp) return;

    Window root = DefaultRootWindow(disp);
    Atom net_client_list = XInternAtom(disp, "_NET_CLIENT_LIST", True);
    Atom net_wm_pid = XInternAtom(disp, "_NET_WM_PID", True);
    Atom net_wm_name = XInternAtom(disp, "_NET_WM_NAME", True);
    Atom net_wm_window_type = XInternAtom(disp, "_NET_WM_WINDOW_TYPE", True);
    Atom type_desktop = XInternAtom(disp, "_NET_WM_WINDOW_TYPE_DESKTOP", True);
    Atom type_dock = XInternAtom(disp, "_NET_WM_WINDOW_TYPE_DOCK", True);
    Atom utf8_string = XInternAtom(disp, "UTF8_STRING", True);

    Atom actual_type;
    int actual_format;
    unsigned long nitems = 0, bytes_after = 0;
    Window *wins = NULL;

    if (!net_client_list || XGetWindowProperty(disp, root, net_client_list, 0, 1024, False, XA_WINDOW,
                           &actual_type, &actual_format, &nitems, &bytes_after, (unsigned char **)&wins) != Success || !wins) {
        printf("[]\n");
        return;
    }

    printf("[\n");
    int first = 1;

    for (unsigned long i = 0; i < nitems; i++) {
        Window w = wins[i];
        if (w == 0) continue;

        // Skip dock and desktop
        if (net_wm_window_type) {
            unsigned char *type_prop = NULL;
            unsigned long ntypes = 0;
            int is_dock_desktop = 0;
            if (XGetWindowProperty(disp, w, net_wm_window_type, 0, 32, False, XA_ATOM,
                                   &actual_type, &actual_format, &ntypes, &bytes_after, &type_prop) == Success && type_prop) {
                Atom *atoms = (Atom *)type_prop;
                for (unsigned long j = 0; j < ntypes; j++) {
                    if (atoms[j] == type_desktop || atoms[j] == type_dock) {
                        is_dock_desktop = 1;
                        break;
                    }
                }
                XFree(type_prop);
            }
            if (is_dock_desktop) continue;
        }

        // Get PID
        unsigned long pid = 0;
        unsigned char *pid_prop = NULL;
        unsigned long pid_nitems = 0;
        if (net_wm_pid && XGetWindowProperty(disp, w, net_wm_pid, 0, 1, False, XA_CARDINAL,
                                             &actual_type, &actual_format, &pid_nitems, &bytes_after, &pid_prop) == Success && pid_prop) {
            if (pid_nitems > 0) pid = *(unsigned long *)pid_prop;
            XFree(pid_prop);
        }

        // Get WM_CLASS
        XClassHint class_hint = { NULL, NULL };
        XGetClassHint(disp, w, &class_hint);

        // Get Title (_NET_WM_NAME or WM_NAME)
        char *title = NULL;
        unsigned char *name_prop = NULL;
        unsigned long name_nitems = 0;
        if (net_wm_name && XGetWindowProperty(disp, w, net_wm_name, 0, 1024, False, utf8_string,
                                              &actual_type, &actual_format, &name_nitems, &bytes_after, &name_prop) == Success && name_prop) {
            title = strdup((char *)name_prop);
            XFree(name_prop);
        } else {
            XFetchName(disp, w, &title);
        }

        const char *res_name = class_hint.res_name ? class_hint.res_name : "";
        const char *res_class = class_hint.res_class ? class_hint.res_class : "";

        // If no title, class or name, skip
        if (!res_class[0] && !res_name[0] && (!title || !title[0])) {
            if (class_hint.res_name) XFree(class_hint.res_name);
            if (class_hint.res_class) XFree(class_hint.res_class);
            if (title) free(title);
            continue;
        }

        // Read /proc/<pid>/comm
        char comm[256] = "";
        if (pid > 0) {
            char path[64];
            snprintf(path, sizeof(path), "/proc/%lu/comm", pid);
            FILE *f = fopen(path, "r");
            if (f) {
                if (fgets(comm, sizeof(comm), f)) {
                    comm[strcspn(comm, "\r\n")] = 0;
                }
                fclose(f);
            }
        }

        if (!first) printf(",\n");
        first = 0;

        printf("  {\"winId\":%lu,\"pid\":%lu,\"comm\":\"", (unsigned long)w, pid);
        for (const char *p = comm; *p; p++) {
            if (*p == '"' || *p == '\\') putchar('\\');
            else if ((unsigned char)*p >= 32) putchar(*p);
        }
        printf("\",\"resName\":\"");
        for (const char *p = res_name; *p; p++) {
            if (*p == '"' || *p == '\\') putchar('\\');
            else if ((unsigned char)*p >= 32) putchar(*p);
        }
        printf("\",\"resClass\":\"");
        for (const char *p = res_class; *p; p++) {
            if (*p == '"' || *p == '\\') putchar('\\');
            else if ((unsigned char)*p >= 32) putchar(*p);
        }
        printf("\",\"title\":\"");
        if (title) {
            for (const char *p = title; *p; p++) {
                if (*p == '"' || *p == '\\') putchar('\\');
                else if (*p == '\n') { printf("\\n"); continue; }
                else if (*p == '\r') continue;
                else if ((unsigned char)*p >= 32) putchar(*p);
            }
        }
        printf("\"}");

        if (class_hint.res_name) XFree(class_hint.res_name);
        if (class_hint.res_class) XFree(class_hint.res_class);
        if (title) free(title);
    }
    printf("\n]\n");

    XFree(wins);
}

static void print_snapshot(Window self) {
    if (!disp) return;

    Window root = DefaultRootWindow(disp);
    Atom net_client_list_stacking = XInternAtom(disp, "_NET_CLIENT_LIST_STACKING", True);
    Atom net_client_list = XInternAtom(disp, "_NET_CLIENT_LIST", True);
    Atom net_active_window = XInternAtom(disp, "_NET_ACTIVE_WINDOW", True);
    Atom net_wm_state = XInternAtom(disp, "_NET_WM_STATE", True);
    Atom net_wm_window_type = XInternAtom(disp, "_NET_WM_WINDOW_TYPE", True);
    Atom net_frame_extents = XInternAtom(disp, "_NET_FRAME_EXTENTS", True);
    Atom state_hidden = XInternAtom(disp, "_NET_WM_STATE_HIDDEN", True);
    Atom state_max_h = XInternAtom(disp, "_NET_WM_STATE_MAXIMIZED_HORZ", True);
    Atom state_max_v = XInternAtom(disp, "_NET_WM_STATE_MAXIMIZED_VERT", True);
    Atom type_desktop = XInternAtom(disp, "_NET_WM_WINDOW_TYPE_DESKTOP", True);
    Atom type_dock = XInternAtom(disp, "_NET_WM_WINDOW_TYPE_DOCK", True);

    // Active foreground window
    Window active_win = 0;
    Atom actual_type;
    int actual_format;
    unsigned long nitems, bytes_after;
    unsigned char *prop = NULL;
    if (net_active_window && XGetWindowProperty(disp, root, net_active_window, 0, 1, False, XA_WINDOW,
                           &actual_type, &actual_format, &nitems, &bytes_after, &prop) == Success) {
        if (nitems > 0 && prop) {
            active_win = *(Window *)prop;
        }
        if (prop) XFree(prop);
    }

    // Client list in stacking order (bottom to top)
    Atom list_atom = net_client_list_stacking ? net_client_list_stacking : net_client_list;
    Window *wins = NULL;
    if (!list_atom || XGetWindowProperty(disp, root, list_atom, 0, 1024, False, XA_WINDOW,
                           &actual_type, &actual_format, &nitems, &bytes_after, (unsigned char **)&wins) != Success) {
        return;
    }

    static char buf[32768];
    static char last_buf[32768] = "";

    int offset = snprintf(buf, sizeof(buf), "{\"fg\":%lu,\"wins\":[", (unsigned long)active_win);
    int count = 0;

    // Traverse top-to-bottom
    for (long i = (long)nitems - 1; i >= 0 && count < 40; i--) {
        Window w = wins[i];
        if (w == self) continue;

        // Check type (skip desktop, dock/panel)
        if (net_wm_window_type) {
            unsigned char *type_prop = NULL;
            unsigned long ntypes = 0;
            int is_dock_or_desktop = 0;
            if (XGetWindowProperty(disp, w, net_wm_window_type, 0, 32, False, XA_ATOM,
                                   &actual_type, &actual_format, &ntypes, &bytes_after, &type_prop) == Success) {
                if (type_prop) {
                    Atom *atoms = (Atom *)type_prop;
                    for (unsigned long j = 0; j < ntypes; j++) {
                        if (atoms[j] == type_desktop || atoms[j] == type_dock) {
                            is_dock_or_desktop = 1;
                            break;
                        }
                    }
                    XFree(type_prop);
                }
            }
            if (is_dock_or_desktop) continue;
        }

        // Check state (skip minimized/hidden, check maximized)
        int is_hidden = 0, max_h = 0, max_v = 0;
        if (net_wm_state) {
            unsigned char *state_prop = NULL;
            unsigned long nstates = 0;
            if (XGetWindowProperty(disp, w, net_wm_state, 0, 32, False, XA_ATOM,
                                   &actual_type, &actual_format, &nstates, &bytes_after, &state_prop) == Success) {
                if (state_prop) {
                    Atom *atoms = (Atom *)state_prop;
                    for (unsigned long j = 0; j < nstates; j++) {
                        if (atoms[j] == state_hidden) is_hidden = 1;
                        if (atoms[j] == state_max_h) max_h = 1;
                        if (atoms[j] == state_max_v) max_v = 1;
                    }
                    XFree(state_prop);
                }
            }
        }
        if (is_hidden) continue;

        // Position and geometry
        int x = 0, y = 0;
        Window child;
        if (!XTranslateCoordinates(disp, w, root, 0, 0, &x, &y, &child)) {
            continue;
        }

        Window junk_root;
        int junk_x, junk_y;
        unsigned int width = 0, height = 0, border = 0, depth = 0;
        if (!XGetGeometry(disp, w, &junk_root, &junk_x, &junk_y, &width, &height, &border, &depth)) {
            continue;
        }

        // Apply frame extents (titlebar, borders)
        if (net_frame_extents) {
            unsigned char *ext_prop = NULL;
            unsigned long next = 0;
            if (XGetWindowProperty(disp, w, net_frame_extents, 0, 4, False, XA_CARDINAL,
                                   &actual_type, &actual_format, &next, &bytes_after, &ext_prop) == Success) {
                if (ext_prop && next >= 4) {
                    long *ext = (long *)ext_prop;
                    x -= ext[0];
                    width += ext[0] + ext[1];
                    y -= ext[2];
                    height += ext[2] + ext[3];
                }
                if (ext_prop) XFree(ext_prop);
            }
        }

        if (width < 200 || height < 120) continue;

        if (count > 0 && offset < (int)sizeof(buf) - 64) {
            buf[offset++] = ',';
        }

        offset += snprintf(buf + offset, sizeof(buf) - offset,
                           "{\"id\":%lu,\"x\":%d,\"y\":%d,\"w\":%u,\"h\":%u,\"max\":%s}",
                           (unsigned long)w, x, y, width, height, (max_h && max_v) ? "true" : "false");
        count++;
    }

    if (wins) XFree(wins);

    snprintf(buf + offset, sizeof(buf) - offset, "]}");

    if (strcmp(buf, last_buf) != 0) {
        snprintf(last_buf, sizeof(last_buf), "%s", buf);
        puts(buf);
        fflush(stdout);
    }
}

int main(int argc, char **argv) {
    disp = XOpenDisplay(NULL);
    if (!disp) return 1;

    XSetErrorHandler(on_x_error);

    if (argc > 1 && strcmp(argv[1], "--apps") == 0) {
        list_apps();
        XCloseDisplay(disp);
        return 0;
    }

    if (argc > 2 && strcmp(argv[1], "--close") == 0) {
        Window target = (Window)strtoul(argv[2], NULL, 0);
        close_win(target);
        XCloseDisplay(disp);
        return 0;
    }

    Window self = 0;
    int parent_pid = 0;
    if (argc > 1) self = (Window)strtoul(argv[1], NULL, 0);
    if (argc > 2) parent_pid = atoi(argv[2]);

    if (self) {
        Atom net_wm_state = XInternAtom(disp, "_NET_WM_STATE", False);
        Atom skip_pager = XInternAtom(disp, "_NET_WM_STATE_SKIP_PAGER", False);
        Atom skip_taskbar = XInternAtom(disp, "_NET_WM_STATE_SKIP_TASKBAR", False);
        if (net_wm_state && skip_pager && skip_taskbar) {
            XEvent ev;
            memset(&ev, 0, sizeof(ev));
            ev.xclient.type = ClientMessage;
            ev.xclient.window = self;
            ev.xclient.message_type = net_wm_state;
            ev.xclient.format = 32;
            ev.xclient.data.l[0] = 1; // _NET_WM_STATE_ADD
            ev.xclient.data.l[1] = (long)skip_pager;
            ev.xclient.data.l[2] = (long)skip_taskbar;
            ev.xclient.data.l[3] = 1;
            XSendEvent(disp, DefaultRootWindow(disp), False,
                       SubstructureNotifyMask | SubstructureRedirectMask, &ev);
            XFlush(disp);
        }
    }

    int tick = 0;
    while (1) {
        print_snapshot(self);
        usleep(150000); // 150ms interval, same as Windows
        tick++;
        if (parent_pid > 0 && (tick % 20 == 0)) {
            if (kill(parent_pid, 0) != 0) break;
        }
    }

    XCloseDisplay(disp);
    return 0;
}
