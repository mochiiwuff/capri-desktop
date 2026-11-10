# Changelog

## Unreleased

- Documented the existing Capri architecture, privacy boundaries, learning extension points, and staged implementation plan.
- Established a full local repository backup and the `feature/capri-autonomous-learning` development branch in a personal fork.
- Verified the original hook regression tests before making code changes.
- Added opt-in, local conversation learning for explicit preferences, corrections, interests, projects, communication style, and supported durable facts.
- Added user-reviewed category/evidence prompts, duplicate prevention, local expiry, correction, individual deletion, and confirmed clear-all.
- Kept the new learned store separate from existing custom memories and chat history; sensitive-looking new turns are redacted from the saved transcript.
- Added learning/privacy regression tests and documented that accepted notes are included in future selected-model chat prompts.
