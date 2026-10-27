// Her voice out loud. Two of them:
// - her own (her menu › Her voice › Capri's voice): a neural voice made hers, small and sweet with
//   glitches (speech-worker.js, voicefx.js), fetched once when you say yes (voicepack.js). Played
//   here, a sentence at a time as they come, her head nodding with how loud she is.
// - one of the system's voices (Web Speech, on Windows its built-in voices): when her own isn't
//   there, for her language or yet, or fails. Her head nods with the words.
// Nothing leaves the PC either way.

import { reducedMotion } from './util.js';

const LOCALE = { fr: 'fr', en: 'en', es: 'es', pt: 'pt', ru: 'ru' };

export class Speech {
  constructor({ capri, host }) {
    this.capri = capri;
    this.host = host;
    this.synth = window.speechSynthesis || null;
    this.voiceName = null; // her menu's pick among the system's voices (null: the first in her language)
    this.engine = 'system'; // 'capri': her own voice
    this.glitch = 0.5;      // how unstable her own voice is (her menu)
    this.lang = 'en';
    this.current = null;    // what she's saying: { stop() }
    this.own = null;        // her own voice: { worker, lang, ready: Promise<boolean> }
    this.ctx = null;
    this.seed = 1;
    this.onVoices = null; // (names) => void, the voices in her language, for her menu
    this.synth?.addEventListener('voiceschanged', () => this.announce());
  }

  get available() {
    return Boolean(this.synth) || this.engine === 'capri';
  }

  get speaking() {
    return Boolean(this.current);
  }

  configure({ voiceName = null, voiceEngine = 'system', voiceGlitch = 0.5, lang }) {
    this.voiceName = voiceName;
    this.engine = voiceEngine;
    this.glitch = voiceGlitch;
    if (lang && lang !== this.lang) this.setLang(lang);
    if (this.engine === 'capri') this.prepare(this.lang); // loaded ahead of her first line
  }

  // The system's voices that speak `lang`, best first: the local ones, then the others.
  voices(lang = this.lang) {
    if (!this.synth) return [];
    const base = LOCALE[lang] || 'en';
    return this.synth.getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith(base))
      .sort((a, b) => Number(b.localService) - Number(a.localService));
  }

  setLang(lang) {
    this.lang = lang;
    this.announce();
  }

  announce() {
    this.onVoices?.(this.voices().map((v) => v.name));
  }

  // Her own voice for `lang`, loaded in its worker. Resolves with whether it's there to speak with
  // (not fetched yet, or none in that language: false, and the system's voice speaks).
  prepare(lang) {
    if (this.own?.lang === lang) return this.own.ready;
    this.own?.worker.terminate();
    const worker = new Worker(new URL('./speech-worker.js', import.meta.url), { type: 'module' });
    const ready = this.host.voiceStatus(lang).then((status) => {
      if (!status.ready) return false;
      return new Promise((resolve) => {
        const first = ({ data }) => {
          if (data.type !== 'ready' && data.type !== 'error') return;
          worker.removeEventListener('message', first);
          if (data.type === 'error') console.warn('[capri] her voice:', data.error);
          resolve(data.type === 'ready');
        };
        worker.addEventListener('message', first);
        worker.postMessage({ type: 'load', voice: status.voice, speaker: status.speaker });
      });
    }).catch(() => false);
    this.own = { worker, lang, ready };
    return ready;
  }

  // Forget her own voice's worker (fetched again: it loads the new files).
  reset() {
    this.own?.worker.terminate();
    this.own = null;
  }

  // Says `text`; resolves once she's done (or cut off).
  async say(text, { lang = this.lang } = {}) {
    this.stop();
    const line = speakable(text);
    if (!line) return;
    if (this.engine === 'capri' && (await this.prepare(lang))) {
      const ok = await this.sayOwn(line);
      if (ok !== false) return;
    }
    await this.saySystem(line, lang);
  }

  // Her own voice: the sentences played one after the other as the worker makes them. Resolves
  // false if it failed before a sound came out (then the system's voice says it).
  sayOwn(line) {
    const { worker } = this.own;
    const id = this.seed++;
    this.ctx ||= new AudioContext();
    const ctx = this.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    return new Promise((done) => {
      const queue = [];
      let at = 0;          // when the next sentence starts, in the context's time
      let ended = false;   // the worker made them all
      let playing = 0;     // sentences scheduled and not over yet
      let started = false;
      const sources = [];
      const timers = [];
      const finish = (result) => {
        worker.removeEventListener('message', onMessage);
        timers.forEach(clearTimeout);
        if (this.current === handle) this.current = null;
        done(result);
      };
      const handle = {
        stop: () => {
          worker.postMessage({ type: 'stop', id });
          sources.forEach((s) => { try { s.stop(); } catch { /* already over */ } });
          finish(true);
        },
      };
      const play = ({ audio, sr }) => {
        const buffer = ctx.createBuffer(1, audio.length, sr);
        buffer.copyToChannel(audio, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        at = Math.max(at, ctx.currentTime + 0.03);
        source.start(at);
        sources.push(source);
        playing++;
        started = true;
        // her head nods where she's loud (every quarter second at most)
        if (!reducedMotion.matches) {
          for (const t of loudMoments(audio, sr)) {
            timers.push(setTimeout(() => this.current === handle && this.capri.perform('talk'), (at - ctx.currentTime + t) * 1000));
          }
        }
        at += buffer.duration;
        source.onended = () => {
          playing--;
          if (ended && !playing) finish(true);
        };
      };
      const onMessage = ({ data }) => {
        if (data.id !== id) return;
        if (data.type === 'chunk') play(data);
        else if (data.type === 'end') {
          ended = true;
          if (!playing) finish(started ? true : false);
        } else if (data.type === 'error') {
          console.warn('[capri] her voice:', data.error);
          finish(started ? true : false);
        }
      };
      worker.addEventListener('message', onMessage);
      this.current = handle;
      worker.postMessage({ type: 'say', id, text: line, style: this.glitch, seed: Math.floor(Math.random() * 1e6) });
    });
  }

  // One of the system's voices; her head nods along on the words.
  saySystem(line, lang) {
    if (!this.synth) return Promise.resolve();
    const all = this.voices(lang);
    const voice = all.find((v) => v.name === this.voiceName) || all[0];
    return new Promise((done) => {
      const u = new SpeechSynthesisUtterance(line);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || lang;
      u.rate = 1.04;
      u.pitch = 1.12; // a little higher: she's small, and many
      let nodded = 0;
      u.onboundary = (e) => {
        if (e.name !== 'word' || reducedMotion.matches) return;
        const now = performance.now();
        if (now - nodded > 260) {
          nodded = now;
          this.capri.perform('talk');
        }
      };
      const handle = {
        stop: () => {
          if (this.synth.speaking) this.synth.cancel();
          end();
        },
      };
      const end = () => {
        if (this.current === handle) this.current = null;
        done();
      };
      u.onend = end;
      u.onerror = end;
      this.current = handle;
      this.synth.speak(u);
      // Chromium can stall a long utterance: nudge it along
      const keep = setInterval(() => {
        if (this.current !== handle) clearInterval(keep);
        else if (this.synth.speaking && !this.synth.paused) {
          this.synth.pause();
          this.synth.resume();
        }
      }, 10000);
    });
  }

  stop() {
    this.current?.stop();
    this.current = null;
    if (this.synth?.speaking) this.synth.cancel();
  }
}

// When she's loud in `audio` (seconds from its start), a quarter second apart at least: her nods.
function loudMoments(audio, sr) {
  const step = Math.round(sr * 0.05);
  const levels = [];
  for (let i = 0; i < audio.length; i += step) {
    let s = 0;
    for (let j = i; j < Math.min(audio.length, i + step); j++) s += audio[j] * audio[j];
    levels.push(Math.sqrt(s / step));
  }
  const peak = levels.reduce((m, v) => Math.max(m, v), 1e-6);
  const out = [];
  let last = -1;
  levels.forEach((v, i) => {
    const t = (i * step) / sr;
    if (v > peak * 0.55 && t - last >= 0.26) {
      out.push(t);
      last = t;
    }
  });
  return out;
}

// What a voice should read: no tags, no markdown, no emoji, the dashes as pauses.
function speakable(text) {
  return String(text || '')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+[—–]\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}
