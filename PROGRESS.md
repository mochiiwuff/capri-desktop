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
