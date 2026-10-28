// She looks at your screen and says something about it: when you ask (her menu › Look at my screen),
// or on her own now and then (her menu, off until you turn it on). The first time, she tells you
// where the picture goes: to the AI behind her chat, on your PC with a local model, else to that
// service. Then: a picture of the screen she's on (main.js keeps it in memory a moment, never on
// disk), her eyes on the window in front while a scanline sweeps it, and one or two sentences from
// her AI, in character. Her chat remembers what she said, for a while.

import { fmt, rand } from './util.js';
import { clean, mood } from './chat.js';
import { unavailable, featureMessage } from './availability.js';

const FIRST_AFTER = 2 * 60 * 1000; // turned on: her first look a couple of minutes later
const EVERY = [8, 15];             // then every 8 to 15 minutes…
const ACTIVE_MS = 90 * 1000;       // …if you're at your PC (the pointer moved lately)…
const SAME_WINDOW_MS = 25 * 60 * 1000; // …and on another window than last time (or a good while later)
// what her AI is asked about the picture
const PROMPT = 'This is a picture of the user\'s screen right now. If you see a small figure with a big red mane, that\'s you: leave it out. Name one concrete thing you really see on it (the app or website, a title, a picture, a word), then react to it in character: curious, playful or teasing. One or two short sentences, talking to them.';

export class Look {
  constructor({ capri, panel, brain, chat, guide, host, fx, voice, active }) {
    this.capri = capri;
    this.panel = panel;
    this.brain = brain;
    this.chat = chat;
    this.guide = guide;
    this.host = host;
    this.fx = fx;
    this.voice = voice;
    this.active = active; // () => ms since the pointer last moved
    this.auto = false;    // her menu: Look at my screen now and then
    this.asked = false;   // you've been told what it means, and said yes
    this.looking = false;
    this.nextAt = 0;
    this.lastFg = null;
    this.lastAt = 0;
    setInterval(() => this.tick(), 30000);
  }

  get t() {
    return this.brain.t.look;
  }

  configure({ watchScreen, lookAsked }) {
    const on = Boolean(watchScreen) && !unavailable(this.brain, 'screenCapture');
    if (on && !this.auto) this.nextAt = Date.now() + FIRST_AFTER;
    this.auto = on;
    this.asked = Boolean(lookAsked);
  }

  // What looking means (where the picture goes), before the first time. True if you said yes.
  async ask({ auto = false } = {}) {
    const where = await this.host.lookWhere().catch(() => ({}));
    const t = this.t;
    const model = where.model || '…';
    let yes = false;
    await this.guide.scene(async () => {
      this.capri.perform('curious', this.capri.towardCenter());
      const id = await this.guide.ask({
        face: 'look',
        line: t.ask,
        quote: [fmt(where.local ? t.local : t.online, { model, service: where.provider || '' }), auto ? t.auto : ''].filter(Boolean).join('\n'),
        actions: [{ id: 'yes', label: t.yes, primary: true }, { id: 'no', label: t.no }],
      });
      yes = id === 'yes';
    });
    if (yes) {
      this.asked = true;
      await this.host.setConfig({ lookAsked: true, ...(auto && { watchScreen: true }) });
    }
    return yes;
  }

  // From her menu: turned on (she asks first, the first time) or off.
  async setAuto(on) {
    if (on && unavailable(this.brain, 'screenCapture')) {
      this.panel.say({ kind: 'info', face: 'aside', line: featureMessage(this.brain, 'screenCapture'), hold: 9000 });
      return;
    }
    if (!on) {
      this.host.setConfig({ watchScreen: false });
      return;
    }
    if (!this.asked && !(await this.ask({ auto: true }))) return;
    if (this.asked) await this.host.setConfig({ watchScreen: true });
    this.panel.say({ kind: 'info', face: 'smug', line: this.t.on, hold: 3500 });
  }

  // From her menu: one look, now.
  async once() {
    if (unavailable(this.brain, 'screenCapture')) {
      this.panel.say({ kind: 'info', face: 'aside', line: featureMessage(this.brain, 'screenCapture'), hold: 9000 });
      return;
    }
    if (!this.asked && !(await this.ask())) return;
    this.now({ manual: true });
  }

  // On her own: now and then, when you're there, on another window than last time, and she's free.
  tick() {
    if (!this.auto || !this.asked || this.looking || Date.now() < this.nextAt) return;
    if (this.active() > ACTIVE_MS || !this.free()) return;
    const fg = this.capri.windows.fg;
    if (fg === this.lastFg && Date.now() - this.lastAt < SAME_WINDOW_MS) return;
    this.nextAt = Date.now() + rand(EVERY[0], EVERY[1]) * 60 * 1000;
    this.now();
  }

  free() {
    const { capri, panel } = this;
    if (capri.busy || capri.dragging || capri.stowed || capri.dormant || capri.hidden || capri.act || capri.pointing) return false;
    if (!['stand', 'sit'].includes(capri.stance) || capri.mode === 'alert' || capri.mode === 'sleep') return false;
    return !this.chat.open && !this.guide.running && !panel.visible;
  }

  // her eyes on the window in front (or the whole screen) while a scanline sweeps it
  effect() {
    const { wins, fg } = this.capri.windows;
    const win = wins.find((w) => w.id === fg && !w.max);
    const { w, floor } = this.capri.view;
    const rect = win ? () => this.capri.windows.wins.find((o) => o.id === win.id) || null : () => ({ x: 0, y: 0, w, h: floor });
    const toward = win ? Math.sign(win.x + win.w / 2 - this.capri.pos.x) || 1 : this.capri.towardCenter();
    this.capri.perform('curious', toward);
    this.fx.cutin(...this.capri.cutinAt(-toward), { kind: 'eyes', life: 520 });
    this.fx.scan(rect, { covers: () => (win ? this.capri.coversOf(win.id) : []) });
    this.voice.play('charge');
  }

  async now({ manual = false } = {}) {
    if (unavailable(this.brain, 'screenCapture')) return;
    if (this.looking) return;
    this.looking = true;
    const t = this.t;
    try {
      if (manual) {
        if (this.capri.stowed) {
          this.host.setConfig({ visible: true });
          await this.capri.unstow();
        }
        this.capri.wake();
      }
      const snap = await this.host.lookSnap();
      if (!snap.ok) {
        if (manual) this.panel.say({ kind: 'info', face: 'aside', line: fmt(t.failed, { error: snap.error }), hold: 6000 });
        return;
      }
      this.lastFg = this.capri.windows.fg;
      this.lastAt = Date.now();
      this.effect();
      const res = await this.host.lookSay({ id: snap.id, persona: this.chat.lookPersona(), prompt: `${PROMPT}\n${this.chat.languageNote()}` });
      if (!res.ok) {
        if (res.code === 'novision') {
          // her model can't see: said once, and she stops trying on her own
          this.panel.say({ kind: 'info', face: 'aside', line: fmt(t.noVision, { model: String(res.model || '…').replace(/:latest$/, '') }), hold: 9000 });
          if (this.auto) this.host.setConfig({ watchScreen: false });
        } else if (manual) {
          this.panel.say({ kind: 'info', face: 'aside', line: res.code === 'noai' ? t.noAI : fmt(t.failed, { error: res.error || '…' }), hold: 7000 });
        }
        return;
      }
      const text = clean(res.text).replace(/^["“«]\s*|\s*["”»]$/g, ''); // no quotes around what she says
      if (!text) return;
      this.chat.seen = { text, at: Date.now() };
      this.panel.say({ kind: 'info', badge: 'SCAN', face: mood(text), line: text, hold: Math.min(13000, Math.max(5000, 2500 + text.length * 55)) });
    } finally {
      this.looking = false;
    }
  }
}

