// CAPRI_OPENCODE_PLUGIN
// OpenCode local plugin. Observe only: never change tool arguments or permission decisions.
const PORT = Number(process.env.CAPRI_PORT) || 47823;
const MAX_REPLY = 6000;

function sessionId(value) {
  return value ? `opencode:${value}` : 'opencode:default';
}

function slim(value, depth = 0) {
  if (typeof value === 'string') return value.length > 280 ? `${value.slice(0, 280)}…` : value;
  if (Array.isArray(value)) return depth > 2 ? undefined : value.slice(0, 8).map((item) => slim(item, depth + 1));
  if (!value || typeof value !== 'object' || depth > 2) return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (['content', 'old_string', 'new_string', 'edits'].includes(key)) continue;
    result[key] = slim(item, depth + 1);
  }
  return result;
}

function toolName(name) {
  const known = {
    read: 'Read', write: 'Write', edit: 'Edit', bash: 'Bash', grep: 'Grep', glob: 'Glob',
    webfetch: 'WebFetch', websearch: 'WebSearch', task: 'Task', todowrite: 'TodoWrite',
  };
  return known[String(name || '').toLowerCase()] || name || 'Tool';
}

function toolInput(args = {}) {
  const input = { ...args };
  if (input.filePath && !input.file_path) input.file_path = input.filePath;
  if (input.notebookPath && !input.notebook_path) input.notebook_path = input.notebookPath;
  if (input.commandLine && !input.command) input.command = input.commandLine;
  return slim(input);
}

function createSender() {
  let queue = Promise.resolve();
  return (evt) => {
    const body = JSON.stringify(evt);
    queue = queue.then(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 800);
      try {
        await fetch(`http://127.0.0.1:${PORT}/event`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: controller.signal,
        });
      } catch {
        // Capri may be closed; observing OpenCode must never depend on the desktop app.
      } finally {
        clearTimeout(timer);
      }
    }).catch(() => {});
  };
}

export const Capri = async ({ directory }) => {
  const send = createSender();
  const roles = new Map();
  const prompts = new Set();
  const replies = new Map();
  const cwd = directory || process.cwd();

  const emit = (hook_event_name, id, fields = {}) => send({
    hook_event_name,
    session_id: sessionId(id),
    cwd,
    ...fields,
  });

  return {
    event: async ({ event }) => {
      const props = event?.properties || {};
      if (event?.type === 'session.created') {
        const info = props.info || {};
        emit('SessionStart', info.id, { session_title: info.title });
      } else if (event?.type === 'session.deleted') {
        emit('SessionEnd', props.info?.id || props.sessionID);
        roles.delete(props.info?.id || props.sessionID);
        replies.delete(props.info?.id || props.sessionID);
      } else if (event?.type === 'session.idle') {
        const id = props.sessionID;
        const reply = replies.get(id) || '';
        emit('Stop', id, { last_assistant_message: reply.slice(0, MAX_REPLY) });
      } else if (event?.type === 'session.compacted') {
        emit('PreCompact', props.sessionID);
      } else if (event?.type === 'session.error') {
        emit('StopFailure', props.sessionID, { error: props.error?.message || props.error || 'OpenCode session failed' });
      } else if (event?.type === 'message.updated') {
        const info = props.info || {};
        if (info.id && info.sessionID) roles.set(info.id, info.role);
      } else if (event?.type === 'message.part.updated') {
        const part = props.part || {};
        const role = roles.get(part.messageID);
        if (part.type !== 'text' || typeof part.text !== 'string' || !part.sessionID) return;
        if (role === 'user' && !prompts.has(part.messageID)) {
          prompts.add(part.messageID);
          emit('UserPromptSubmit', part.sessionID, { prompt: part.text.slice(0, MAX_REPLY) });
        } else if (role === 'assistant') {
          replies.set(part.sessionID, part.text);
        }
      } else if (event?.type === 'permission.asked') {
        emit('Notification', props.sessionID, {
          notification_type: 'permission_prompt',
          message: `OpenCode needs approval: ${props.permission || 'tool'}`,
        });
      }
    },
    'tool.execute.before': async (input, output) => {
      emit('PreToolUse', input.sessionID, {
        tool_name: toolName(input.tool),
        tool_use_id: input.callID,
        tool_input: toolInput(output.args),
      });
    },
    'tool.execute.after': async (input) => {
      emit('PostToolUse', input.sessionID, {
        tool_name: toolName(input.tool),
        tool_use_id: input.callID,
        tool_input: toolInput(input.args),
      });
    },
  };
};
