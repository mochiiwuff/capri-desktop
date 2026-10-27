# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-10-27

### Added
- **Native Linux X11 Support**: Full window tracking, sitting, and possession support on Linux running X11.
  - Native X11 window watcher helper (`src/main/windows-linux.c`) monitoring window hierarchy, active window, geometry, and frame extents.
  - Seamless fallback to `wmctrl` and `xprop` if the native C helper cannot be compiled.
  - Automatic compilation on launch or via `npm run build:linux` / `node scripts/build-linux.js`.
- **Cross-Platform Application Management**:
  - List running GUI desktop applications on Linux via X11 client inspection (with `wmctrl` fallback).
  - Graceful application termination on Linux using `_NET_CLOSE_WINDOW` X11 ClientMessage (preserving unsaved user work), with fallback to standard signals.
- **Cross-Platform Cursor Hit-Testing**:
  - Global pointer query on X11 (`src/main/cursor-linux.c` / `src/main/cursor.js`) via Node-API addon with zero polling overhead and fallback to Electron `screen.getCursorScreenPoint()`.
  - High-precision hit-testing loop (30ms) allowing Capri, speech panel, and biochip interactions even when the window has click-through enabled on Linux.
- **Enterprise Build & Release Automation**:
  - Linux packaging targets configured in `package.json` (`AppImage`, `tar.gz`).
  - GitHub Actions CI matrix workflow (`.github/workflows/ci.yml`) testing Linux and Windows builds.
  - Automated release workflow (`.github/workflows/release.yml`) triggered on version tags.
  - Pull request and issue templates (`.github/`).

### Changed
- Overlay window options adapted for Linux: using `type: 'utility'` on Linux to avoid window manager decoration issues, and tailored mouse event forwarding.
- Start at login menu label adapted dynamically for Linux desktop environments.
- Input focus management refined to ensure seamless chat input focus across Linux desktop environments (XFCE, GNOME, KDE Plasma).

### Fixed
- Fixed transparent click-through event dropping on Linux where Electron does not support mouse event forwarding.
- Fixed panel hit-test padding to prevent pointer flickers near UI edges.

---

## [0.4.3] - 2026-10-26

### Added
- Launch websites and streaming services by name directly from Capri's chat.

## [0.4.2] - 2026-10-26

### Added
- Display settings for multi-monitor setups and black screen recovery.

## [0.4.1] - 2026-10-25

### Added
- Google Gemini provider support for chat.
- Improved persona stability and taskbar foreground persistence.

## [0.4.0] - 2026-10-25

### Added
- Antigravity (AGY) and OpenAI Codex adapter integrations alongside Claude Code.
- Multi-provider chat support (local, cloud, keyless gateways).
- App launching and system wake-from-sleep handling.

## [0.3.2] - 2026-10-24

### Added
- Taskbar resting animation and standalone mode without Claude Code.

### Changed
- Refined introduction sequence: smoother animations and cleaner transitions.

## [0.3.0] - 2026-10-25

### Added
- **Talk to her**: Direct chat with Capri via local Ollama models.
- **Mission report**: Activity and event statistics summarized for the session.
- **Thinking ticker**: Visual countdown and activity ticker while Claude Code processes long-running tasks.
- **Screen grab intro**: Dynamic intro sequence where Capri grabs the screen edges.

## [0.2.0] - 2026-10-24

### Added
- Window possession animation: Capri dives into windows with lightning and glitch effects.
- Enhanced sound effects and voice synthesis options.

## [0.1.1] - 2026-10-23

### Added
- Claude's whole answer displayed in a scrolling panel when working on another window.

## [0.1.0] - 2026-10-22

### Added
- Initial public release of Capri desktop companion for Claude Code.
- Windows installer with Electron Builder (NSIS).
- Claude Code hooks for session events and interactive desktop notifications.
