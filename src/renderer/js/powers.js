// Her hands on the PC: doing what you asked (commands.js read it from what you said), with a
// reaction that fits, and what she says about it. The music (play, pause, next...), the volume
// (the bar by her head), launching an app, opening a page or a search (she throws it at the
// screen). Her look at your screen goes through the chat (it needs the model): see chat.js.
//
// Also hers: the wheel over her turns the volume, a middle click plays / pauses, and while your
// music plays she moves to it now and then (and says something about a new song, once in a while).

import { pick, fmt, rand } from './util.js';

const WATCH_MS = 15000; // how often she checks what's playing
const SITE_NAMES = { web: 'Google', youtube: 'YouTube', wikipedia: 'Wikipedia', maps: 'Google Maps', images: 'Google Images' };

// Sites she knows by name, for "ouvre youtube" when there's no such app.
const KNOWN = {
  youtube: 'youtube.com', youtubemusic: 'music.youtube.com', ytmusic: 'music.youtube.com', google: 'google.com',
  gmail: 'mail.google.com', mail: 'mail.google.com', drive: 'drive.google.com', googledrive: 'drive.google.com',
  maps: 'maps.google.com', googlemaps: 'maps.google.com', traduction: 'translate.google.com', translate: 'translate.google.com',
  googletranslate: 'translate.google.com', traductor: 'translate.google.com', netflix: 'netflix.com', twitch: 'twitch.tv',
  reddit: 'reddit.com', twitter: 'x.com', x: 'x.com', facebook: 'facebook.com', instagram: 'instagram.com',
  github: 'github.com', wikipedia: 'wikipedia.org', wiki: 'wikipedia.org', wikipedie: 'fr.wikipedia.org',
  chatgpt: 'chatgpt.com', claude: 'claude.ai', amazon: 'amazon.com', linkedin: 'linkedin.com', deezer: 'deezer.com',
  spotify: 'open.spotify.com', discord: 'discord.com/app', whatsapp: 'web.whatsapp.com', outlook: 'outlook.live.com',
  tiktok: 'tiktok.com', pinterest: 'pinterest.com', twitchtv: 'twitch.tv', primevideo: 'primevideo.com',
  disneyplus: 'disneyplus.com', crunchyroll: 'crunchyroll.com', steam: 'store.steampowered.com',
  ютуб: 'youtube.com', ютюб: 'youtube.com', гугл: 'google.com', вк: 'vk.com', вконтакте: 'vk.com', яндекс: 'ya.ru',
};

const simple = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

export class Powers {
  constructor({ capri, panel, voice, host, brain }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.brain = brain;
    this.track = null;   // what's playing, as last seen: { title, artist, status }
    this.watcher = 0;
    this.lastLevel = null; // the volume as last shown, for the bar to move from
    this.mailService = 'gmail'; // her menu: where your mail is ('gmail', 'outlook', 'app')
  }

  get t() {
    return this.brain.t.powers;
  }

  // Does it: resolves with what she says about it, { line, quote, face }, or null when it
  // wasn't something she could do after all (an "open" that is neither an app nor a site: then
  // it's a conversation, for the model).
  async run(cmd) {
    switch (cmd.type) {
      case 'media': return this.media(cmd.action);
      case 'playing': return this.playing();
      case 'music': return this.music(cmd.query);
      case 'volume': return this.volume(cmd);
      case 'search': return this.search(cmd);
      case 'open': return this.open(cmd.target);
      case 'launch': return this.launch(cmd.target);
      case 'mail': return this.mail();
      case 'browser': return this.browser();
      default: return null;
    }
  }

  // Something wrong on the way: what she says about it.
  failed(res) {
    const line = /windows only/.test(res.error) ? this.t.windowsOnly : fmt(this.t.failed, { error: res.error });
    this.capri.perform('flinch');
    return { line, face: 'aside', ok: false };
  }

  // Where the things she opens show up: the middle of the screen, a bit high.
  get center() {
    return { x: this.capri.view.w / 2, y: this.capri.view.h * 0.38 };
  }

  // ---------- the web, apps ----------

  async open(target) {
    if (/\.[a-z]{2,}(?:[/:?#]|$)/i.test(target) && !/\s/.test(target)) return this.page(target);
    const app = await this.host.launchApp(target);
    if (app.error && !/windows only/.test(app.error)) return this.failed(app);
    if (!app.missing && !app.error) return this.launched(app.name);
    const site = KNOWN[simple(target)];
    if (site) return this.page(site, target);
    return this.missing(target);
  }

  async launch(target) {
    const app = await this.host.launchApp(target);
    if (app.error) return this.failed(app);
    if (!app.missing) return this.launched(app.name);
    const site = KNOWN[simple(target)];
    if (site) return this.page(site, target);
    return this.missing(target);
  }

  // Neither an app nor a site she knows: she says so, and offers to look it up on the web
  // (`search`: the chat shows the button, or takes your "yes" out loud).
  missing(target) {
    this.capri.perform('curious', this.capri.towardCenter());
    return { line: fmt(this.t.notFoundAsk, { what: target }), face: 'aside', ok: false, search: target };
  }

  // "Une page web", "internet": the browser, on its home.
  async browser() {
    const res = await this.host.openWeb('https://www.google.com');
    if (res.error) return this.failed(res);
    this.capri.cast(this.center.x, this.center.y);
    return { line: pick(this.t.browser), face: 'smug', ok: true };
  }

  // Your mail, on the service picked in her menu: Gmail, Outlook on the web, or the Outlook app
  // (else Windows' Mail app, else Outlook on the web).
  async mail() {
    const where = this.mailService || 'gmail';
    if (where === 'app') {
      for (const name of ['outlook', 'courrier', 'mail']) {
        const app = await this.host.launchApp(name);
        if (app.error) break;
        if (!app.missing) {
          this.capri.cast(this.center.x, this.capri.view.h - 30);
          return { line: fmt(pick(this.t.mail), { where: app.name }), face: 'smug', ok: true };
        }
      }
    }
    const [address, name] = where === 'gmail' ? ['https://mail.google.com', 'Gmail'] : ['https://outlook.live.com/mail/', 'Outlook'];
    const res = await this.host.openWeb(address);
    if (res.error) return this.failed(res);
    this.capri.cast(this.center.x, this.center.y);
    return { line: fmt(pick(this.t.mail), { where: name }), face: 'smug', ok: true };
  }

  launched(name) {
    this.capri.cast(this.center.x, this.capri.view.h - 30); // at the taskbar, where it shows up
    return { line: fmt(pick(this.t.launched), { app: name }), face: 'smug', ok: true };
  }

  async page(address, name = '') {
    const res = await this.host.openWeb(address);
    if (res.error) return this.failed(res);
    if (res.invalid) return { line: fmt(this.t.notFound, { what: address }), face: 'aside', ok: false };
    this.capri.cast(this.center.x, this.center.y);
    return { line: fmt(pick(this.t.opened), { what: name ? capitalize(name) : res.host }), face: 'smug', ok: true };
  }

  async search({ query, site = 'web' }) {
    if (!query) return null;
    const res = await this.host.searchWeb(site, query);
    if (res.error) return this.failed(res);
    this.capri.cast(this.center.x, this.center.y);
    const line = site === 'web' ? fmt(pick(this.t.searched), { query }) : fmt(this.t.searchedOn, { query, site: SITE_NAMES[site] || site });
    return { line, face: 'look', ok: true };
  }

  // ---------- music ----------

  async music(query) {
    const res = await this.host.playMusic(query);
    if (res.error) return this.failed(res);
    this.capri.cast(this.center.x, this.center.y);
    setTimeout(() => this.capri.perform('groove'), 900);
    return { line: fmt(pick(this.t.music), { query, where: res.where }), face: 'smug', ok: true };
  }

  async media(action) {
    const { t, capri } = this;
    const res = await this.host.mediaControl(action);
    if (res.error) return this.failed(res);
    const dir = action === 'previous' ? -capri.facing : capri.facing;
    if (action === 'next' || action === 'previous') capri.perform('swipe', dir || 1);
    else if (action === 'pause' || action === 'stop') capri.perform('hush');
    else capri.perform('groove');
    this.track = res.playing || this.track;
    capri.music = res.playing ? res.playing.status === 'Playing' : action === 'play' || action === 'toggle';
    const playing = res.playing?.title && (action === 'next' || action === 'previous' || action === 'play');
    return {
      line: pick(t[action] || t.play),
      quote: playing ? songName(res.playing) : res.keys ? t.mediaKeys : '',
      face: action === 'pause' || action === 'stop' ? 'calm' : 'grin',
      ok: true,
    };
  }

  async playing() {
    const { t } = this;
    const res = await this.host.nowPlaying();
    if (res.error) return this.failed(res);
    const song = res.playing;
    if (!song?.title) {
      this.capri.perform('curious', this.capri.towardCenter());
      return { line: pick(t.nothingPlaying), face: 'aside', ok: true };
    }
    this.capri.perform('listen', this.capri.towardCenter());
    return { line: pick(t.playingLine), quote: songName(song), face: 'look', ok: true };
  }

  // ---------- volume ----------

  async volume({ app = '', set, delta, mute }) {
    const { t, capri } = this;
    let res = await this.host.volume({ app, set, delta, mute });
    let note = '';
    if (res.missing) {
      // that app makes no sound right now: the PC's volume then
      note = fmt(t.appMissing, { app: capitalize(app) });
      res = await this.host.volume({ set, delta, mute });
    }
    if (res.error) return this.failed(res);
    this.showLevel(res);
    if (mute === true) capri.perform('hush');
    else if ((delta ?? 0) > 0 || (set ?? -1) > (this.lastLevel ?? 50) || mute === false) capri.perform('pump');
    else capri.perform('press');
    this.lastLevel = res.level;
    const level = res.level;
    let line;
    if (mute === true) line = pick(t.muted);
    else if (mute === false) line = pick(t.unmuted);
    else if (res.app) line = fmt(t.appVol, { app: capitalize(res.app), level });
    else if (set !== undefined) line = fmt(pick(t.volSet), { level });
    else line = fmt(pick(delta > 0 ? t.volUp : t.volDown), { level });
    return { line, quote: note, face: mute === true ? 'calm' : 'grin', ok: true };
  }

  // The bar by her head.
  showLevel(res, from = this.lastLevel) {
    const h = this.capri.head();
    const s = this.capri.scale;
    this.capri.fx.meter(h.x, Math.max(64, h.top - 14 - 6 * s), res.level, { label: res.app || 'VOL', muted: res.muted, from: from ?? res.level });
  }

  // The wheel over her: the PC's volume, 4 % a notch, the bar and nothing said.
  async nudge(steps) {
    const before = this.lastLevel;
    const res = await this.host.volume({ delta: steps * 4 });
    if (res.error || res.missing) return;
    this.showLevel(res, before);
    this.lastLevel = res.level;
    this.voice.play('tick');
    if (Math.abs(steps) >= 3) this.capri.perform(steps > 0 ? 'pump' : 'press');
  }

  // Middle click on her: play / pause, the song's name in a short line.
  async toggle() {
    const said = await this.media('toggle');
    if (said) this.panel.say({ kind: 'info', line: said.line, quote: said.quote, face: said.face, hold: 3200 });
  }

  // ---------- your music, on its own ----------

  // Every little while: what's playing, so she can move to it (her menu: "Move to the music"),
  // and now and then say something about a new song. Windows only; stops quietly elsewhere.
  watch(on) {
    clearInterval(this.watcher);
    this.watcher = 0;
    if (!on) {
      this.capri.music = false;
      return;
    }
    const check = async () => {
      const res = await this.host.nowPlaying();
      if (res.error) {
        if (/windows only/.test(res.error)) this.watch(false);
        return;
      }
      const song = res.playing;
      const playing = song?.status === 'Playing';
      const fresh = playing && song.title && this.track && song.title !== this.track.title;
      this.capri.music = playing;
      this.track = song;
      const { capri, panel } = this;
      const quiet = !panel.visible && capri.mode === 'idle' && !capri.busy && !capri.act && !capri.stowed && !capri.dormant;
      if (fresh && quiet && Math.random() < 0.25) {
        panel.say({ kind: 'info', line: fmt(pick(this.t.newTrack), { title: song.title }), quote: songName(song), face: 'smug', hold: 4200 });
        capri.perform('groove');
      }
    };
    setTimeout(check, rand(2000, 5000));
    this.watcher = setInterval(check, WATCH_MS);
  }
}

const capitalize = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// "Get Lucky — Daft Punk"
function songName(song) {
  return [song.title, song.artist].filter(Boolean).join(' — ');
}
