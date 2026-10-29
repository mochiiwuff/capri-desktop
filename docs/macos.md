# macOS support

Capri keeps the same Electron renderer and hook protocol on both desktop platforms. macOS-specific integrations use a small Swift/AppKit helper; the existing Windows PowerShell helper, Start menu/media-key paths, and NSIS installer remain in place.

## Requirements and running from source

- macOS 13 or newer, Apple Silicon or Intel.
- Node.js 20 or newer for source development.
- Apple's Command Line Tools: run `xcode-select --install` once if needed.

```sh
npm ci
npm start
```

`npm start` and `npm run dev` compile the helper for the current architecture before starting Electron. The helper build is a no-op on Windows/Linux. No Homebrew or Swift runtime installation is needed for the packaged app.

The menu is in the macOS menu bar and on Capri's right-click menu. **Command+Option+C** stows/restores her. **Command+Q** quits her. Chat and setup fields use native Edit shortcuts including paste and select all. Login startup is offered in the packaged app only; move it to its intended location before enabling it.

## Native integrations and permissions

- **Window tracking:** Quartz lists window IDs and bounds in logical points, in front-to-back order. This helper does not request screenshots, window titles, or window contents. Maximized/fullscreen windows are not perches. Changes of Space, minimized/closed windows, and windows moved between displays are reflected by polling. This path does not intentionally request Screen Recording or Accessibility permission. AI-title detection, game detection, and USB/device reactions remain Windows-only.
- **App launching:** discovers `.app` bundles in `/Applications`, `/System/Applications`, and `~/Applications`, plus installed Steam manifests. A launch request must match an item in that inventory; paths are passed as individual arguments, never shell commands. Windows-specific Epic manifests and Start menu shortcuts remain Windows-only.
- **Files and folders:** opens Finder, Trash, and the usual user folders through macOS. File search uses the existing bounded search of common folders by filename/type; Windows Search content indexing remains Windows-only. Desktop app bundles, scripts, and installers require the existing confirmation button before opening.
- **Screen pictures:** the separate screenshot and optional screen-commentary features use Electron screen capture and may require Screen Recording permission on macOS. Screen commentary has its own consent flow and sends the image to the selected provider. This is separate from metadata-only window tracking; leave it off for model-free QA.
- **App closing:** lists regular running applications by bundle ID. A confirmed close asks the app to terminate normally so it can ask to save work. Force quit remains a second explicit confirmation. Finder, system components, Capri/Electron, the coding assistants, and Ollama are excluded.
- **Media keys:** macOS requires Accessibility access for synthetic media key events. This is requested only after a media action. If denied, chat explains the requirement; the menu links to the relevant System Settings page. Play/pause toggles playback, as on Windows.
- **Ollama:** detects the app in system/user Applications and common CLI locations, and opens the macOS app on request. Installing it is a manual download from [Ollama](https://ollama.com/download). Starting Claude Code/Codex through Ollama opens Terminal and may ask for macOS Automation permission. Denial is reported in the setup panel.
- **API keys:** Electron `safeStorage` uses the macOS Keychain. If it is unavailable, new keys are rejected rather than saved in plaintext. Chat history and other preferences are stored locally as ordinary JSON; keys are not returned to the renderer. Sending chat to a remote provider sends its conversation/context to that provider, as on Windows.

The overlay stays out of the menu bar. Screen-edge resting extends to the bottom of the display, with a bottom Dock acting as the ledge. A side Dock remains outside the overlay. Dock auto-hide, Spaces/fullscreen transitions, scaling, and display changes require manual validation on each target setup.

## Packaging

```sh
npm run dist:mac
```

This builds a universal helper and universal DMG/ZIP in `dist/`. The helper ships in `Capri.app/Contents/Resources/capri-macos`, outside ASAR, so installed users do not need a compiler. `npm run dist` continues to build the existing Windows NSIS installer.

CI builds ad-hoc-signed macOS test artifacts and a Windows installer; it does not publish a release. Ad-hoc signatures are not Developer ID signatures or notarization. For public distribution, configure electron-builder with the maintainer's signing/notarization credentials. Never add credentials to this repository.

## Performance bounds

The window helper polls every 150 ms, emits only changed snapshots, and includes at most 40 windows. Each snapshot reads display geometry once and serializes JSON once. Concurrent installed-app requests share one scan, with successful inventories cached for ten minutes; failed scans can be retried.

The fallback file search streams directory entries asynchronously and yields to the main event loop every 256 entries. It processes at most 40,000 entries, collects at most 24 candidate matches, descends at most five levels, and returns up to eight results. Hidden and dependency folders are skipped. Windows still tries its search index first; these limits apply when falling back to folder traversal.

## Validation and review

`npm test` runs hook integration and platform-boundary regressions on macOS, Windows, and Linux in CI. These check the existing Windows routing, macOS point coordinates and negative display origins, Dock/taskbar geometry, translation isolation, launch allowlists, and Terminal error handling. CI packaging is a build check, not proof that the desktop interactions work.

Manual acceptance checklist for an isolated macOS VM (8 GB RAM or less):

- Launch from source, then the packaged app; confirm transparent background and no unexpected permission prompts.
- Click through empty areas, click/right-click Capri, drag her, open and dismiss panels, type/paste/select all, and press Escape.
- Test tray actions, stow/restore shortcut, quit/relaunch, saved preferences, and login startup in the installed app.
- Open a disposable window; perch, move, minimize, restore, and close it. Exercise the demo window.
- Test normal app launch, confirmed quit with an unsaved document, and cancellation. Use only disposable apps for force quit.
- Deny then allow media/Terminal permissions; verify visible failure and successful retry.
- Test first-run Ollama absence, installed-but-stopped state, and model setup separately. Do not use real API keys for UI tests.
- Test Dock positions/auto-hide, reduced motion, sleep/wake, Spaces/fullscreen, and multiple display/scaling layouts where available.

Windows acceptance still needs a Windows VM/PC: click-through after sleep/unlock, taskbar rest/foreground raising, PowerShell window tracking, Start menu/Steam/Epic launching, media keys, winget Ollama setup, NSIS install/startup, and hook install/uninstall. Do not infer these passes from macOS or mocked tests.

Current status (October 28, 2026): the branch incorporates upstream v0.4.4 (`3e6f529`) and its Windows behavior. All 40 automated tests passed locally, including scan budgets, event-loop responsiveness, directory cleanup, concurrent discovery/retry, panel reactivation, OpenAI model filtering, and billing/rate-limit error classification. Current hosted results and downloadable packages are on the [branch's Actions page](https://github.com/boBananaa/capri-desktop-macos/actions?query=branch%3Amacos-support). Earlier [hosted validation of `5c88ea8`](https://github.com/boBananaa/capri-desktop-macos/actions/runs/40588367181) passed all three OS test jobs and both package builds. Packaged build `b959798` was exercised in an isolated macOS 26.5.1 guest with 8 GiB RAM: transparent launch, a guest-local Custom provider, complete streamed Unicode text, typing immediately after opening chat from the menu bar, and TextEdit launch worked. Provider settings survived package replacement and relaunch.

A manual report on October 28 confirmed that Play demo appeared to work, but intermittent chat-input focus loss was also reported. Direct clicks on visible Mac chat/setup panels now request native app/window and web-content focus again; this correction has automated coverage and still needs a hands-on retest. Later focus-return and existing-chat refocus corrections have not been exercised in the guest. Automated overlay mouse input was unreliable; physical click-through/dragging, cancellation, native editing shortcuts, window tracking, permissions, startup, and the extended desktop checklist remain unverified. Windows interactive acceptance and signed/notarized distribution are also pending. Source review and successful packaging do not establish those passes.

### Chat UI tests without a model

Inside the disposable VM, start the deterministic fixture:

```sh
CAPRI_QA_GUEST=1 node tests/fixtures/mock-chat.cjs
```

If Node is absent, the installed app's bundled runtime can run the fixture:

```sh
CAPRI_QA_GUEST=1 ELECTRON_RUN_AS_NODE=1 /Applications/Capri.app/Contents/MacOS/Capri tests/fixtures/mock-chat.cjs
```

In Capri, select **Custom** and enter `http://127.0.0.1:47831/v1`. The model badge must say
`capri-qa-mock` before sending a test message. The fixture returns fixed streamed Unicode text;
`long` returns a longer stream for cancellation testing. Only explicit `open TextEdit` and
`close TextEdit` inputs produce those fixed action tags. Use a disposable document.

This fixture binds only to guest localhost and makes no outbound requests. Do not point UI tests
at the host's Ollama service: opening an Ollama chat can preload its selected model before a
message is sent. Keep a separate, empty guest account and avoid real keys and personal files.

### OpenAI chat setup

The OpenAI option uses an API key. The general model catalog includes speech, image, embedding, and specialized endpoint models; these are excluded from Capri's text-chat list. Billing/quota failures (including HTTP 429 credit or spend-limit errors) surface the provider's explanation immediately instead of retrying other models or claiming the servers are busy. A successful model-list lookup does not establish that the account can fund a chat request.
