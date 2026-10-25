// Turns coding-agent hook events into things Capri says and does.

import { LINES } from './lines.js';
import { pick, fmt, duration, basename } from './util.js';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'apply_patch']);
const HACKING_TOOLS = new Set(['Bash', 'PowerShell', 'WebFetch', 'WebSearch', 'Agent', 'Task']);
const WORKING_EVERY = 20; // say something about progress every N tool calls
const LONG_JOB_MS = 8 * 60 * 1000; // a job this long (or this busy) earns the whole satellite sequence
const LONG_JOB_ACTIONS = 50;

export class Brain {
  constructor({ capri, panel, voice, host, lang = 'fr' }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.lang = lang;
    this.sessions = new Map();
    this.replyFor = null;    // the session whose answer she's holding up for you
    this.onShowcase = null; // the demo's second half (app.js)
  }

  get t() {
    return LINES[this.lang] || LINES.fr;
  }

  session(evt) {
    const provider = evt.provider === 'codex' ? 'codex' : 'claude';
    const id = `${provider}:${evt.session_id || 'default'}`;
    let s = this.sessions.get(id);
    if (!s) {
      const assistant = provider === 'codex' ? 'Codex' : 'Claude';
      s = { id, assistant, project: assistant, taskStart: null, count: 0, files: new Set(), log: [], working: false, waiting: false, endedTurns: new Set() };
      this.sessions.set(id, s);
    }
    if (evt.cwd) s.project = basename(evt.cwd);
    if (evt.session_title) s.title = evt.session_title;
    s.seen = Date.now();
    return s;
  }

  get busySessions() {
    return [...this.sessions.values()].filter((s) => s.working);
  }

  say(kind, line, s, extra = {}) {
    this.panel.say({ kind, line: line.replace(/\{assistant\}/g, s?.assistant || 'Claude'), tag: s ? s.title || s.project : '', sessionId: s?.id, ...extra });
  }

  // Background hooks may arrive after Stop/Interrupt, or after the next prompt.
  acceptTurn(evt, s) {
    if (evt.provider !== 'codex' || !evt.turn_id) return true;
    const turn = evt.turn_id;
    if (s.endedTurns.has(turn)) return false;
    if (s.turnId !== turn) {
      if (s.turnId && !s.endedTurns.has(s.turnId) && evt.hook_event_name !== 'UserPromptSubmit') {
        if (evt.hook_event_name === 'Stop' || evt.hook_event_name === 'Interrupt') s.endedTurns.add(turn);
        return false;
      }
      if (s.turnId) s.endedTurns.add(s.turnId);
      Object.assign(s, { turnId: turn, promptSeen: false, taskStart: null, count: 0, files: new Set(), log: [], working: false });
    }
    if (evt.hook_event_name === 'UserPromptSubmit') {
      if (s.promptSeen) return false;
      s.promptSeen = true;
    }
    if (evt.hook_event_name === 'Stop' || evt.hook_event_name === 'Interrupt') s.endedTurns.add(turn);
    while (s.endedTurns.size > 32) s.endedTurns.delete(s.endedTurns.values().next().value);
    return true;
  }

  handle(evt) {
    // the demo's second half (scripts/demo-sequence.js), not a Claude event
    if (evt.hook_event_name === 'CapriShowcase') return this.onShowcase?.();
    const s = this.session(evt);
    const name = evt.hook_event_name;
    if (!this.acceptTurn(evt, s)) return;
    // these three put her somewhere themselves; anything else just brings her out of hiding
    if (name === 'UserPromptSubmit' || name === 'Stop' || name === 'Notification') this.capri.wake();
    else this.capri.attend();

    // Codex background progress can predate the approval alert. Only the matching
    // tool's result (or a turn/session boundary) proves that waiting has ended.
    const codexResumed = ['UserPromptSubmit', 'Stop', 'StopFailure', 'Interrupt', 'SessionEnd'].includes(name)
      || (['PostToolUse', 'PostToolUseFailure'].includes(name) && this.approvalKey(evt) === s.waitingFor);
    if (s.waiting && name !== 'Notification' && (evt.provider !== 'codex' || codexResumed)) {
      s.waiting = false;
      if (this.panel.current?.sessionId === s.id) this.panel.clearKind('alert');
      if (this.capri.mode === 'alert') this.capri.setMode(s.working ? 'work' : 'idle');
    }

    switch (name) {
      case 'SessionStart': return this.onSessionStart(evt, s);
      case 'UserPromptSubmit': return this.onPrompt(evt, s);
      case 'PreToolUse': return this.onTool(evt, s);
      case 'PostToolUseFailure': return this.onToolFailure(evt, s);
      case 'Notification': return this.onNotification(evt, s);
      case 'Stop': return this.onStop(evt, s);
      case 'StopFailure': return this.onStopFailure(evt, s);
      case 'Interrupt': return this.onInterrupt(evt, s);
      case 'SubagentStart': return this.onSubagent(evt, s, true);
      case 'SubagentStop': return this.onSubagent(evt, s, false);
      case 'PreCompact': return this.say('info', pick(this.t.compact), s, { hold: 4000 });
      case 'SessionEnd': return this.onSessionEnd(evt, s);
      default: return undefined;
    }
  }

  onSessionStart(evt, s) {
    if (evt.source === 'clear' || evt.source === 'compact') return;
    const lines = evt.source === 'resume' ? this.t.resume : this.t.hello;
    this.voice.play('hello');
    this.capri.perform('curious', this.capri.towardCenter());
    this.say('info', fmt(pick(lines), { project: s.project }), s, { hold: 5000 });
  }

  onPrompt(evt, s) {
    // the window in front when you send a prompt is the one you typed it in: Claude's
    const window = this.capri.windows.fg || null;
    const earlyTools = evt.provider === 'codex' && evt.turn_id && s.count > 0;
    if (!earlyTools) Object.assign(s, { count: 0, files: new Set(), log: [] });
    Object.assign(s, { taskStart: Date.now(), working: true, window });
    this.capri.goToWork(); // perched on the window in front if she can, else her corner
    const prompt = String(evt.prompt || '').replace(/\s+/g, ' ').trim();
    this.say('work', pick(this.t.prompt), s, { quote: prompt ? clip(prompt, 110) : '', hold: 4500 });
  }

  onTool(evt, s) {
    const action = this.describe(evt);
    s.working = true;
    s.count += 1;
    s.last = action;
    s.log.push(action);
    if (s.log.length > 8) s.log.shift();
    if (EDIT_TOOLS.has(evt.tool_name)) {
      const file = evt.tool_input?.file_path || evt.tool_input?.notebook_path;
      if (file) s.files.add(file);
      if (evt.tool_name === 'apply_patch') {
        for (const name of evt.tool_input?.files || []) if (typeof name === 'string') s.files.add(name);
      }
    }
    if (this.capri.mode !== 'alert') this.capri.setMode('work');
    this.capri.pulse();
    if (HACKING_TOOLS.has(evt.tool_name)) this.capri.spark(); // red sparks: she's in the system
    this.panel.setTicker(action);
    if (this.panel.current?.kind === 'work') this.panel.updateLog(s.log);
    if (s.count % WORKING_EVERY === 0) {
      this.say('work', fmt(pick(this.t.working), { count: s.count, assistant: s.assistant }), s, { log: s.log, hold: 4000 });
    }
  }

  onToolFailure(evt, s) {
    const action = { ...this.describe(evt), error: true };
    s.log.push(action);
    if (evt.is_interrupt) {
      this.say('info', pick(this.t.interrupted), s, { hold: 4000 });
      return;
    }
    // "Exit code 1" says nothing; the next line usually does
    const lines = String(evt.error || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines.find((l) => !/^exit code \d+$/i.test(l)) || lines[0] || '';
    this.capri.hurt();
    this.voice.play('error');
    this.say('error', fmt(pick(this.t.error), { tool: evt.tool_name || 'outil', assistant: s.assistant }), s, {
      log: [action, { verb: '✕', target: clip(firstLine, 70), error: true }],
      hold: 5500,
    });
  }

  async onNotification(evt, s) {
    const type = evt.notification_type;
    if (type === 'permission_prompt' || type === 'elicitation_dialog' || type === 'agent_needs_input') {
      s.waiting = true;
      s.waitingFor = this.approvalKey(evt);
      this.capri.setMode('alert');
      this.voice.play('alert');
      this.say('alert', pick(this.t.permission), s, { quote: evt.message || '', hold: null });
      const cursor = await this.host.cursor().catch(() => null);
      if (cursor?.inside) await this.capri.summon(cursor);
      const toward = cursor?.inside ? Math.sign(cursor.x - this.capri.pos.x) || 1 : this.capri.towardCenter();
      this.capri.perform('alarm', toward);
      return;
    }
    if (type === 'idle_prompt') {
      this.voice.play('tick');
      this.say('info', pick(this.t.waiting), s, { hold: 6000 });
      return;
    }
    if (evt.message) this.say('info', evt.message, s, { hold: 5000 });
  }

  approvalKey(evt) {
    const input = evt.tool_input || {};
    return JSON.stringify([evt.tool_name, input.command || input.files || input.path || input.file_path || '']);
  }

  async onStop(evt, s) {
    const current = () => !evt.turn_id || s.turnId === evt.turn_id;
    const wasWorking = s.working;
    s.working = false;
    const { units } = this.t;
    const summary = [
      s.count && plural(s.count, units.action),
      s.files.size && plural(s.files.size, units.file),
      s.taskStart && duration(Date.now() - s.taskStart, this.lang),
    ].filter(Boolean).join(' · ');
    const quote = cleanMarkdown(evt.last_assistant_message || '');

    if (!this.busySessions.length) {
      this.panel.setTicker(null);
      this.capri.setMode('idle');
    }
    // Not on Claude's window any more: you can't see the answer, so she brings it to you, whole,
    // and holds it up until you're back on Claude's window or click it away.
    const reply = this.away(s) ? readable(evt.last_assistant_message || '') : '';
    const done = (extra) => {
      if (!current()) return;
      if (reply) this.replyFor = s;
      if (reply) this.say('done', pick(this.t.reply), s, { ...extra, reply, hold: null });
      else this.say('done', pick(this.t.done), s, { ...extra, quote: clip(quote, 150) });
    };
    if (!wasWorking && !s.count) {
      // a Stop with nothing before it: just say it quietly
      done({ hold: 8000 });
      return;
    }
    // clear the stage: nothing should cover her victory pose
    this.panel.hide();
    // quick back-and-forth answers don't deserve the whole show
    const bigJob = s.count >= 3 || (s.taskStart && Date.now() - s.taskStart > 20000);
    if (bigJob) await this.capri.teleport(this.capri.spot('stage'));
    if (!current()) return;
    // the panel comes in once she's back down from her victory pose
    this.capri.celebrate({ onSpeak: () => done({ summary, hold: 14000 }) });
    // a long one: she'll send the red light up to the satellite once it's all quiet
    if ((s.taskStart && Date.now() - s.taskStart >= LONG_JOB_MS) || s.count >= LONG_JOB_ACTIONS) this.capri.earnUplink();
  }

  // Is the window you typed your prompt in (Claude's) no longer the one in front?
  // Unknown (no window tracking, macOS / Linux) counts as no.
  away(s) {
    const { fg } = this.capri.windows;
    return Boolean(s.window && fg && fg !== s.window);
  }

  // Back on Claude's window: the answer she was holding up for you can go.
  onWindows({ fg }) {
    const s = this.replyFor;
    if (!s || fg !== s.window) return;
    this.replyFor = null;
    if (this.panel.current?.reply) this.panel.hide();
  }

  onStopFailure(evt, s) {
    s.working = false;
    if (!this.busySessions.length) {
      this.panel.setTicker(null);
      this.capri.setMode('idle');
    }
    this.capri.hurt();
    this.voice.play('error');
    const detail = evt.error || evt.message || '';
    this.say('error', pick(this.t.crashed), s, { quote: clip(String(detail), 120), hold: 9000 });
  }

  onInterrupt(_evt, s) {
    s.working = false;
    s.waiting = false;
    if (this.panel.current?.sessionId === s.id) this.panel.clearKind('alert');
    if ([...this.sessions.values()].some((session) => session.waiting)) {
      this.capri.setMode('alert');
      return;
    }
    if (!this.busySessions.length) {
      this.panel.setTicker(null);
      this.capri.setMode('idle');
    }
    this.say('info', pick(this.t.interrupted), s, { hold: 4000 });
  }

  onSubagent(evt, s, starting) {
    const agent = evt.agent_type || 'agent';
    const line = fmt(pick(starting ? this.t.subagentStart : this.t.subagentStop), { agent });
    const action = { verb: starting ? '↗' : '↘', target: line };
    s.log.push(action);
    this.panel.setTicker(action);
  }

  onSessionEnd(evt, s) {
    this.sessions.delete(s.id);
    if (!this.busySessions.length) {
      this.panel.setTicker(null);
      this.capri.setMode('idle');
    }
    this.say('info', fmt(pick(this.t.bye), { project: s.project }), s, { hold: 4000 });
  }

  // What she says when you click her.
  status() {
    const busy = this.busySessions;
    if (!busy.length) {
      this.say('idle', pick(this.t.idle), null, { hold: 4000 });
      return;
    }
    const s = busy.sort((a, b) => b.seen - a.seen)[0];
    const time = s.taskStart ? duration(Date.now() - s.taskStart, this.lang) : '…';
    const extra = busy.length > 1 ? ` ${fmt(this.t.sessions, { count: busy.length })}.` : '';
    this.say('work', fmt(this.t.status, { project: s.project, time, assistant: s.assistant }) + extra, s, { log: s.log, hold: 6000 });
  }

  describe(evt) {
    const name = evt.tool_name || '';
    const input = evt.tool_input || {};
    const verbs = this.t.verbs;
    let verb = verbs[name] || verbs.default;
    let target = '';

    switch (name) {
      case 'Read': case 'Write': case 'Edit': case 'MultiEdit':
        target = basename(input.file_path); break;
      case 'apply_patch':
        target = (input.files || []).map((file) => basename(file)).join(', '); break;
      case 'NotebookEdit':
        target = basename(input.notebook_path); break;
      case 'Bash': case 'PowerShell':
        target = input.description || input.command; break;
      case 'Grep':
        target = input.pattern ? `“${input.pattern}”` : ''; break;
      case 'Glob':
        target = input.pattern; break;
      case 'WebFetch':
        try { target = new URL(input.url).host; } catch { target = input.url; }
        break;
      case 'WebSearch':
        target = input.query; break;
      case 'Agent': case 'Task':
        target = input.description || input.subagent_type; break;
      case 'Skill':
        target = input.skill; break;
      default:
        if (name.startsWith('mcp__')) {
          // mcp__server__tool -> "server › tool", long generated server ids dropped
          const [, server = '', ...rest] = name.split('__');
          const tool = rest.join('__').replace(/_/g, ' ');
          const nice = /^[0-9a-f-]{20,}$/i.test(server) ? '' : server.replace(/^ccd_/, '');
          verb = 'MCP';
          target = nice ? `${nice} › ${tool}` : tool;
        } else {
          target = name;
        }
    }
    return { verb, target: clip(String(target || ''), 64) };
  }
}

function plural(n, [one, many]) {
  return `${n} ${n === 1 ? one : many}`;
}

function clip(text, max) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// Claude's answer as text you can read in the panel: paragraphs, lists and code kept,
// the markdown marks dropped.
function readable(text) {
  return String(text)
    .replace(/\r/g, '')
    .replace(/^```.*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^(\s*)[-*]\s+/gm, '$1• ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanMarkdown(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
