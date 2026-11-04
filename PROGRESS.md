# Linux and Thai support progress

Updated: 2026-11-04

- Approved scope: Linux desktop/AppImage, Thai interface and chat, platform limitations, tests, and GitHub checkpoints.
- Upstream: https://github.com/mochiiwuff/capri-desktop at cb33e87; local branch `codex/linux-thai`.
- Environment: Ubuntu x86_64, Wayland, Node 24.21.0. Upstream window tracking and some desktop actions are Windows-only.
- Stage: baseline checkout complete; dependency installation and GitHub fork creation in progress. No functionality has yet been verified.
- Next: inspect localization and Linux paths, implement, run tests, build and launch, save checkpoints and push the branch to a personal fork.
- Acceptance remains open: Thai coverage and persistence, real UI/chat/hooks operation, AppImage build and execution. Wayland overlay limitations require live verification.

## Checkpoint 1

- Fork confirmed: https://github.com/MrLaPlus/capri-desktop (parent `mochiiwuff/capri-desktop`, write access confirmed).
- Added Linux AppImage target, Thai tray language, Thai font and model prompt, plus a partial Thai translation. Untranslated strings deliberately fall back to English; this is incomplete and must not be called full Thai support.
- `npm ci` succeeded; npm reported 15 moderate dependency advisories. `npm run test:hooks` passed 5 tests. AppImage build is running; no GUI or chat verification yet.
- Next: finish Thai translation, guard unsupported Linux features, build and test real UI, persist language and launch after restart, verify chat/hooks with a configured provider, update this file and push.

## Checkpoint 2

- Fork attribution added to README, preserving the upstream license. Thai text expanded, including Codex and Antigravity onboarding; Windows-only window tracking controls and Linux startup setting disabled on Linux.
- `npm run test:hooks`: 5/5 passed again. Node syntax checks passed for main, labels, Thai and lines; every English tray key exists in Thai.
- `npm start` failed before app startup: Electron binary download failed (`TypeError: fetch failed`). `npm run dist:linux` reached Electron download then stalled; cancelled. `curl -IL --max-time 20` reached GitHub redirect but timed out reaching `release-assets.githubusercontent.com`. No AppImage or GUI verification yet.
- Thai localization is incomplete. `th.js` deliberately falls back to English for untranslated nested keys; core menus, chat, setup, onboarding and several status texts are translated, but coverage needs review and completion. Thai action parsing is not implemented.
- Next: restore access to Electron release assets and install the Electron binary, run `npm start`, build and run `npm run dist:linux`, test Wayland and/or X11 interaction and Thai glyphs, verify language survives a restart and test chat with a configured provider. Finish translation, audit Linux-specific features and update README for actual supported behavior. Re-run hooks tests after changes.
- User requested continuous checkpoints and pushes to the fork branch. Upstream `main` is cb33e87. First pushed checkpoint: 661166a on `origin/codex/linux-thai`.

## Checkpoint 3

- Expanded Thai chat actions, setup and customization messages; untranslated strings still fall back to English. The most recent hooks test again passed 5/5 and `git diff --check` passed.
- GitHub accepted checkpoint 2 (`367a7bc`) after a transient server rejection. Continue from the newest commit on `codex/linux-thai`; the build/runtime and translation limitations above remain open.

## Checkpoint 4

- Added Thai translations for all keys in the English renderer dictionary, including nested chat, setup, guides, screen consent and PC/status text; Thai tray keys are complete. A structural key comparison reported no missing keys. Some phrases intentionally have fewer variants than English. Translation quality, placeholders, text overflow and platform-specific wording still require review in the running UI. English fallback remains defensive.
- Existing hooks tests passed 5/5 after the additions; `git diff --check` passed. Checkpoint 3 (`2edd773`) is confirmed pushed. Runtime/AppImage remains blocked by Electron release-asset connectivity, and actual Linux chat and UI behavior remain unverified.
- Resume with the newest branch commit. First retry Electron download, build and run; then visually verify Thai, saved language after restart, setup/chat, hooks, Wayland overlay and unsupported actions. Revisit Linux desktop integration and translate Thai intent parsing where necessary. Do not claim the acceptance criteria are met until those checks pass.

## Checkpoint 5

- Electron release download recovered. Source app started on this Wayland session and its bridge listened on loopback. `npm run dist:linux` built `dist/Capri-0.5.1.AppImage` successfully.
- Launched the AppImage with `--appimage-extract-and-run` using an isolated test configuration. DevTools inspection confirmed the renderer reached `complete`, a previously selected `th` survived stopping the source app and launching the AppImage, the document language was `th`, and the Thai font reported loaded. This is not a visual inspection or proof of click-through and layout.
- After a structural placeholder audit, restored `{name}` and `{rival}` where missing. A rebuilt AppImage is in progress. Existing hook suite passed 5/5 again, and `git diff --check` passed. npm reports 15 moderate advisories; not remediated in this task.
- Remaining: visual/manual test of the character, menus, Thai tone/line layout and Wayland click-through; live AI conversation with an available provider; Thai intent parsing; Linux feature audit. Window tracking/possession and many PC actions remain Windows-only. Build warning: desktopName not configured; integration with a desktop launcher is unverified.

## Checkpoint 6

- AppImage rebuild after placeholder fixes succeeded. Checkpoint `c225dfc` verified on GitHub. `ollama` is installed but its local server was not running and no local model manifests were found; a real AI chat was not tested. No model was downloaded.
- Remaining validation and Linux limitations from checkpoint 5 still apply. The AppImage remains local in `dist/` (gitignored); source and progress are pushed to the fork branch.

## Checkpoint 7: invisible character after startup

- User reported that no character appeared on KDE Wayland. Reproduced an invisible sprite with WebGL uniform `uAlpha=0` after the intro. A slow frame can jump past the intro landing cue and expire the effect before its promise resolves, leaving the character invisible.
- Fixed `src/renderer/js/fx.js` so expiry resolves the intro as well as its normal landing cue. A clean software-rendered X11 test proceeded to `uAlpha=1` and a renderer capture showed the character; a separate native Wayland test also reached `uAlpha=1`. Actual compositor appearance and mouse interaction on the user's running instance remain to be confirmed after restart.
- `npm run test:hooks` passed 5/5; `git diff --check` passed. Rebuilding the AppImage. The previously running AppImage process must be closed and the rebuilt file launched again to load the fix.

- The rebuilt AppImage finished successfully and, when launched with an isolated profile on Wayland, its character WebGL alpha reached 1. The fix was pushed as `690b253`. User confirmation of visibility and interaction on their desktop is still pending.
