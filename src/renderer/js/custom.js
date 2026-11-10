// Making her yours, from her menu: what she calls you, how you want her to be (her chat), lines of
// yours she says now and then, and things to remember. Each one a panel of her guide with a line
// to type in; each can be skipped. Her chat also takes "call me Max" and "remember that…" (chat.js).

import { fmt } from './util.js';

const LINES_MAX = 30;
const MEMORIES_MAX = 30;

export class Custom {
  constructor({ guide, host, brain, capri, voice }) {
    this.guide = guide;
    this.host = host;
    this.brain = brain;
    this.capri = capri;
    this.voice = voice;
    this.learning = null;
  }

  get t() {
    return this.brain.t.custom;
  }

  // "Make her yours" in her menu
  open() {
    return this.guide.scene(() => this.steps());
  }

  async steps() {
    const t = this.t;
    const { custom } = this.brain;
    this.capri.perform('curious', this.capri.towardCenter());

    const name = await this.field({
      line: t.name,
      quote: custom.userName ? fmt(t.nameNow, { name: custom.userName }) : t.nameHow,
      placeholder: t.namePlaceholder,
    });
    if (!name) return;
    if (name.text) await this.save({ userName: name.text.slice(0, 24) });

    const persona = await this.field({
      line: t.persona,
      quote: custom.persona ? fmt(t.personaNow, { persona: custom.persona }) : t.personaHow,
      placeholder: t.personaPlaceholder,
      clear: Boolean(custom.persona),
    });
    if (!persona) return;
    if (persona.action === 'clear') await this.save({ persona: '' });
    else if (persona.text) await this.save({ persona: persona.text.slice(0, 500) });

    if (!(await this.list('myLines', { line: t.lines, how: t.linesHow, count: t.linesCount, placeholder: t.linePlaceholder, max: LINES_MAX }))) return;
    if (!(await this.list('memories', { line: t.memories, how: t.memoriesHow, count: t.memoriesCount, placeholder: t.memoryPlaceholder, max: MEMORIES_MAX }))) return;

    this.voice.play('hello');
    this.capri.perform('hop');
    await this.guide.ask({ kind: 'done', face: 'laugh', line: t.saved, quote: t.savedHow, actions: [{ id: 'ok', label: t.done, primary: true }] });
  }

  // One line to type in: { text } (trimmed), { action: 'skip' | 'clear' }, or null if it went away.
  async field({ line, quote, placeholder, clear = false }) {
    const t = this.t;
    const got = await this.guide.askText({
      face: 'look', line, quote, placeholder, send: t.save,
      actions: [{ id: 'skip', label: t.skip }, ...(clear ? [{ id: 'clear', label: t.clear }] : [])],
    });
    return got && (got.action ? got : { text: got.text.trim() });
  }

  // A list you add to one at a time (your lines, what she remembers), until "done". False if it went away.
  async list(key, { line, how, count, placeholder, max }) {
    const t = this.t;
    for (;;) {
      const items = this.brain.custom[key] || [];
      const got = await this.guide.askText({
        face: items.length ? 'smug' : 'look',
        line,
        quote: items.length ? fmt(count, { count: items.length, last: items.at(-1) }) : how,
        placeholder,
        send: t.add,
        actions: [{ id: 'done', label: items.length ? t.done : t.skip }, ...(items.length ? [{ id: 'clear', label: t.clear }] : [])],
      });
      if (!got) return false;
      if (got.action === 'done') return true;
      if (got.action === 'clear') {
        await this.save({ [key]: [] });
        continue;
      }
      const text = got.text.trim().slice(0, 200);
      if (text) await this.save({ [key]: [...items.filter((i) => i !== text), text].slice(-max) });
    }
  }

  // Review only the new, opt-in learned store. Existing manually saved memories remain separate.
  async reviewLearning() {
    if (!this.learning) return;
    return this.guide.scene(async () => {
      const t = this.t;
      for (const entry of [...this.learning.entries]) {
        const evidence = this.learning.evidenceLabel(entry.evidence, this.brain.lang);
        const kind = this.learning.kindLabel(entry.kind, this.brain.lang);
        const got = await this.guide.askText({
          face: 'look',
          line: t.memories,
          quote: `${kind} · ${evidence} · ${Math.round((entry.confidence || 0) * 100)}%\n${entry.text}`,
          placeholder: t.memoryPlaceholder,
          send: t.save,
          actions: [{ id: 'delete', label: t.learningDelete }, { id: 'done', label: t.done }],
        });
        if (!got || got.action === 'done') return;
        if (got.action === 'delete') {
          await this.learning.remove(entry.id);
        } else if (got.text) {
          const saved = await this.learning.correct(entry.id, got.text);
          if (!saved) {
            await this.guide.ask({ face: 'aside', line: t.memories, quote: t.learningBlocked, actions: [{ id: 'ok', label: t.done, primary: true }] });
          }
        }
      }
    });
  }

  // Deleting the learned store is a separate, explicit confirmation; the original chat and manual
  // memory lists are not touched.
  async forgetLearning() {
    if (!this.learning?.entries.length) return;
    return this.guide.scene(async () => {
      const t = this.t;
      const id = await this.guide.ask({
        face: 'aside',
        line: t.memories,
        quote: fmt(t.learningForgetAsk, { count: this.learning.entries.length }),
        actions: [
          { id: 'delete', label: t.learningDeleteAll, primary: true },
          { id: 'cancel', label: t.skip },
        ],
      });
      if (id === 'delete') await this.learning.clear();
    });
  }

  // Saved, and known right away (brain.custom), before the config comes back around.
  async save(patch) {
    Object.assign(this.brain.custom, patch);
    await this.host.setConfig(patch);
  }
}
