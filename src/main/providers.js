'use strict';

const fs = require('node:fs');
const path = require('node:path');
const claude = require('../../scripts/install-hooks');
const codex = require('../../scripts/install-codex-hooks');

function resolveProvider(preference) {
  if (preference === 'codex' || preference === 'claude') return preference;
  if (codex.status().events.length) return 'codex';
  if (claude.status().installed) return 'claude';
  return fs.existsSync(path.dirname(codex.status().file)) ? 'codex' : 'claude';
}

function provider(preference) {
  const id = resolveProvider(preference);
  return {
    id, name: id === 'codex' ? 'Codex' : 'Claude Code',
    hooks: id === 'codex' ? codex : claude,
    help: id === 'codex' ? 'https://learn.chatgpt.com/docs/hooks' : 'https://code.claude.com/docs/en/quickstart',
  };
}

module.exports = { provider, resolveProvider };
