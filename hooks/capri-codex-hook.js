#!/usr/bin/env node
'use strict';

// Translate Codex lifecycle hooks into Capri's existing event vocabulary.
// Observe only: never return an approval decision or block a turn.
const { run } = require('./capri-hook');

function adapt(evt) {
  if (!evt || typeof evt !== 'object' || typeof evt.hook_event_name !== 'string') return null;
  const out = { ...evt, session_id: `codex:${evt.session_id || 'default'}` };
  if (evt.hook_event_name === 'PermissionRequest') {
    out.hook_event_name = 'Notification';
    // This precedes approval resolution; another hook/reviewer can handle it without a UI prompt.
    // The payload does not establish that the human is being asked, so do not raise a sticky alert.
    out.notification_type = 'permission_review';
    out.message = 'Codex is checking tool permissions.';
  }
  if (evt.tool_name === 'apply_patch') {
    out.tool_name = 'Edit';
    const files = [...String(evt.tool_input?.command || '').matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)].map((m) => m[1].trim());
    out.tool_input = { file_path: files[0], file_paths: files };
  }
  if (evt.tool_name === 'exec_command' || evt.tool_name === 'shell_command') {
    out.tool_name = 'Bash';
    out.tool_input = { ...evt.tool_input, command: evt.tool_input?.cmd || evt.tool_input?.command };
  }
  if (evt.hook_event_name === 'PreToolUse' && evt.tool_name === 'request_user_input') {
    out.hook_event_name = 'Notification';
    out.notification_type = 'agent_needs_input';
    out.message = evt.tool_input?.questions?.map((q) => q.question || q.title).filter(Boolean).join('\n') || 'Codex needs your input.';
  }
  return out;
}

module.exports = { adapt };
if (require.main === module) run(adapt);
