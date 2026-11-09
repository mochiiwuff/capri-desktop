// Setting up who she talks with, with buttons, so nobody has to open a terminal: on this PC
// (Ollama installed, woken up and a model fetched for you, with how far along it is), online with
// no account (Pollinations), or with a key you paste in her panel. And Claude Code or Codex for
// free, run through Ollama. Each step is a panel of her guide (guide.js).

import { fmt } from './util.js';

// the services that take a key, in the order she offers them (the first two have a free tier)
const KEYED = ['groq', 'gemini', 'openrouter', 'openai', 'mistral', 'deepseek'];
const NAMES = { groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter', openai: 'OpenAI', mistral: 'Mistral', deepseek: 'DeepSeek' };
const ROOMY = 12 * 2 ** 30; // enough memory for the bigger model

export class Setup {
  constructor({ guide, panel, host, brain, capri, voice }) {
    this.guide = guide;
    this.panel = panel;
    this.host = host;
    this.brain = brain;
    this.capri = capri;
    this.voice = voice;
    this.onReady = null; // () => void: she can talk now, and you said you want to (app.js opens her chat)
    this.pulling = false;
    host.onSetupProgress((p) => this.progress(p));
  }

  get t() {
    return this.brain.t.setup;
  }

  // Her chat can't answer yet (status: what chat:status said), or "Set it up with her" in her menu.
  async chat(status = null) {
    let ready = false;
    await this.guide.scene(async () => {
      ready = await this.choose(status);
    });
    if (ready) this.onReady?.();
  }

  // "API key or address" in her menu: for the service she's on, else which one.
  async key() {
    let ready = false;
    await this.guide.scene(async () => {
      const { provider } = await this.host.getConfig();
      if (KEYED.includes(provider)) ready = await this.paste(provider);
      else if (provider === 'custom') ready = await this.address();
      else ready = await this.pickKeyed();
    });
    if (ready) this.onReady?.();
  }

  // A bigger model than the tiny one her chat is on: picked, fetched, and her chat back on it.
  async better() {
    let ready = false;
    await this.guide.scene(async () => {
      if (!(await this.ollamaUp())) return;
      const name = await this.pickModel(this.t.bigger);
      if (!name) return;
      const res = await this.pull(name);
      if (res.ok) ready = await this.done();
      else if (res.error !== 'stopped') await this.fail(this.t.pullFailed, res.error);
    });
    if (ready) this.onReady?.();
  }

  // Claude Code or Codex for free (the one she watches), run through Ollama in a window of its own.
  async free() {
    await this.guide.scene(() => this.freeNow());
  }

  // ---------- steps ----------

  // Who answers her: why she can't talk yet if she knows, then the choice. True once she can talk.
  async choose(status) {
    const t = this.t;
    let why = '';
    if (status && !status.ok) {
      if (status.code === 'nokey') return this.paste(status.provider);
      if (status.code === 'nourl') return this.address();
      if (!status.provider || status.provider === 'ollama') {
        const state = await this.host.ollamaState();
        why = !state.installed ? t.why.noOllama : !state.running ? t.why.asleep : t.why.noModel;
      } else {
        why = `${t.failed} ${status.error}`;
      }
    }
    this.capri.perform('curious', this.capri.towardCenter());
    const id = await this.guide.ask({
      face: 'smug',
      line: t.who,
      quote: [why, t.whoHow].filter(Boolean).join('\n'),
      actions: [
        { id: 'local', label: t.local, primary: true },
        { id: 'online', label: t.online },
        { id: 'key', label: t.key },
        { id: 'later', label: t.later },
      ],
    });
    if (id === 'local') return this.ollama();
    if (id === 'online') return this.use('pollinations');
    if (id === 'key') return this.pickKeyed();
    return false;
  }

  // Ollama as far as it needs to go: installed, awake, with a model.
  async ollama() {
    if (!(await this.ollamaUp())) return false;
    const state = await this.host.ollamaState();
    if (state.models?.length) {
      const res = await this.host.useProvider({ provider: 'ollama' });
      return res.ok ? this.done() : this.fail(this.t.failed, res.error);
    }
    const name = await this.pickModel();
    if (!name) return false;
    const res = await this.pull(name);
    if (res.ok) return this.done();
    return res.error === 'stopped' ? false : this.fail(this.t.pullFailed, res.error);
  }

  // Ollama installed (with winget, on your click) and awake. True once it answers.
  async ollamaUp() {
    const t = this.t;
    let state = await this.host.ollamaState();
    if (state.running) return true;
    if (!state.installed) {
      if (!state.winget) {
        const id = await this.guide.ask({
          face: 'aside', line: t.noWinget, quote: t.noWingetHow,
          actions: [{ id: 'site', label: t.site, primary: true }, { id: 'later', label: t.later }],
        });
        if (id === 'site') this.host.openOllama();
        return false;
      }
      const id = await this.guide.ask({
        face: 'look', line: t.install, quote: t.installHow,
        actions: [{ id: 'install', label: t.installBtn, primary: true }, { id: 'site', label: t.site }, { id: 'later', label: t.later }],
      });
      if (id === 'site') this.host.openOllama();
      if (id !== 'install') return false;
      this.working(t.installing, t.installingHow);
      const res = await this.host.installOllama();
      state = await this.host.ollamaState();
      if (!state.installed) return this.fail(t.installFailed, res.error || '');
      if (state.running) return true;
    }
    this.working(t.waking, t.wakingHow);
    const res = await this.host.startOllama();
    return res.ok ? true : this.fail(t.wakeFailed, t.wakeFailedHow);
  }

  // Which model to fetch: the better one first when the PC has room for it, then Ollama's free cloud
  // ones if you're signed in to it.
  async pickModel(line = this.t.model) {
    const t = this.t;
    const info = await this.host.setupInfo();
    const models = info.ram >= ROOMY ? info.models : [...info.models].reverse();
    const cloud = info.cloud || [];
    const id = await this.guide.ask({
      face: 'look',
      line,
      quote: cloud.length ? `${t.modelHow}\n${t.cloudHow}` : t.modelHow,
      actions: [
        ...models.map((m, i) => ({ id: m.name, label: `${m.name} · ${this.size(m.bytes)}`, primary: i === 0 })),
        ...cloud.map((name) => ({ id: name, label: `${name.replace(/:cloud$/, '')} · ${t.cloudFree}` })),
        { id: 'later', label: t.later },
      ],
    });
    return models.some((m) => m.name === id) || cloud.includes(id) ? id : null;
  }

  // Fetching it: a bar that fills, how much is done, and a button to stop.
  async pull(name) {
    const t = this.t;
    this.pulling = true;
    this.panel.say({
      kind: 'work', face: 'calm', guide: true, hold: null, token: Symbol('setup'),
      line: fmt(t.pulling, { model: name }), quote: t.pullStart, progress: 0,
      actions: [{ id: 'cancel', label: t.cancel }],
      onAction: () => this.host.cancelSetup(),
    });
    try {
      return await this.host.pullModel(name);
    } finally {
      this.pulling = false;
    }
  }

  progress(p) {
    if (p.kind !== 'pull' || !this.pulling || !p.total || this.panel.current?.kind !== 'work') return;
    const k = p.completed / p.total;
    this.panel.setProgress(k);
    this.panel.setQuote(fmt(this.t.progress, { done: this.size(p.completed), total: this.size(p.total), percent: Math.floor(k * 100) }));
  }

  // A service with no key needed (Pollinations): tried, then ready.
  async use(provider) {
    this.working(this.t.checking);
    const res = await this.host.useProvider({ provider });
    return res.ok ? this.done() : this.fail(this.t.failed, res.error);
  }

  async pickKeyed() {
    const t = this.t;
    const id = await this.guide.ask({
      face: 'smug',
      line: t.which,
      quote: t.whichHow,
      actions: [...KEYED.map((p, i) => ({ id: p, label: NAMES[p], primary: i === 0 })), { id: 'back', label: t.back }],
    });
    if (id === 'back') return this.choose(null);
    return KEYED.includes(id) ? this.paste(id) : false;
  }

  // Her panel with a line to paste the key into (hidden as you type), and the page to get one.
  async paste(provider, error = '') {
    const t = this.t;
    const got = await this.guide.askText({
      face: error ? 'wide' : 'look',
      line: fmt(t.paste, { name: NAMES[provider] || provider }),
      quote: error ? `${t.keyBad} ${error}` : t.pasteHow,
      secret: true,
      placeholder: t.placeholder,
      tag: t.keyTag,
      note: t.keyNote,
      actions: [{ id: 'page', label: t.where }, { id: 'other', label: t.other }],
      onAction: (id) => id === 'page' && (this.host.keyPage(provider), true),
    });
    if (got?.action === 'other') return this.choose(null);
    if (!got?.text) return false;
    this.working(t.checking);
    const res = await this.host.useProvider({ provider, key: got.text });
    return res.ok ? this.done() : this.paste(provider, res.error);
  }

  // The address of an OpenAI-compatible server of your own (LM Studio, llama.cpp…).
  async address(error = '') {
    const t = this.t;
    const got = await this.guide.askText({
      face: error ? 'wide' : 'look',
      line: t.address,
      quote: error ? `${t.failed} ${error}` : t.addressHow,
      placeholder: 'http://127.0.0.1:1234/v1',
      tag: 'URL',
      note: t.addressNote,
      actions: [{ id: 'other', label: t.other }],
    });
    if (got?.action === 'other') return this.choose(null);
    if (!got?.text) return false;
    this.working(t.checking);
    const res = await this.host.useProvider({ provider: 'custom', url: got.text });
    return res.ok ? this.done() : this.address(res.error);
  }

  // Claude Code or Codex through Ollama: her hooks in first (so she sees it), Ollama up, then its window.
  async freeNow() {
    const t = this.t;
    const integration = this.brain.assistant === 'codex' ? 'codex' : 'claude';
    const name = integration === 'codex' ? 'Codex' : 'Claude Code';
    const id = await this.guide.ask({
      face: 'smug', line: fmt(t.freeLine, { name }), quote: fmt(t.freeHow, { name }),
      actions: [{ id: 'go', label: t.freeBtn, primary: true }, { id: 'later', label: t.later }],
    });
    if (id !== 'go') return false;
    const hooks = await this.host.hooksStatus();
    if (!hooks.installed) {
      const res = await this.host.installHooks();
      if (!res.ok) return this.fail(t.failed, res.error);
    }
    if (!(await this.ollamaUp())) return false;
    const res = await this.host.launchThroughOllama(integration);
    if (!res.ok) return this.fail(t.failed, '');
    this.voice.play('hello');
    this.capri.perform('hop');
    await this.guide.ask({ kind: 'done', face: 'look', line: t.freeOpened, quote: fmt(t.freeOpenedHow, { name }), actions: [{ id: 'ok', label: t.ok, primary: true }] });
    return true;
  }

  // ---------- panels ----------

  // While something runs: what she's doing, no buttons (the scene's end, or the next panel, takes it away).
  working(line, quote = '') {
    this.capri.pulse();
    this.panel.say({ kind: 'work', face: 'calm', line, quote, guide: true, hold: null, token: Symbol('setup') });
  }

  // She can talk: true if you want to now (her chat opens).
  async done() {
    this.voice.play('hello');
    this.capri.perform('hop');
    const id = await this.guide.ask({
      kind: 'done', face: 'laugh', line: this.t.ready, quote: this.t.readyHow,
      actions: [{ id: 'talk', label: this.t.talk, primary: true }, { id: 'later', label: this.t.later }],
    });
    return id === 'talk';
  }

  async fail(line, quote) {
    this.capri.hurt();
    await this.guide.ask({ kind: 'error', face: 'wide', line, quote, actions: [{ id: 'ok', label: this.t.ok, primary: true }] });
    return false;
  }

  size(bytes) {
    const gb = bytes >= 1e9;
    const n = new Intl.NumberFormat(this.brain.lang, { maximumFractionDigits: gb ? 1 : 0 }).format(gb ? bytes / 1e9 : bytes / 1e6);
    return `${n} ${gb ? this.t.gb : this.t.mb}`;
  }
}
