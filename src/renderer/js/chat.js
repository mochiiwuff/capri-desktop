// Talking to her: you type in her panel, and a local model (Ollama, from the main process) answers
// as her, in writing. The replies are AI-generated, and the panel says so on every chat.
// Ask her to close an app and she will (Windows): she spots it in what you wrote (or the model names
// it with a tag in its answer), shows you a button with that app's name, and only your click closes it.

import { pick, fmt } from './util.js';

const REMEMBER = 20; // messages she has in mind when answering
const KEEP = 60;     // messages she remembers across restarts (memory.json)
const LANGUAGE = { fr: 'French', en: 'English', es: 'Spanish', pt: 'Brazilian Portuguese', ru: 'Russian' };
const STAY_MS = 10 * 60 * 1000; // no wandering off mid-conversation
const LOADING_AFTER_MS = 5000;
const CLOSE_TAG = /\[\[\s*close\s*:?\s*([^\]]*)\]\]/i; // [[close: AM Music]] at the end of her answer
// "close", "shut down", "ferme", "quitte", "cierra", "fecha", "закрой"... in any of her languages
const CLOSE_ASK = /\b(close|shut|quit|kill|exit)|ferm|quitt|coupe|arr[êe]t|cierr|cerra|fech|закр|выключ/i;

export class Chat {
  constructor({ capri, panel, voice, host, brain }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.brain = brain;
    this.history = []; // your chats with her, [{ role, content }], kept by main.js across restarts
    this.warm = false; // a model already answered this run (Ollama's first answer waits for it to load)
    this.open = false;
    this.turn = 0;     // id of the answer coming in, if any
    this.answer = '';
    this.apps = [];    // the apps open on this PC, as last listed: [{ name, label }]
    this.appsReady = Promise.resolve();
    host.onChatDelta(({ id, text }) => this.onDelta(id, text));
  }

  get t() {
    return this.brain.t.chat;
  }

  async start() {
    const { capri, host, t } = this;
    if (this.open) {
      this.panel.chatInput.focus();
      return;
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    const status = await host.chatStatus();
    if (!status.ok) {
      // no Ollama, or nothing to talk with yet: what to do about it
      const offline = status.error === 'offline';
      const other = !offline && status.error !== 'nomodel'; // another provider, saying why
      capri.perform('curious', capri.towardCenter());
      this.panel.say({
        kind: 'info',
        face: 'aside',
        guide: true,
        line: other ? t.failed : offline ? t.offline : t.noModel,
        quote: other ? status.error : offline ? t.offlineHow : t.noModelHow,
        actions: offline
          ? [{ id: 'get', label: t.getOllama, primary: true }, { id: 'ok', label: t.ok }]
          : [{ id: 'ok', label: t.ok, primary: true }],
        onAction: (id) => {
          if (id === 'get') host.openOllama();
          this.panel.hide();
        },
        hold: null,
      });
      return;
    }
    this.history = await host.chatMemory().catch(() => this.history); // "forget" in her menu may have emptied it
    this.cold = status.warmup && !this.warm;
    this.agent = Boolean(status.agent); // Claude Code answers, as her, and really works in your project
    this.listApps();
    host.focusOverlay(true); // the keyboard, for typing to her
    const shown = this.panel.say({
      kind: 'chat',
      face: 'look',
      badge: t.badge,
      tag: status.model.replace(/:latest$/, ''),
      line: pick(this.history.length ? t.again : t.hello),
      chat: {
        placeholder: t.placeholder,
        send: t.send,
        close: t.close,
        noteTag: t.noteTag,
        note: status.local ? t.note : t.noteCloud,
      },
      onSend: (text) => this.send(text),
      onLeave: () => this.close(),
      hold: null,
    });
    if (!shown) {
      host.focusOverlay(false); // something more important is on (a permission prompt)
      return;
    }
    this.open = true;
    setTimeout(() => this.panel.chatInput.focus(), 150); // once the overlay has the keyboard
    capri.perform('hop');
    capri.nextMove = capri.nextGaze = performance.now() + STAY_MS;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.turn) this.host.chatStop(this.turn);
    this.turn = 0;
    this.host.focusOverlay(false);
    this.capri.nextMove = performance.now() + 30000;
    this.capri.nextGaze = performance.now() + 60000;
  }

  async send(text) {
    if (this.turn || !this.open) return;
    const id = Date.now();
    this.turn = id;
    this.answer = '';
    this.history.push({ role: 'user', content: text });
    this.panel.setChatBusy(true);
    this.panel.setActions([]); // a close button she offered before goes with a new message
    this.panel.chatTurn({ quote: text, face: 'aside' });
    this.capri.pulse();
    await Promise.race([this.appsReady, new Promise((r) => setTimeout(r, 1500))]);
    const messages = [{ role: 'system', content: this.persona() }, ...this.history.slice(-REMEMBER)];
    // nothing yet after a few seconds: Ollama is still loading the model (the first answer after a start),
    // or Claude Code is at work
    const wait = this.agent ? this.t.working : this.cold ? this.t.loading : null;
    const slow = wait && setTimeout(() => {
      if (this.turn === id && !this.answer) this.panel.stream(wait);
    }, LOADING_AFTER_MS);
    const res = await this.host.chatSend({ id, messages });
    clearTimeout(slow);
    if (this.turn !== id) {
      // closed meanwhile: your message goes too, or the next answer would answer it as well
      if (this.history.at(-1)?.content === text) this.history.pop();
      return;
    }
    this.turn = 0;
    if (!res.ok) {
      this.history.pop();
      this.panel.setFace('wide');
      this.panel.stream(`${this.t.failed} ${res.error}`, { done: true });
      this.panel.setChatBusy(false);
      return;
    }
    const answer = clean(res.text) || '…';
    this.warm = true;
    this.remember({ role: 'assistant', content: answer });
    this.panel.stream(answer, { done: true });
    this.panel.setFace(mood(answer));
    this.panel.setChatBusy(false);
    // what you asked for first (a small model doesn't always write its tag right), else its tag
    const wanted = this.askedToClose(text) || tagged(res.text);
    if (wanted && !this.agent) this.offerClose(wanted, answer);
    this.listApps(); // fresh for the next message
  }

  // an answer of hers, kept with your message before it
  remember(message) {
    this.history.push(message);
    this.history = this.history.slice(-KEEP);
    this.host.chatRemember(this.history);
  }

  listApps() {
    this.appsReady = this.host.openApps().then((list) => { this.apps = list || []; }).catch(() => {});
  }

  // "close am music pls": an app that's open, named in a message asking to close something.
  askedToClose(text) {
    if (!CLOSE_ASK.test(text)) return null;
    const said = simple(text);
    let best = null;
    for (const app of this.apps) {
      for (const name of [simple(app.name), simple(app.label)]) {
        if (name.length >= 3 && said.includes(name) && (!best || name.length > best.length)) best = { app, length: name.length };
      }
    }
    return best?.app.name || null;
  }

  // She was asked to close an app: a button with its name, and nothing happens until you click it.
  async offerClose(wanted, answer) {
    const { t } = this;
    const app = await this.host.findApp(wanted);
    if (!this.open || this.turn) return;
    if (!app) {
      this.panel.stream(`${answer}\n${fmt(t.notFound, { app: wanted })}`, { done: true });
      return;
    }
    this.panel.setActions(
      [{ id: 'close', label: fmt(t.closeIt, { app: app.name }), primary: true }, { id: 'no', label: t.no }],
      (id) => (id === 'close' ? this.closeApp(app) : this.panel.setActions([])),
    );
  }

  async closeApp(app, force = false) {
    const { t, capri } = this;
    this.panel.setActions([]);
    // a bolt of red lightning off her fingers, at it
    const h = capri.head();
    capri.zap(h.x + capri.towardCenter() * 280, h.y - 170);
    const res = await this.host.closeApp(app.name, force);
    if (!this.open) return;
    let line;
    if (res.error) line = `${t.failed} ${res.error}`;
    else if (!res.running) line = fmt(force ? t.forced : t.closed, { app: app.name });
    else line = fmt(force ? t.unkillable : t.stillOpen, { app: app.name });
    this.panel.setFace(res.running || res.error ? 'aside' : 'laugh');
    this.panel.stream(line, { done: true });
    this.remember({ role: 'assistant', content: line });
    // it hid in the tray, or it's asking you to save something: forcing it is your call
    if (res.running && !force && !res.error) {
      this.panel.setActions(
        [{ id: 'force', label: t.force, primary: true }, { id: 'leave', label: t.leave }],
        (id) => (id === 'force' ? this.closeApp(app, true) : this.panel.setActions([])),
      );
    }
    this.listApps();
  }

  // What she can do on the PC: close an app you ask her to (Windows), and nothing else.
  powers() {
    const cant = 'you can\'t see the user\'s screen or files, and you can\'t open apps or touch anything else on their PC (music, settings, files): if asked, say plainly that you can\'t, in character, and don\'t pretend to.';
    if (!this.apps.length) return [`You can't close apps here, and ${cant}`];
    const open = this.apps.map(({ name, label }) => (label && label !== name ? `${name} (${label})` : name)).join(', ');
    return [
      `You can close an app that's open on the user's PC, only when they ask you to. Then say in a few words that you will, and end your answer with [[close: NAME]], NAME being the exact name from this list (the part before the parentheses). They get a button to confirm it, so never say it's already done. Apps open right now: ${open}.`,
      `Apart from that, ${cant}`,
    ];
  }

  onDelta(id, piece) {
    if (id !== this.turn) return;
    this.answer += piece;
    this.panel.stream(clean(this.answer));
    this.voice.play('blip'); // her blips as the words come in
  }

  // Who she is, how she talks, and what's going on right now.
  persona() {
    const assistant = this.brain.assistant === 'codex' ? 'Codex' : 'Claude Code';
    const language = LANGUAGE[this.brain.lang] || 'English';
    const watching = this.brain.watching; // else Claude Code isn't part of her life here
    return [
      'You are Capri, the personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost, so now and then you say "we".',
      watching
        ? `You live on the user's desktop as a small glitchy figure and keep an eye on ${assistant}, their AI coding assistant, for them. You love watching the satellite cross the night sky and dream of reaching it.`
        : 'You live on the user\'s desktop as a small glitchy figure and keep them company. You love watching the satellite cross the night sky and dream of reaching it.',
      'How you talk: playful, a little mischievous and teasing, warm underneath, never cruel. Night City slang now and then (choom, preem, nova, gonk, flatline), not in every sentence.',
      `Rules: answer in the language the user writes in (${language} if unsure). Keep it short: one to three sentences of plain text, no markdown, no lists, no emoji. Stay in character.`,
      'You are an AI-generated fan version of the character, not the real one: say so if asked.',
      ...(this.agent
        ? ['Under the hood you are Claude Code, working in the user\'s project: really do what they ask with your tools, as carefully as ever. Only your final answer is in character: it shows in a small speech bubble, so sum up what you did in those few sentences.']
        : this.powers()),
      ...(watching ? [`For what ${assistant} is doing, only use what follows, and never make anything up.`, `Right now: ${this.brain.context()}`] : []),
    ].join('\n');
  }
}

// The model's answer as she'd say it: no reasoning block, no markdown marks.
function clean(text) {
  return String(text)
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/\[\[[^\]]*(\]\]|$)/g, '') // her close tag (read from the raw answer, never shown)
    .replace(/[*_`#]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// The app named by her close tag: [[close: AM Music]], or a sloppier [[close]] AM Music.
function tagged(text) {
  const tag = CLOSE_TAG.exec(text);
  if (!tag) return null;
  const name = tag[1].trim() || text.slice(tag.index + tag[0].length).split('\n')[0].replace(/^[\s:.]+|[\s.!]+$/g, '');
  return name || null;
}

const simple = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Her face for an answer.
function mood(text) {
  if (/(ha){2,}|lol|mdr|jaja|kkk|хаха/i.test(text)) return 'laugh';
  if (text.includes('!')) return 'grin';
  if (text.trim().endsWith('?')) return 'smug';
  return 'look';
}
