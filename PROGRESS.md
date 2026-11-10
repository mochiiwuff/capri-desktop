# Capri autonomous learning — progress

## Current position

- **Completed:** inspected the latest upstream tree and commit; made a full local Git bundle backup; created the GitHub fork and `feature/capri-autonomous-learning`; verified that the branch starts at upstream `main` commit `c011764ca1fdbd191925321e3aaa8af5b84babe8`; documented architecture; implemented phase 1 conversation learning.
- **Current phase:** phase 2 — authorized foreground-application metadata learning.
- **Latest verified implementation commit:** `6eb5b6d56f2636dce985c4a3f927cfd8fc2eacb0` (`feat: add opt-in local conversation learning`); the remote feature-branch SHA was checked and matches.
- **Next exact step:** recheck upstream `main` for movement, then inspect `src/main/windows.js` and `src/main/windows.ps1` and design opt-in aggregate app-duration records without titles, keystrokes, clipboard, or message contents.

## Verification

- Baseline `npm run test:hooks`: **5 passed, 0 failed**.
- Phase 1 `npm run test:learning`: **10 passed, 0 failed**.
- Post-change `npm run test:hooks`: **5 passed, 0 failed**.
- `node --check src/main/main.js`, renderer-module syntax checks, JSON parsing, and `git diff --check`: passed.
- `npm ci`: completed; npm reported 6 moderate dependency audit findings (not changed as part of the baseline).
- Original repository `main`: untouched.
- Fork branch: `feature/capri-autonomous-learning`; phase 1 is the first source-code change.
- Conversation learning remains disabled until the user opts in. Current detection is explicit pattern matching, not unrestricted model inference.
- Working tree is clean after the verified push. The source repository and both `main` branches remain untouched.

## Pending phases

1. **Complete:** conversation learning and review controls.
2. Authorized foreground-app metadata learning.
3. Screen-context privacy controls and exclusions.
4. Additive memory integration and migration tests.
5. Bounded self-improvement engine and recovery tests.
6. Discord official API integration.
7. WhatsApp Business Cloud API/provider integration.
8. Desktop privacy, status, recipient, quiet-hours, limits, and disconnect UI.
9. Full regression, privacy, platform, and setup documentation.

## Resume protocol

At the start of a new session, read `PROGRESS.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, and `TODO.md`; check the latest commits on this fork's feature branch and the upstream `main` before editing. Continue only on `feature/capri-autonomous-learning`. Never push to either repository's `main`.
