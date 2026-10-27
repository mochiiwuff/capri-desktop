#include <node_api.h>
#include <X11/Xlib.h>
#include <stdlib.h>

static Display *disp = NULL;

static napi_value GetCursorPoint(napi_env env, napi_callback_info info) {
    (void)info;
    if (!disp) {
        disp = XOpenDisplay(NULL);
    }

    int root_x = 0, root_y = 0;
    int success = 0;

    if (disp) {
        Window root_win = DefaultRootWindow(disp);
        Window child;
        int win_x, win_y;
        unsigned int mask;
        if (XQueryPointer(disp, root_win, &root_win, &child, &root_x, &root_y, &win_x, &win_y, &mask)) {
            success = 1;
        } else {
            // If query fails, attempt to reconnect
            XCloseDisplay(disp);
            disp = XOpenDisplay(NULL);
            if (disp) {
                root_win = DefaultRootWindow(disp);
                if (XQueryPointer(disp, root_win, &root_win, &child, &root_x, &root_y, &win_x, &win_y, &mask)) {
                    success = 1;
                }
            }
        }
    }

    napi_value obj, x_val, y_val, ok_val;
    napi_create_object(env, &obj);
    napi_create_int32(env, root_x, &x_val);
    napi_create_int32(env, root_y, &y_val);
    napi_get_boolean(env, success, &ok_val);
    napi_set_named_property(env, obj, "x", x_val);
    napi_set_named_property(env, obj, "y", y_val);
    napi_set_named_property(env, obj, "ok", ok_val);
    return obj;
}

static napi_value Cleanup(napi_env env, napi_callback_info info) {
    (void)env;
    (void)info;
    if (disp) {
        XCloseDisplay(disp);
        disp = NULL;
    }
    return NULL;
}

static napi_value Init(napi_env env, napi_value exports) {
    napi_value fn_get, fn_clean;
    napi_create_function(env, NULL, 0, GetCursorPoint, NULL, &fn_get);
    napi_set_named_property(env, exports, "getCursorPoint", fn_get);
    napi_create_function(env, NULL, 0, Cleanup, NULL, &fn_clean);
    napi_set_named_property(env, exports, "cleanup", fn_clean);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
