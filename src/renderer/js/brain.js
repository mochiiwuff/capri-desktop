// Turns Claude Code hook events into things Capri says and does.

import { linesFor, ASSISTANT_NAMES } from './lines.js';
import { pick, fmt, duration, basename, rand } from './util.js';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const HACKING_TOOLS = new Set(['Bash', 'PowerShell', 'WebFetch', 'WebSearch', 'Agent', 'Task']);
const WORKING_EVERY = 20; // say something about progress every N tool calls
const LONG_JOB_MS = 8 * 60 * 1000; // a job this long (or this busy) earns the whole satellite sequence
const LONG_JOB_ACTIONS = 50;
// mid-task with not a word from Claude: this long and the ticker starts counting (it's thinking),
// this long and she says something about it, this long and she tells you nothing's stuck
const THINK_AFTER = 15000;
const THINK_SAY = 40000;
const THINK_LONG = 120000;

export class Brain {
  constructor({ capri, panel, voice, host, mission, lang = 'fr', assistant = 'claude' }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.mission = mission; // today's log, for her report card (mission.js)
    this.lang = lang;
    this.assistant = assistant; // the assistant whose events she follows
    this.custom = {};       // what you made her (custom.js): { userName, persona, myLines, memories }
    this.sessions = new Map();
    this.replyFor = null;    // the session whose answer she's holding up for you
    this.linked = true;      // has a Claude Code event ever reached her (app.js sets it from the config)
    this.onLinked = null;
    this.onShowcase = null; // the demo's second half (app.js)
    this.onTalk = null;     // opens a chat with her (app.js, chat.js)
    this.watching = true;   // she follows Claude Code (her menu; off, she just keeps you company)
    this.thinkTimer = 0;
    this.thinking = null;   // { s, since, said, fidget, gazed } while Claude is quiet mid-task
  }

  get t() {
    return linesFor(this.lang, this.assistant);
  }

  // the assistant she watches, as she calls it
  get name() {
    return this.assistant === 'claude' ? 'Claude' : ASSISTANT_NAMES[this.assistant] || 'Claude';
  }

  session(evt) {
    const id = evt.session_id || 'default';
    let s = this.sessions.get(id);
    if (!s) {
      s = { id, project: this.name, taskStart: null, count: 0, files: new Set(), log: [], working: false, waiting: false };
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
    return this.panel.say({ kind, line, tag: s ? s.title || s.project : '', ...extra });
  }

  // today's log, for real events only: the demo's don't go on her report card
  tally(evt) {
    return evt.demo ? null : this.mission;
  }

  handle(evt) {
    if (evt.demo && this.assistant !== 'claude' && typeof evt.message === 'string') {
      evt = { ...evt, message: evt.message.replace(/Claude Code|Claude/g, this.name) };
    }
    // the demo's second half (scripts/demo-sequence.js), not a Claude event
    if (evt.hook_event_name === 'CapriShowcase') return this.onShowcase?.();
    // Non-Claude adapters prefix session IDs so only the assistant she watches counts.
    if (!evt.demo && (/^(codex|agy|opencode):/.exec(String(evt.session_id || ''))?.[1] || 'claude') !== this.assistant) return;
    if (!this.watching && !evt.demo) return undefined; // not watching Claude Code: none of its business
    // the first real Claude Code event that ever reaches her (the demo's don't count)
    if (!this.linked && !evt.demo) {
      this.linked = true;
      this.onLinked?.();
    }
    const s = this.session(evt);
    const name = evt.hook_event_name;
    // these three put her somewhere themselves; anything else just brings her out of hiding
    if (name === 'UserPromptSubmit' || name === 'Stop' || name === 'Notification') this.capri.wake();
    else this.capri.attend();

    // anything happening after a permission prompt means it was answered
    if (s.waiting && name !== 'Notification') {
      s.waiting = false;
      this.panel.clearKind('alert');
      if (s.pointedAt) this.capri.stopPointing(); // she was showing you Claude's window
      s.pointedAt = false;
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
      case 'Interrupt':
        s.working = false;
        if (!this.busySessions.length) {
          this.panel.setTicker(null);
          this.capri.setMode('idle');
        }
        return this.say('info', pick(this.t.interrupted), s, { face: 'wide', hold: 4000 });
      case 'SubagentStart': return this.onSubagent(evt, s, true);
      case 'SubagentStop': return this.onSubagent(evt, s, false);
      case 'PreCompact': return this.say('info', pick(this.t.compact), s, { face: 'aside', hold: 4000 });
      case 'SessionEnd': return this.onSessionEnd(evt, s);
      default: return undefined;
    }
  }

  onSessionStart(evt, s) {
    if (evt.source === 'clear' || evt.source === 'compact') return;
    const lines = evt.source === 'resume' ? this.t.resume : this.t.hello;
    this.voice.play('hello');
    this.capri.perform('curious', this.capri.towardCenter());
    this.say('info', fmt(pick(lines), { project: s.project }), s, { face: pick(['grin', 'look']), hold: 5000 });
  }

  onPrompt(evt, s) {
    // the window in front when you send a prompt is the one you typed it in: Claude's
    const window = this.capri.windows.fg || null;
    Object.assign(s, { taskStart: Date.now(), count: 0, files: new Set(), log: [], working: true, window });
    this.tally(evt)?.prompt(s.project);
    this.capri.goToWork(); // perched on the window in front if she can, else her corner
    const prompt = String(evt.prompt || '').replace(/\s+/g, ' ').trim();
    this.say('work', pick(this.t.prompt), s, { quote: prompt ? clip(prompt, 110) : '', hold: 4500 });
    this.watchThinking();
  }

  // Mid-task and nothing from Claude for a while: it's thinking (a big question, a slow local
  // model). The ticker counts the seconds and she keeps herself busy, so you can tell nothing froze.
  watchThinking() {
    if (!this.thinkTimer) this.thinkTimer = setInterval(() => this.thinkTick(), 1000);
  }

  thinkTick() {
    const busy = this.busySessions;
    if (!busy.length) {
      clearInterval(this.thinkTimer);
      this.thinkTimer = 0;
      this.thinking = null;
      return;
    }
    const s = busy.sort((a, b) => b.seen - a.seen)[0];
    const quiet = Date.now() - s.seen; // any event from it counts as a sign of life
    if (s.waiting || quiet < THINK_AFTER) {
      // it spoke up again (or it's your turn): whatever it did is on the ticker now
      if (this.thinking && this.panel.tickerAction?.thinking) this.panel.setTicker(s.last || null);
      this.thinking = null;
      return;
    }
    let th = this.thinking;
    if (th?.s !== s || th.since !== s.seen) th = this.thinking = { s, since: s.seen, said: 0, fidget: 0, gazed: false };
    const t = this.t.thinking;
    this.panel.setTicker({ verb: t.verb, target: duration(quiet, this.lang), thinking: true });

    const now = performance.now();
    if (now > th.fidget && !this.capri.stowed) {
      th.fidget = now + rand(9000, 16000);
      // once in a long think she looks up at the satellite; otherwise a little something
      const gazed = !th.gazed && quiet > 25000 && this.capri.gaze({ big: false });
      if (gazed) th.gazed = true;
      else this.capri.flourish();
    }
    if (th.said < 1 && quiet >= THINK_SAY) {
      th.said = 1;
      this.say('work', pick(t.hmm), s, { face: 'aside', hold: 4000 });
    }
    if (th.said < 2 && quiet >= THINK_LONG) {
      th.said = 2;
      this.say('info', pick(t.long), s, { face: 'smug', quote: t.longHow, hold: 8000 });
    }
  }

  onTool(evt, s) {
    const action = this.describe(evt);
    s.working = true;
    s.count += 1;
    s.last = action;
    s.log.push(action);
    if (s.log.length > 8) s.log.shift();
    this.tally(evt)?.action();
    if (EDIT_TOOLS.has(evt.tool_name)) {
      const file = evt.tool_input?.file_path || evt.tool_input?.notebook_path;
      if (file) s.files.add(file);
      if (Array.isArray(evt.tool_input?.file_paths)) {
        for (const edited of evt.tool_input.file_paths) if (typeof edited === 'string') s.files.add(edited);
      }
    }
    if (this.capri.mode !== 'alert') this.capri.setMode('work');
    this.capri.pulse();
    if (HACKING_TOOLS.has(evt.tool_name)) this.capri.spark(); // red sparks: she's in the system
    this.panel.setTicker(action);
    if (this.panel.current?.kind === 'work') this.panel.updateLog(s.log);
    if (s.count % WORKING_EVERY === 0) {
      this.say('work', fmt(pick(this.t.working), { count: s.count }), s, { log: s.log, hold: 4000 });
    }
  }

  onToolFailure(evt, s) {
    const action = { ...this.describe(evt), error: true };
    s.log.push(action);
    if (evt.is_interrupt) {
      this.say('info', pick(this.t.interrupted), s, { face: 'wide', hold: 4000 });
      return;
    }
    // "Exit code 1" says nothing; the next line usually does
    const lines = String(evt.error || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines.find((l) => !/^exit code \d+$/i.test(l)) || lines[0] || '';
    this.tally(evt)?.error();
    this.capri.hurt();
    this.voice.play('error');
    this.say('error', fmt(pick(this.t.error), { tool: evt.tool_name || this.t.someTool }), s, {
      face: pick(['laugh', 'wide']), // a failure: she laughs at the chaos, or it caught her off guard
      log: [action, { verb: '✕', target: clip(firstLine, 70), error: true }],
      hold: 5500,
    });
  }

  async onNotification(evt, s) {
    const type = evt.notification_type;
    if (type === 'permission_prompt' || type === 'elicitation_dialog' || type === 'agent_needs_input') {
      s.waiting = true;
      this.tally(evt)?.approval();
      this.capri.setMode('alert');
      this.voice.play('alert');
      // you're on another window: she goes and points at Claude's, where the question is
      const win = this.away(s) && this.capri.windows.wins.find((w) => w.id === s.window);
      if (win && this.capri.canPoint(win)) {
        const quote = [this.t.guide.permissionThere, evt.message].filter(Boolean).join('\n');
        this.say('alert', pick(this.t.permission), s, { quote, hold: null });
        s.pointedAt = await this.capri.pointAt(win, { label: this.t.guide.labels.claude });
        if (!s.waiting && s.pointedAt) this.capri.stopPointing(); // answered while she was on her way
        return;
      }
      this.say('alert', pick(this.t.permission), s, { quote: evt.message || '', hold: null });
      const cursor = await this.host.cursor().catch(() => null);
      if (cursor?.inside) await this.capri.summon(cursor);
      const toward = cursor?.inside ? Math.sign(cursor.x - this.capri.pos.x) || 1 : this.capri.towardCenter();
      this.capri.perform('alarm', toward);
      return;
    }
    if (type === 'idle_prompt') {
      this.voice.play('tick');
      this.say('info', pick(this.t.waiting), s, { face: 'smug', hold: 6000 });
      return;
    }
    if (evt.message) this.say('info', evt.message, s, { hold: 5000 });
  }

  async onStop(evt, s) {
    const wasWorking = s.working;
    s.working = false;
    const { units } = this.t;
    const summary = [
      s.count && plural(s.count, units.action, this.lang),
      s.files.size && plural(s.files.size, units.file, this.lang),
      s.taskStart && duration(Date.now() - s.taskStart, this.lang),
    ].filter(Boolean).join(' · ');
    const quote = cleanMarkdown(evt.last_assistant_message || '');
    if (wasWorking || s.count) {
      this.tally(evt)?.done({ files: s.files.size, ms: s.taskStart ? Date.now() - s.taskStart : 0, project: s.project });
    }

    if (!this.busySessions.length) {
      this.panel.setTicker(null);
      this.capri.setMode('idle');
    }
    // Not on Claude's window any more: you can't see the answer, so she brings it to you, whole,
    // and holds it up until you're back on Claude's window or click it away.
    const reply = this.away(s) ? readable(evt.last_assistant_message || '') : '';
    const done = (extra) => {
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
    this.say('error', pick(this.t.crashed), s, { face: 'wide', quote: clip(String(detail), 120), hold: 9000 });
  }

  onSubagent(evt, s, starting) {
    const agent = evt.agent_type || this.t.someAgent;
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
    this.say('info', fmt(pick(this.t.bye), { project: s.project }), s, { face: 'aside', hold: 4000 });
  }

  // Something to say with nothing going on: one of your lines half the time, if you wrote some.
  idleLine() {
    const mine = this.custom.myLines || [];
    return fmt(mine.length && Math.random() < 0.5 ? pick(mine) : pick(this.t.idle), { name: this.custom.userName || 'choom' });
  }

  // What she says when she comes online: with your name, if she knows it.
  onlineLine() {
    const name = this.custom.userName;
    return name ? fmt(pick(this.t.custom.onlineName), { name }) : pick(this.t.online);
  }

  // What she says when you click her. Nothing going on: she offers to talk (chat.js).
  status() {
    const busy = this.busySessions;
    if (!busy.length) {
      const talk = this.onTalk && { actions: [{ id: 'talk', label: this.t.chat.talk }], onAction: () => this.onTalk(), hold: 6000 };
      this.say('idle', this.idleLine(), null, { face: pick(['calm', 'smug', 'aside']), hold: 4000, ...talk });
      return;
    }
    const s = busy.sort((a, b) => b.seen - a.seen)[0];
    const time = s.taskStart ? duration(Date.now() - s.taskStart, this.lang) : '…';
    const extra = busy.length > 1 ? ` ${fmt(this.t.sessions, { count: busy.length })}.` : '';
    this.say('work', fmt(this.t.status, { project: s.project, time }) + extra, s, { log: s.log, hold: 6000 });
  }

  // What's going on, in plain words, for her chat: so she can answer "what's Claude up to?".
  context() {
    const assistant = this.name;
    const busy = this.busySessions.sort((a, b) => b.seen - a.seen);
    const now = busy.length
      ? busy.map((s) => {
        const time = s.taskStart ? ` for ${duration(Date.now() - s.taskStart, 'en')}` : '';
        const last = s.last ? `, last: ${s.last.verb} ${s.last.target}` : '';
        return `${assistant} is working on ${s.project}${time} (${plural(s.count, ['action', 'actions'], 'en')} so far${last}).`;
      }).join(' ')
      : `${assistant} is idle.`;
    const d = this.mission?.day;
    const today = d ? ` Today: ${d.missions} tasks finished, ${d.actions} actions, ${d.files} files changed, ${d.errors} errors.` : '';
    return now + today;
  }

  // Her report card: what Claude got through today, made to be screenshotted (her menu, or on
  // her own in the evening). The copy button puts a picture of it on the clipboard.
  report() {
    const d = this.mission.day;
    const t = this.t.report;
    if (!d.missions && !d.prompts) {
      this.say('idle', pick(t.lines.none), null, { face: 'aside', hold: 6000 });
      return false;
    }
    const tier = d.missions >= 10 || d.actions >= 300 ? 'big' : d.missions < 3 ? 'light' : 'good';
    const copy = async () => {
      const ok = await this.panel.snapshot((rect) => this.host.copyImage(rect)).catch(() => false);
      this.panel.relabel('copy', ok ? t.copied : t.copyFailed);
    };
    return this.say('report', pick(t.lines[tier]), null, {
      badge: t.badge,
      face: tier === 'big' ? 'laugh' : 'smug',
      report: {
        date: new Intl.DateTimeFormat(this.lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date()),
        hero: { value: d.missions, label: t.missions },
        stats: [
          { value: d.actions, label: t.actions },
          { value: d.files, label: t.files },
          { value: d.errors, label: t.errors, hot: d.errors > 0 },
        ],
        longest: d.longest && { label: t.longest, project: d.longest.project, time: duration(d.longest.ms, this.lang) },
        foot: [
          plural(d.prompts, t.prompts, this.lang),
          plural(d.approvals, t.approvals, this.lang),
          plural(d.projects.length, t.projects, this.lang),
        ].join(' · '),
      },
      actions: [{ id: 'copy', label: t.copy, primary: true }, { id: 'close', label: t.close }],
      onAction: (id) => (id === 'copy' ? copy() : this.panel.hide()),
      hold: null,
    });
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

// forms: [one, other], or by plural category ({ one, few, many, other }) for languages that need more
function plural(n, forms, lang) {
  const word = Array.isArray(forms) ? forms[n === 1 ? 0 : 1] : forms[new Intl.PluralRules(lang).select(n)] || forms.other;
  return `${n} ${word}`;
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
