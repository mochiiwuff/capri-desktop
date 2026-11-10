# Remaining work

## Phase 1 — conversation learning

- [x] Implement an independent, opt-in local learning engine for recognized explicit preferences, corrections, interests, projects, communication style, and supported facts.
- [x] Keep categories/evidence distinct; retain confidence and timestamps; require review before accepting candidates.
- [x] Add review, correction, duplicate handling, expiry, deletion, clear-all confirmation, and independent enable/pause controls.
- [x] Do not propose content matching sensitive-content filters or import existing chat history as learned notes; redact matching new turns from persistent transcript history.
- [x] Add focused unit tests and verify the existing hook regressions still pass.
- [ ] Broaden statement coverage carefully; current pattern rules are heuristic and do not create inferred notes.

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
