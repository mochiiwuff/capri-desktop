// Her voice, out loud: her lines and her chat's answers. Windows' own voices are spoken here; a
// speech service's audio comes from the main process (speech.js there) and plays through her
// sounds' output (voice.js), so her volume and mute apply to it too. A new line cuts off the one
// before, and while she speaks her blips keep quiet.

const LANG_TAGS = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU' };
// Windows' women's voices, when you haven't picked one
const PREFERRED = /hortense|julie|denise|aria|jenny|zira|michelle|helena|laura|elvira|maria|francisca|irina|svetlana|dariya|female/i;
const MAX = 600;

export class Speech {
  constructor({ host, voice }) {
    this.host = host;
    this.voice = voice;       // her sounds (voice.js): its output, volume and mute
    this.provider = 'off';    // config.speech.provider
    this.name = '';           // a Windows voice's name, or the service's voice
    this.lang = 'en';
    this.speaking = false;
    this.source = null;       // the service's audio playing
    this.turn = 0;            // bumped by every new line: an older one arriving late is dropped
    this.last = { text: '', at: 0 };
  }

  configure(cfg) {
    const s = cfg.speech || {};
    this.provider = s.provider || 'off';
    this.name = s.voice || '';
    this.lang = cfg.lang || 'en';
    if (!this.on) this.stop();
  }

  get on() {
    return this.provider !== 'off' && !this.voice.muted;
  }

  say(text) {
    const line = clean(text);
    if (!this.on || !line) return;
    const now = performance.now();
    if (line === this.last.text && now - this.last.at < 4000) return; // the same panel shown again
    this.last = { text: line, at: now };
    this.stop();
    const turn = this.turn;
    if (this.provider === 'windows') this.windows(line);
    else this.service(line, turn);
  }

  windows(line) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(line);
    u.lang = LANG_TAGS[this.lang] || 'en-US';
    const voices = synth.getVoices();
    const mine = voices.filter((v) => v.lang.toLowerCase().startsWith(this.lang));
    u.voice = voices.find((v) => v.name === this.name) || mine.find((v) => PREFERRED.test(v.name)) || mine[0] || null;
    u.pitch = 1.05;
    u.rate = 1.05;
    u.volume = this.voice.volume;
    u.onstart = () => { this.speaking = true; };
    u.onend = u.onerror = () => { this.speaking = false; };
    synth.speak(u);
  }

  async service(line, turn) {
    const res = await this.host.speak(line).catch((err) => ({ error: err.message }));
    if (turn !== this.turn) return;
    if (!res?.audio) {
      if (res?.error) console.warn('[capri] her voice:', res.error);
      return;
    }
    const ctx = this.voice.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    const bytes = res.audio;
    const buffer = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).catch(() => null);
    if (!buffer || turn !== this.turn) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.voice.master);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.speaking = false;
    };
    this.source = src;
    this.speaking = true;
    src.start();
  }

  stop() {
    this.turn++;
    window.speechSynthesis?.cancel();
    try {
      this.source?.stop();
    } catch {
      // already over
    }
    this.source = null;
    this.speaking = false;
  }

  // The voices Windows has for her language (for her menu: pick one)
  static windowsVoices(lang) {
    return (window.speechSynthesis?.getVoices() || []).filter((v) => v.lang.toLowerCase().startsWith(lang)).map((v) => v.name);
  }
}

// What to say out loud: her words only (no tags, code, links or emoji)
function clean(text) {
  return String(text || '')
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#>~|]+/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX);
}
