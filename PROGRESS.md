# Capri autonomous learning — progress

## Current position

- **Completed:** inspected the latest upstream tree and commit; made a full local Git bundle backup; created the GitHub fork and `feature/capri-autonomous-learning`; verified that the branch starts at upstream `main` commit `c011764ca1fdbd191925321e3aaa8af5b84babe8`; installed dependencies and ran the existing test suite.
- **Current phase:** phase 1 — conversation-learning design and implementation.
- **Latest commit:** `c011764ca1fdbd191925321e3aaa8af5b84babe8` (pristine branch base; architecture documents are the next commit).
- **Next exact step:** commit and push the architecture/roadmap files, then add an isolated, locally stored conversation-learning module with explicit candidate review and tests.

## Verification

- Baseline `npm run test:hooks`: **5 passed, 0 failed**.
- `npm ci`: completed; npm reported 6 moderate dependency audit findings (not changed as part of the baseline).
- Original repository `main`: untouched.
- Fork branch: `feature/capri-autonomous-learning`; no changes have been made to source code yet.

## Pending phases

1. Conversation learning and review controls.
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
