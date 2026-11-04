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

## Checkpoint 8: Linux pointer input

- User reported that Capri is visible but cannot be clicked directly. Electron documents that `setIgnoreMouseEvents(..., {forward:true})` does not forward pointer movement on Linux and `screen.getCursorScreenPoint()` is unavailable on native Wayland.
- Added Linux hit testing by polling the global pointer with X11 and changed a Wayland session with an X display to relaunch using XWayland. On a separate Xvfb display with X11 explicitly selected, XTest mouse motion and clicks reached the sprite (`mousedown`, `mouseup`, `click` recorded); hooks tests are being repeated. User's real desktop interaction and click-through still require confirmation.
- An initial AppImage restart test failed because `--appimage-extract-and-run` deletes its extracted runtime when the first process exits. Changed restart to use the original AppImage path and extract again. Rebuilding and testing this correction; do not claim automatic packaged restart works until confirmed.

## Checkpoint 9: packaged launch correction

- Removed the attempted automatic relaunch from checkpoint 8: although it started, the relaunched process did not reliably report the X11 pointer position in the isolated test. Native Wayland still cannot provide global pointer polling.
- Supported test path: start Electron/AppImage with `--ozone-platform=x11` on a system with XWayland. In the isolated X11 test, synthetic motion reached the global cursor API and clicks reached the sprite. The Linux 60 ms hit-test poll keeps empty areas click-through. Real KDE interaction still requires user confirmation.
- Rebuilding the AppImage and repeating the hooks suite with this change. Use `Capri-0.5.1.AppImage --appimage-extract-and-run --ozone-platform=x11` after the build finishes; close any earlier instance before starting it.

## Checkpoint 10: final package verification status

- Rebuilt AppImage after removing automatic relaunch. `npm run test:hooks` passed 5/5. Source execution on isolated X11 received synthetic clicks on the sprite. AppImage launched with X11 arguments, but synthetic click verification on the packaged build did not succeed in the isolated setup; its pointer API reported the center of the screen. Root cause is not yet confirmed. Do not claim the packaged click issue is fixed without a live retest.
- On KDE Wayland, try running with `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 ... --appimage-extract-and-run --ozone-platform=x11` after closing previous instances. If clicks still fail, investigate XWayland pointer position and AppImage startup using an isolated debug profile. User data/config was not modified during these tests.

## Checkpoint 11: X11 input regions

- User confirmed the previous XWayland launch still could not click the character. Replaced global-pointer hit polling with an X11 input region managed by a Python 3 helper using libX11/libXext. Character canvas, visible chip/mask and chat panel get input; other parts pass clicks through. During dragging the region temporarily covers the overlay. Python 3 and those libraries are runtime dependencies. The helper is included outside app.asar in the AppImage.
- On an isolated Xvfb display, the packaged AppImage created a non-fullscreen X11 input shape. XQueryPointer identified the Capri window at a point within that shape and no window at an empty-screen point. This confirms X11 targeting, not that a full click/drag interaction works on KDE Wayland; real desktop confirmation remains necessary. The rectangular canvas region may intercept clicks on transparent pixels near the character. Native Wayland input remains unsupported.
- `npm run test:hooks` passed 5/5; syntax and diff checks passed. Final AppImage build succeeded. Changes were pushed as f5a82e1. Launch with the documented X11 environment after closing the previous process.

## Checkpoint 12: repeated dragging and keyboard/paste

- User confirmed initial clicking/dragging works but stops shortly afterward, and the AI-key field cannot type or paste. Reproduced the keyboard failure on isolated X11: the input was the DOM active element, but `document.hasFocus()` was false, native focus remained at PointerRoot, and native key events added zero characters. Electron's installed API marks `setFocusable()` as Windows/macOS only. Linux now creates a focusable window and focuses its web contents when text entry opens; closing entry blurs it without calling unsupported focusability toggles.
- Source tracing also found the upstream 25-second pickup refusal after repeated throws. Linux now leaves pickup available through this cooldown; other platforms keep the upstream behavior. This explains a possible temporary lock, but the exact state of the user's previous process was not captured. Native focus/rearm cycles did not independently reproduce the reported mouse failure in the isolated test.
- Refresh X11 input regions at least every 500 ms even while stationary, and keep the Linux helper's input shape when rearming. Added the native edit context menu for editable fields, while preserving sprite context-menu behavior.
- Added `scripts/test-linux-input.py`, which starts its own Xvfb and disposable profile, drives native XTest events and never drives the real desktop pointer. Source run passed native secret-field typing, Thai Ctrl+V, and five native drags through cooldown/focus/rearm cycles. Expanded final test also checks keyboard restoration after those cycles; packaged run pending final build. Hooks suite passed 5/5; main syntax and diff checks passed. No real API key was used or submitted.
- Final AppImage build is running. Real KDE/XWayland typing, menus and sustained drag behavior still need user confirmation after restarting the rebuilt file.

### Checkpoint 12 final package result

- Final AppImage build succeeded after all changes. `python3 scripts/test-linux-input.py --appimage dist/Capri-0.5.1.AppImage` passed all four checks: native typing into the masked key field, native Ctrl+V with Thai clipboard text, five native drags despite an active throw cooldown plus focus/rearm cycles, and typing again after closing/reopening entry following those drags. The test ran in a disposable Xvfb/profile and did not touch the user's pointer or provider settings.
- Implementation is pushed as `fe74ba0`; local `dist/Capri-0.5.1.AppImage` contains it. Restart the previous instance using the X11 launch command to load it. KDE compositor and actual Thai keyboard/IME behavior are still subject to real desktop confirmation; Thai clipboard insertion was verified. Input context-menu behavior is implemented but was not independently clicked in the automated test.

## Checkpoint 13: Gemini API verification

- User reports Gemini API key verification returns to the key entry screen. The reported `GetVSyncParametersIfAvailable` messages are graphics presentation logs and do not identify the provider error. No real API key was read or tested.
- The Gemini endpoint in code matches Google's published OpenAI-compatible model-list endpoint. A request with a fake key reached Google and returned a 400 response after approximately 8.3 seconds once; a separate Node request returned in about 1.9 seconds. The previous 5-second cloud model-list timeout could therefore reject a slow connection, but the actual failure cause for this user is unconfirmed.
- Increased model-list timeout for cloud providers to 30 seconds; local providers retain 5 seconds. Timeouts now explain that model verification timed out, and Thai and English setup labels say verification failed rather than assert the key is invalid. The service's returned error remains visible. Two targeted tests pass (slow Gemini response over 5 seconds and actual error propagation); hooks tests pass 5/5, and syntax/diff checks pass. Final AppImage build succeeded. Live success with the user's key and Google account remains unverified. Initial GitHub push failed because github.com could not be resolved; retry pushing the local commits.
