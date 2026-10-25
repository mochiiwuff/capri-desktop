#!/usr/bin/env node
'use strict';

// Codex lifecycle hooks -> the same display events used by the Claude adapter.
// Never return a permission decision or inject text into the conversation.
const { slim, run } = require('./capri-hook');

const EVENTS = new Set([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest',
  'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact',
  'SessionEnd', 'Interrupt',
]);

function failure(response) {
  if (typeof response === 'string') {
    // Unified exec's model-facing result; don't classify arbitrary "error" text.
    const match = response.match(/^(?:Process exited with code|Process exit code|Exit code:)\s*(-?\d+)\b/m);
    if (match && Number(match[1]) !== 0) return response.slice(0, 1000);
  } else if (response && typeof response === 'object') {
    if (response.isError === true || (Number.isInteger(response.exit_code) && response.exit_code !== 0)) {
      return String(response.output || response.content?.find?.((item) => item.type === 'text')?.text || 'Tool failed').slice(0, 1000);
    }
  }
  return null;
}

function normalize(evt) {
  if (!evt || typeof evt !== 'object' || Array.isArray(evt) || !EVENTS.has(evt.hook_event_name)) return null;
  const input = evt.tool_input && typeof evt.tool_input === 'object' ? evt.tool_input : {};
  // Allow display metadata only. Unknown MCP arguments may contain credentials or
  // source content, so don't copy the whole arguments object.
  const tool_input = {};
  for (const key of ['description', 'file_path', 'path', 'pattern', 'url', 'query', 'subagent_type']) {
    if (typeof input[key] === 'string') tool_input[key] = input[key];
  }
  let files;
  if (evt.tool_name === 'apply_patch') {
    const patch = typeof evt.tool_input === 'string' ? evt.tool_input : input.command || input.patch || '';
    files = [...new Set([...String(patch).matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)\r?$/gm)].map((match) => match[1].trim()))];
  } else if (evt.tool_name === 'Bash' || evt.tool_name === 'exec_command') {
    tool_input.command = input.command || input.cmd;
  }
  const out = slim({ ...evt, provider: 'codex', tool_input });
  if (files) out.tool_input.files = files.slice(0, 128).map((file) => file.slice(0, 280));
  if (evt.hook_event_name === 'PermissionRequest') {
    out.hook_event_name = 'Notification';
    out.notification_type = 'permission_prompt';
    out.message = String(input.description || `Codex needs approval for ${evt.tool_name || 'a tool'}`).slice(0, 280);
  }
  if (evt.hook_event_name === 'PostToolUse') {
    const error = failure(evt.tool_response);
    if (error) {
      out.hook_event_name = 'PostToolUseFailure';
      out.error = error;
    }
  }
  return out;
}

module.exports = { normalize };
if (require.main === module) run(normalize);
