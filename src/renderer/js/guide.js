// Showing you around: short tutorials where she goes places, points at things with her finger
// and pulls faces. Each topic is a little scene: what she says (and with which face), what she
// points at, and the buttons that move it on. Anything else coming up (Claude doing something,
// you closing the panel) ends it.

import { fmt } from './util.js';

const IDLE_FOR = 10 * 60 * 1000; // no wandering off while she's showing you something

export class Guide {
  constructor({ capri, panel, voice, host, brain }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.brain = brain;
    this.waiting = null; // { token, resolve } of the panel on screen
    this.running = false;
    this.sceneId = 0;
    this.setup = null;  // setup.js: getting her chat going, and the free way to run Claude Code
    this.onTalk = null; // () => void: "Talk to me" picked in her menu (app.js opens her chat)
    this.custom = null; // custom.js: what she calls you, how she is, your lines
    panel.onAction = (id) => this.answer(id);
    panel.onDismiss = (msg) => {
      if (this.waiting && msg.token === this.waiting.token) this.answer(null);
    };
  }

  get t() {
    return this.brain.t.guide;
  }

  // One panel of the guide; resolves with the id of the button you click, or null if it went away.
  ask({ kind = 'info', face, line, quote, badge, actions }) {
    this.answer(null);
    const token = Symbol('guide');
    return new Promise((resolve) => {
      this.waiting = { token, resolve };
      // something more important on screen (a permission prompt, Claude's answer): no guide now
      if (!this.panel.say({ kind, face, line, quote, badge, actions, guide: true, hold: null, token })) this.answer(null);
    });
  }

  // One of her guide's panels with a line to type in (secret: hidden as you type). Resolves with
  // { text } (what you typed), { action } (a button that ends it), or null if it went away.
  // onAction(id) true: that button did its thing, the panel stays.
  askText({ face, line, quote, secret = false, placeholder, send = this.brain.t.setup.save, tag, note, actions = [], onAction = () => false }) {
    this.answer(null);
    const token = Symbol('guide');
    return new Promise((resolve) => {
      let over = false;
      const finish = (value) => {
        if (over) return;
        over = true;
        if (this.waiting?.token === token) this.waiting = null;
        this.host.focusOverlay(false);
        resolve(value);
      };
      // like ask(): the next panel of a scene, or answer(id), ends it
      this.waiting = { token, resolve: (id) => finish(id === null ? null : { action: id }) };
      const shown = this.panel.say({
        kind: 'info', face, line, quote, guide: true, hold: null, token,
        chat: { placeholder, send, close: this.brain.t.setup.later, noteTag: tag, note, secret },
        actions,
        onAction: (id) => onAction(id) || finish({ action: id }),
        onSend: (text) => finish({ text }),
        onLeave: () => finish(null),
      });
      if (!shown) return finish(null);
      this.host.focusOverlay(true); // the keyboard, to type in it
    });
  }

  answer(id) {
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.resolve(id);
  }

  ok(primary = true) {
    return [{ id: 'ok', label: this.t.ok, primary }];
  }

  // Run a scene: she stays put meanwhile, and stops pointing at the end whatever happened.
  // A new scene ends the one that was on (its panel goes, it returns); only the last one cleans up.
  async scene(play) {
    const { capri } = this;
    const id = ++this.sceneId;
    this.answer(null);
    capri.stopPointing(); // whatever the last scene was showing
    if (capri.stowed) {
      this.host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    this.running = true;
    capri.nextMove = capri.nextGaze = performance.now() + IDLE_FOR;
    try {
      await play();
    } finally {
      if (id === this.sceneId) {
        this.running = false;
        capri.stopPointing();
        capri.nextMove = performance.now() + 30000;
        capri.nextGaze = performance.now() + 60000;
        if (this.panel.current?.token) this.panel.hide();
      }
    }
  }

  // ---------- topics ----------

  // First launch, or nothing hooked up yet: who she is, and plugging her into Claude Code.
  async welcome() {
    let talk = false;
    await this.scene(async () => {
      const w = this.brain.t.welcome;
      const [hooks, found] = await Promise.all([this.host.hooksStatus(), this.host.claudeFound()]);
      if (!this.brain.watching) {
        // not watching Claude Code: she's just here to keep you company
        this.capri.perform('curious', this.capri.towardCenter());
        await this.ask({ face: 'grin', line: w.hi, quote: `${w.alone}\n${w.menu}`, actions: [{ id: 'ok', label: w.ok, primary: true }] });
      } else if (hooks.installed) {
        this.capri.perform('curious', this.capri.towardCenter());
        const id = await this.ask({ face: 'look', line: w.ready, quote: w.readyHow, actions: [{ id: 'ok', label: w.ok, primary: true }, { id: 'more', label: this.t.more }] });
        if (id === 'more') talk = (await this.menuNow()) === 'talk';
      } else if (found) {
        await this.connect();
      } else {
        const id = await this.ask({
          face: 'aside',
          line: w.hi,
          quote: `${w.noClaude}\n${w.menu}`,
          actions: [
            { id: 'claude', label: w.whatClaude, primary: true },
            ...(this.freeWay ? [{ id: 'free', label: this.brain.t.setup.free }] : []),
            { id: 'later', label: w.justHang },
          ],
        });
        if (id === 'free') {
          await this.setup.freeNow();
        } else if (id === 'claude') {
          this.host.openClaudeHelp();
          await this.ask({ face: 'smug', line: w.hi, quote: w.afterInstall, actions: [{ id: 'ok', label: w.ok }] });
        } else if (id === 'later') {
          this.host.setConfig({ claude: false }); // just hanging out: no more word of Claude (her menu turns it back on)
        }
      }
      this.host.setConfig({ welcomed: true });
    });
    if (talk) this.onTalk?.();
  }

  // The coding assistants she watches can run through Ollama (`ollama launch`).
  get freeWay() {
    return Boolean(this.setup) && ['claude', 'codex', 'opencode'].includes(this.brain.assistant);
  }

  // "How does it work?" in her menu: what she can show you.
  async menu() {
    let talk = false;
    await this.scene(async () => {
      talk = (await this.menuNow()) === 'talk';
    });
    if (talk) this.onTalk?.();
  }

  async menuNow() {
    const t = this.t;
    const hooks = await this.host.hooksStatus();
    const actions = [];
    const watching = this.brain.watching; // else nothing about Claude to show
    if (watching && !hooks.installed) actions.push({ id: 'connect', label: t.topics.connect, primary: true });
    actions.push({ id: 'icon', label: t.topics.icon, primary: !watching || hooks.installed });
    if (watching) {
      actions.push({ id: 'claude', label: t.topics.claude });
      actions.push({ id: 'folder', label: t.topics.folder });
    }
    actions.push({ id: 'talk', label: t.topics.talk });
    if (this.custom) actions.push({ id: 'custom', label: t.topics.custom });
    actions.push({ id: 'close', label: t.topics.close });
    this.capri.perform('curious', this.capri.towardCenter());
    const id = await this.ask({ face: 'smug', line: t.menu.line, quote: t.menu.quote, actions });
    if (id === 'talk') return 'talk'; // her chat opens once the scene is over (menu, welcome)
    if (id === 'custom') await this.custom.steps();
    if (id === 'connect') await this.connect();
    else if (id === 'icon') await this.icon();
    else if (id === 'claude') await this.claude();
    else if (id === 'folder') await this.folder();
  }

  // Plugging her into Claude Code: one click, then a fresh Claude Code session.
  async connect() {
    const w = this.brain.t.welcome;
    const id = await this.ask({
      face: 'grin',
      line: w.hi,
      quote: `${w.about}\n${w.connect}\n${w.menu}`,
      actions: [
        { id: 'connect', label: w.connectBtn, primary: true },
        ...(this.freeWay ? [{ id: 'free', label: this.brain.t.setup.free }] : []),
        { id: 'later', label: w.later },
      ],
    });
    if (id === 'free') {
      await this.setup.freeNow(); // her hooks, then Claude Code (or Codex) through Ollama
      return;
    }
    if (id !== 'connect') return;
    const result = await this.host.installHooks();
    if (!result.ok) {
      this.capri.hurt();
      await this.ask({ kind: 'error', face: 'wide', line: fmt(w.failed, { error: result.error }), actions: this.ok() });
      return;
    }
    this.voice.play('hello');
    this.capri.perform('hop');
    // she knows where Claude is if you've used it with her before: she shows you where to restart it
    const win = this.claudeWindow();
    const scene = this.sceneId;
    if (win && this.capri.canPoint(win)) await this.capri.pointAt(win, { label: this.t.labels.claude });
    if (scene !== this.sceneId) return; // another scene took over meanwhile
    await this.ask({ kind: 'done', face: 'laugh', line: w.connected, quote: w.restart, actions: [{ id: 'ok', label: w.ok }] });
  }

  // Where her tray icon is: she goes down to the clock and points at it.
  async icon() {
    const t = this.t.icon;
    const place = await this.host.trayPlace();
    const scene = this.sceneId;
    await this.capri.pointAt(place.icon || place.corner, { label: this.t.labels.icon });
    if (scene !== this.sceneId) return; // another scene took over meanwhile
    await this.ask({ face: 'look', line: t.line, quote: place.icon ? t.quote : t.hidden, actions: this.ok() });
  }

  // Where Claude is: the window you typed your last prompt in.
  async claude() {
    const t = this.t.claude;
    const win = this.claudeWindow();
    if (!win) {
      await this.ask({ face: 'aside', line: t.unknown, quote: t.unknownHow, actions: this.ok() });
    } else if (!this.capri.canPoint(win)) {
      await this.ask({ face: 'calm', line: t.behind, quote: t.behindHow, actions: this.ok() });
    } else {
      const scene = this.sceneId;
      await this.capri.pointAt(win, { label: this.t.labels.claude });
      if (scene !== this.sceneId) return; // another scene took over meanwhile
      await this.ask({ face: 'look', line: t.there, quote: t.thereHow, actions: this.ok() });
    }
  }

  // Claude Code's folder: she opens it, waits for the window to come up, and points at it.
  async folder() {
    const t = this.t.folder;
    const { capri } = this;
    const before = capri.windows.fg;
    const opened = await this.host.openClaudeFolder();
    if (!opened.found) {
      await this.ask({ face: 'wide', line: t.missing, quote: t.missingHow, actions: this.ok() });
      return;
    }
    // Explorer comes up in front: a new window, or the one already showing that folder, brought back
    const front = () => capri.windows.wins.find((w) => w.id === capri.windows.fg) || null;
    const win = (await this.until(() => (capri.windows.fg !== before ? front() : null), 2500)) || front();
    const scene = this.sceneId;
    if (win && capri.canPoint(win)) await capri.pointAt(win, { label: opened.label || (this.brain.assistant === 'claude' ? 'settings.json' : 'hooks.json') });
    if (scene !== this.sceneId) return; // another scene took over meanwhile
    const id = await this.ask({
      face: 'smug',
      line: fmt(t.line, { dir: opened.dir }),
      quote: opened.file ? t.what : t.empty,
      actions: [{ id: 'next', label: this.t.next, primary: true }, { id: 'close', label: this.t.ok }],
    });
    if (id !== 'next') return;
    await this.ask({ face: 'calm', line: t.hook, quote: t.hookHow, actions: this.ok() });
  }

  // ---------- helpers ----------

  // Claude's window: the one you typed your last prompt in, if it's still around.
  claudeWindow() {
    const { wins } = this.capri.windows;
    const sessions = [...this.brain.sessions.values()].filter((s) => s.window).sort((a, b) => b.seen - a.seen);
    for (const s of sessions) {
      const win = wins.find((w) => w.id === s.window);
      if (win) return win;
    }
    return null;
  }

  until(find, max) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const look = () => {
        const found = find();
        if (found || performance.now() - t0 > max) resolve(found || null);
        else setTimeout(look, 100);
      };
      look();
    });
  }
}
