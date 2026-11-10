# Capri architecture and learning plan

## Inspected baseline

- Upstream: `https://github.com/mochiiwuff/capri-desktop`
- Inspected commit: `c011764ca1fdbd191925321e3aaa8af5b84babe8` (`main`, version 0.5.2)
- Working copy: the fork `tiagoportes-droid/capri-desktop`, branch `feature/capri-autonomous-learning`
- The tracked tree has 115 entries. It is an existing Electron desktop companion; this work extends it in place.

## Existing architecture

### Desktop and process boundary

- `src/main/main.js` owns Electron startup, the transparent overlay and tray, config projection, dialogs, app lifecycle, the local event bridge, screen capture, and IPC handlers.
- `src/preload.js` exposes a fixed `window.host` API through `contextBridge`; `src/main/bridge.js` accepts hook events on loopback (`127.0.0.1`) and rejects browser-origin requests.
- `src/main/config.js` stores settings under Electron `userData/config.json`. Renderer config deliberately omits API-key values; `src/main/setup.js` uses Electron `safeStorage` for provider keys where available.
- `src/main/main.js` stores chat history and the Claude Code session separately in `userData/memory.json`. The renderer keeps up to 60 chat messages there; the existing custom-memory list is `config.memories` (up to 30 entries). These stores must be migrated additively, not replaced.
- Phase 1 adds `config.learningEnabled` (default `false`) and a separate `config.learningEntries` list (maximum 100). The existing `config.memories` list and `memory.json` history are not imported or overwritten as learned facts.

### Renderer, character, and abilities

- `src/renderer/index.html` loads the ES-module app. `src/renderer/js/app.js` composes the feature objects and connects config/events to the UI.
- `brain.js` interprets Claude Code, Codex, and Antigravity hook events; `mission.js` tracks daily coding activity; `chat.js` handles conversation, `bond.js` tracks relationship state, and `custom.js` edits the user's name, persona, lines, and explicit memories.
- `look.js` controls the existing on-demand and optional periodic screen-look feature. `main.js` captures the target display in memory and expires the temporary capture after two minutes; it is not written to disk. The current implementation does not provide the requested sensitive-window exclusion or a separate pause/history control yet.
- Windows metadata and positioning are handled by `src/main/windows.js` and `windows.ps1`; PC activity/health reactions are in `pc.js` and `upkeep.js`. These are not keyloggers and should remain metadata-only if reused for learning.
- `care.js`, `system.js`, `devices.js`, `setups.js`, `apps.js`, `launch.js`, and `files.js` implement PC actions. Destructive or consequential actions use Capri's existing confirmation/button flows; preserve those gates.
- `sprite.js` renders the cut-out in WebGL, `acting.js` defines frame-by-frame exposure sheets, `capri.js` runs movement and character states, and `fx.js` draws effects and cut-ins. Original art and animation assets are under `assets/`; generated-art tools are under `tools/`.
- `voice.js` handles sound cues. The current release uses blips; the recent voice implementation was reverted in upstream history.
- `lines.js` holds localized UI and dialogue for French, English, Spanish, Brazilian Portuguese, and Russian. New user-facing controls should reuse these translations.
- `hooks/` and `scripts/install-*.js` install/remove supported coding-assistant hooks; the existing Node test suite is `tests/hooks.test.js`.

### Data-flow sketch

```text
Claude/Codex/Antigravity hooks ──loopback HTTP──> main process ──IPC──> Brain / Mission / panel
User chat ──preload host API──> main process ──selected local/cloud model──> renderer chat
User chat ──local opt-in classifier──> candidate preview ──user accepts──> local learningEntries
User settings ──main process config──> renderer config (never API-key values)
Screen look ──explicit existing permission──> temporary in-memory capture ──selected model──> answer
```

## Extension boundaries

- Conversation learning is implemented in the independent `src/renderer/js/learning.js` module, composed by `app.js` and called from `chat.js`. It is off by default; the tray checkbox pauses/resumes it, and the customization guide reviews, corrects, and deletes learned entries.
- New entries stay in `config.learningEntries`, with ID, category, explicit/reviewed evidence, confidence, timestamps, and optional expiry. Projects expire after 180 days and interests after 365 days. Existing custom memories and the old transcript remain separate.
- Phase 1 only proposes recognized explicit statements in supported patterns across the five existing UI languages. Candidates are shown with category/evidence and require a click to accept; inferred notes are represented in the schema but are not generated yet. Sensitive-content filters are heuristics, not a complete detector.
- Sensitive-looking new chat turns are omitted from the cross-restart transcript as placeholders; the live turn remains available to Capri. Accepted learned notes enter future chat prompts, so a configured online model may receive them as ordinary chat context.
- Keep Windows learning limited to authorized foreground-app metadata and aggregate durations. Do not capture keystrokes, clipboard contents, message text, or raw screenshots.
- Reuse the existing screen-recognition path, but add explicit independent consent, visible active state, pause, a never-look list, and sensitive-window checks before extending any capture behavior.
- Keep autonomous improvement out of the live runtime: operate on a separate worktree/branch, snapshot before edits, constrain test commands, inspect the diff, and recover on failed regression. No arbitrary downloaded code, uncontrolled self-execution, force-push, or edits to `main`.
- Discord and WhatsApp are opt-in outbound/inbound adapters using their official APIs. Add allowlisted recipients, rate limits, quiet hours, pause/disconnect, and never put credentials in source or committed config. WhatsApp must document Business Cloud API/provider verification and template constraints.

## Planned implementation order

1. **Complete:** inspect/document and establish the fork/feature branch.
2. **Implemented, tested, and pushed:** conversation learning with typed explicit candidates, opt-in review/correction/deletion/expiry, and sensitive-turn transcript redaction.
3. **Next:** opt-in Windows foreground-app metadata learning.
4. Pending: authorized screen context with privacy exclusions and immediate pause.
5. Pending: additive integration with existing memory.
6. Pending: bounded self-improvement workflow with backup, diagnostics, tests, and rollback.
7. Pending: official Discord bot adapter and authorized commands.
8. Pending: official WhatsApp Business Cloud API/provider adapter.
9. Pending: desktop controls, visible status, recipients, quiet hours, limits, and disconnect.
10. Pending: regression/privacy tests and installation/API documentation.

Each stage must be tested and committed on `feature/capri-autonomous-learning` before being called complete.
