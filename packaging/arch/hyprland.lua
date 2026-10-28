-- Capri under Hyprland (Lua config). Load it from your hyprland.lua:
--   dofile("/usr/share/capri-desktop/hyprland.lua")

-- her overlay: a full-screen XWayland window, floating and pinned, never tiled nor animated
hl.window_rule({
    name  = "capri-overlay",
    match = { class = "^(capri|capri-desktop)$", title = "^(Capri Overlay)$" },
    float            = true,
    pin              = true,
    no_initial_focus = true,
    no_blur          = true,
    no_shadow        = true,
    border_size      = 0,
    no_anim          = true,
})

-- Super+Alt+C: her chat, open or closed (the keyboard handed to her, then back)
hl.bind("SUPER + ALT + C", hl.dsp.exec_cmd("capri --talk"))
-- Super+Alt+X: her chat, with the text you have selected already in it
hl.bind("SUPER + ALT + X", hl.dsp.exec_cmd("capri --ask-selection"))
