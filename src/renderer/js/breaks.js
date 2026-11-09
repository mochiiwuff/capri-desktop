// Health breaks: after two hours at your PC without a real break (five minutes without touching
// the keyboard or the mouse, as Windows counts it), she tells you to get up, at a quiet moment and
// never in the middle of a game. Not now: she says it again half an hour later. Her menu › Health
// breaks turns it off.

import { fmt, pick } from './util.js';

const EVERY = 2 * 60 * 60 * 1000;
const REAL_BREAK = 5 * 60;          // seconds away that count as a break
const AGAIN = 30 * 60 * 1000;       // "later", or no answer
const CHECK = 60 * 1000;

export class Breaks {
  constructor({ host, panel, brain, capri, pc, quiet }) {
    Object.assign(this, { host, panel, brain, capri, pc, quiet });
    this.enabled = true;
    this.since = Date.now(); // at it since
    this.due = this.since + EVERY;
    setInterval(() => this.check(), CHECK);
  }

  get t() {
    return this.brain.t.breaks;
  }

  async check() {
    const idle = await this.host.pcIdle().catch(() => 0);
    if (idle >= REAL_BREAK) {
      // away a while: that's the break, counted from when you left
      this.since = Date.now() - idle * 1000;
      this.due = Date.now() + EVERY;
      return;
    }
    if (!this.enabled || Date.now() < this.due || this.pc.game || !this.quiet()) return;
    this.due = Date.now() + AGAIN;
    this.remind();
  }

  remind() {
    const { t } = this;
    const minutes = Math.round((Date.now() - this.since) / 60000);
    const time = fmt(t.time, { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
    this.capri.wake();
    this.capri.perform('hop');
    this.panel.say({
      kind: 'info', face: 'look', line: fmt(pick(t.lines), { time }), hold: 20000,
      actions: [{ id: 'pause', label: t.pause, primary: true }, { id: 'later', label: t.later }],
      onAction: (id) => {
        if (id === 'later') {
          this.due = Date.now() + AGAIN;
          this.panel.say({ kind: 'info', face: 'aside', line: t.laterLine, hold: 3500 });
          return;
        }
        this.panel.say({ kind: 'done', face: 'smug', line: pick(t.paused), hold: 4000 });
      },
    });
  }
}
