# Remaining work

## Phase 1 — conversation learning

- [ ] Implement an independent local learning engine for explicit preferences, corrections, interests, projects, and communication style.
- [ ] Keep facts, preferences, and inferences distinct; retain evidence and confidence.
- [ ] Add user review, correction, duplicate handling, expiry, deletion, and independent learning enable/pause controls.
- [ ] Never automatically save sensitive content or silently convert chat history into memories.
- [ ] Add focused unit tests and verify the existing chat and memory behaviors remain intact.

## Remaining phases

- [ ] Add opt-in foreground application metadata learning only; never keylog or inspect clipboard/message contents.
- [ ] Harden screen look with an independent permission, persistent visible indicator, immediate pause, sensitive/private-window exclusion, never-look list, and no screenshot retention.
- [ ] Integrate learned records additively with existing `memory.json` and `config.memories`; preserve old data.
- [ ] Build bounded, reversible self-improvement with separate worktree, backups, diagnostics, tests, regression recovery, and documentation.
- [ ] Add opt-in Discord bot API messages and commands with recipient allowlist, quiet hours, notification limits, pause, and disconnect.
- [ ] Add opt-in WhatsApp Business Cloud API or supported-provider adapter; document verification and credential requirements.
- [ ] Add desktop controls and visible status for learning and communications.
- [ ] Test all new privacy, memory, code-modification, recovery, integration, and original-functionality cases.
- [ ] Keep `PROGRESS.md` current and commit/push each meaningful tested stage.
