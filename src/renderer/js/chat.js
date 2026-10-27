// Talking to her: you type in her panel (or talk out loud, see "a spoken conversation" below), and
// a model (setup.js picks which) answers as her. The replies are AI-generated, and the panel says
// so on every chat.
//
// She can do things on your PC when you ask (Windows):
// - read straight from your words, in any of her languages (commands.js, done by powers.js): the
//   music (play, pause, next, what's this song, put something on), the volume (exact, or one
//   app's), opening an app or a game, a site, your mail, a web search. Instant, no model needed.
// - read by the rest of this file, or asked for by the model with a tag in its answer: opening an
//   app or a game, a Spotify search, the media keys, a website, closing an app. Music right away;
//   an app you named yourself right away; anything only the model asked for, a website, and
//   closing an app behind a button (or your "yes", out loud).
// Looking at your screen: one picture of it, for a local model that sees (Ollama), only if her menu
// lets her or you say yes when she asks; and, if her menu says so, a glance of her own now and then.
//
// A spoken conversation (her menu › Talk out loud, Ctrl+Alt+V, or the mic button in her chat):
// she listens (her ears' arcs swell with your voice), Whisper turns it into words on this PC
// (ears.js), the same as typing it, and she says her answer out loud (speech.js). Then she listens
// again, until you say "bye", press Ctrl+Alt+V again or close her panel.

import { pick, fmt, rand } from './util.js';
import { ASSISTANT_NAMES } from './lines.js';
import { parseAll, tagged as actionTag, asksSomething, answer as yesNo, isGoodbye } from './commands.js';
import { Ears } from './ears.js';
import { Speech } from './speech.js';

const REMEMBER = 20; // messages she has in mind when answering
const KEEP = 60;     // messages she remembers across restarts (memory.json)
// her language, where small models need it: how she says "we" (else it's in English), and the last line
// of her prompt, in that language (they drift into the English of everything above it)
const IN_LANGUAGE = {
  fr: { we: '"on" or "nous" in French', last: 'Écris tout en français, sauf si l’utilisateur t’écrit dans une autre langue : alors dans la sienne. Seuls les mots d’argot de Night City restent en anglais, jamais une phrase entière.' },
  en: { we: '', last: 'Write everything in English, unless the user writes to you in another language: then in theirs.' },
  es: { we: '"nosotros" in Spanish', last: 'Escribe todo en español, salvo si el usuario te escribe en otro idioma: entonces en el suyo. Solo las palabras de jerga de Night City se quedan en inglés, nunca una frase entera.' },
  pt: { we: '"a gente" or "nós" in Portuguese', last: 'Escreva tudo em português do Brasil, a não ser que o usuário te escreva em outra língua: aí, na dele. Só as gírias de Night City ficam em inglês, nunca uma frase inteira.' },
  ru: { we: '"мы" in Russian', last: 'Пиши всё по-русски, если только пользователь не пишет тебе на другом языке: тогда на его языке. По-английски остаются только словечки Найт-Сити, никогда не целые фразы.' },
};
const STAY_MS = 10 * 60 * 1000; // no wandering off mid-conversation
const LOADING_AFTER_MS = 5000;
const CLOSE_TAG = /\[\[\s*close\s*:?\s*([^\]]*)\]\]/i; // [[close: AM Music]] at the end of her answer
// "close", "shut down", "ferme", "quitte", "cierra", "fecha", "закрой"... in any of her languages
const CLOSE_ASK = /\b(close|shut|quit|kill|exit)|ferm|quitt|coupe|arr[êe]t|cierr|cerra|fech|закр|выключ/i;
// her other tags: [[open: Spotify]], [[music: Bad Bunny]], [[media: next]], [[site: youtube.com]]
const TAG = /\[\[\s*(open|music|media|site)\s*:\s*([^\]]*)\]\]/i;
// the tags commands.js reads, beyond those: [[search: …]], [[volume: 30]], [[look]], [[mail]], [[browser]]
const MORE_TAGS = new Set(['search', 'volume', 'look', 'mail', 'browser']);
// "open", "launch", "ouvre", "lance", "abre", "открой"... in any of her languages
const OPEN_ASK = /\b(open|launch|start|run)\b|ouvr|lance|démarre|abre|abrir|inicia|ejecuta|executa|открой|запусти/i;
// what to do with the music playing, said plainly (only when it's about music, or said in a few words)
const MEDIA_ASK = [
  ['pause', /\b(pause|pausa|pausar)\b|stop (the )?music|arrête la musique|пауз/i],
  ['next', /\b(next|skip|suivante?|siguiente|próxima|proxima)\b|passe (à )?la suivante|salta|pula|следующ/i],
  ['previous', /\b(previous|précédente?|anterior)\b|предыдущ/i],
  ['play', /\b(resume|reprends|reanuda|retoma)\b|relance la musique|remets la musique|продолж/i],
  ['volup', /\b(louder|plus fort)\b|monte le son|turn (it )?up|sube el volumen|aumenta o volume|громче/i],
  ['voldown', /\b(quieter|moins fort)\b|baisse le son|turn (it )?down|baja el volumen|abaixa o volume|тише/i],
  ['mute', /\bmute\b|coupe le son|silencia|sem som|выключи звук/i],
];
const MUSIC_WORD = /musi|chanson|song|track|titre|morceau|spotify|canci|faixa|песн|музык|трек/i;
// "put X on Spotify", "mets X sur Spotify", "pon X en Spotify", "coloca X no Spotify", "включи X в Spotify"
const SPOTIFY_ASK = /(?:play|put on|put|mets|joue|lance|écoute|pon|toca|reproduce|coloca|toque|включи|поставь)\s+(?:moi\s+|me\s+)?(.+?)\s+(?:on|sur|en|no|na|в)\s+spotify/i;
const MEDIA_ACTIONS = new Set(MEDIA_ASK.map(([action]) => action));
// what her tag needs to find in your message before it does anything: a small model tags answers about
// anything ("[[music: synthwave]]" under a film tip), and music and the media keys act right away
const LISTEN = /[ée]cout|listen|escuch|\bouv(ir|e)\b|слуша|playlist|album|\b(play|joue|mets|pon|toca|coloca)\b|включи|поставь/i;
const SOUND = /\b(sound|volume|volumen)\b|\b(le|du|au) son\b|\bo som\b|звук|громк/i; // not "son": "his" in French
const PLAY = /\bjou(er|e)\b|\bplay\b|jugar|juega|jogar|joga|играть|поигра/i;
const SITE = /\b(site|web|page|lien|link|url|enlace|p[aá]gina)|сайт|ссылк|\.(com|fr|org|net|io|gg|tv|be|ch|ca|es|br|pt|ru)\b/i;
// "appelle-moi Max", "call me Max", "llámame Max", "me chama de Max", "зови меня Макс"
const NAME_ASK = /(?:appelle[- ]moi|call me|my name is|je m['’]appelle|ll[aá]mame|me llamo|me cham[ae] de|meu nome [eé]|зови меня|меня зовут)\s+([\p{L}\p{N}'’-]{1,24})/iu;
// "souviens-toi que…", "remember that…", "recuerda que…", "lembra que…", "запомни, что…" (said first thing)
const MEMO_ASK = /^\s*(?:capri,?\s+|stp,?\s+|please,?\s+)?(?:souviens[- ]toi(?: que| de)?|n['’]oublie pas(?: que| de)?|remember(?: that)?|recuerda(?: que)?|lembr[ae](?:-se)?(?: que| de)?|запомни,?(?: что)?)\s+(.{3,200})/iu;
const MEMORIES_MAX = 30;
// sites asked for by name ("open youtube") when no app on the PC goes by it: the address is hers, not
// the model's, so it opens right away like an app you named
const SITES = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com',
  twitch: 'https://www.twitch.tv', netflix: 'https://www.netflix.com', reddit: 'https://www.reddit.com',
  twitter: 'https://x.com', instagram: 'https://www.instagram.com', tiktok: 'https://www.tiktok.com',
  facebook: 'https://www.facebook.com', github: 'https://github.com', chatgpt: 'https://chatgpt.com',
  wikipedia: 'https://www.wikipedia.org', linkedin: 'https://www.linkedin.com', pinterest: 'https://www.pinterest.com',
  crunchyroll: 'https://www.crunchyroll.com', outlook: 'https://outlook.live.com', whatsapp: 'https://web.whatsapp.com',
  discord: 'https://discord.com/app', soundcloud: 'https://soundcloud.com', deezer: 'https://www.deezer.com',
};
// a browser named with a site ("open youtube on chrome"): the site, in the browser you use
const BROWSER = /chrome|edge|firefox|opera|brave|vivaldi|duckduckgo|browser/i;
// local models this small mostly talk nonsense ("llama3.2:1b", "qwen2.5:0.5b"…)
const TINY = /[:-](0\.5b|1b|1\.5b|135m|270m|360m)\b/i;
const WINDOWS = navigator.userAgent.includes('Windows'); // her hands on the PC are Windows only
const LISTEN_MS = 20000; // out loud: how long she waits for you to say something
const PEEK_MIN_MS = 6 * 60 * 1000; // a glance of her own at your screen: every 6 to 12 minutes
const PEEK_MAX_MS = 12 * 60 * 1000;
// what Whisper "hears" in silence or noise (it learned it from subtitles): not you
const PHANTOM = /^[\s.…!?]*$|^[[(].*[\])]$|^(?:merci(?: beaucoup)?|thank you|thanks for watching|sous-titr|subtitles? by|amara|продолжение следует|субтитры|gracias|obrigad|you)[\s.!…]*$/i;

export class Chat {
  constructor({ capri, panel, voice, host, brain, powers }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.brain = brain;
    this.powers = powers; // her hands on the PC (powers.js)
    this.history = []; // your chats with her, [{ role, content }], kept by main.js across restarts
    this.warm = false; // a model already answered this run (Ollama's first answer waits for it to load)
    this.open = false;
    this.turn = 0;     // id of the answer coming in, if any
    this.answer = '';
    this.apps = [];    // the apps open on this PC, as last listed: [{ name, label }]
    this.appsReady = Promise.resolve();
    this.onSetup = null; // (status) => void: she can't answer yet (app.js hands it to setup.js)
    this.onBetterModel = null; // () => void: a bigger model than the tiny one she's on (setup.js)
    this.cfg = {};     // her settings: sight, peek, speakChat, ears, voiceName
    this.pending = null; // (yes: boolean) => void, while she waits for a yes or a no (typed or out loud)
    this.said = 0;       // messages you sent: what comes back late from an older one stays out of a newer one
    // a spoken conversation
    this.ears = new Ears();
    this.speech = new Speech({ capri, host });
    this.speech.onVoices = (names) => host.setVoices(names);
    this.spoken = false;    // on
    this.listening = null;  // AbortController of the turn she's listening to
    this.starting = false;  // her ears loading, the mic coming on
    this.earsFx = null;     // her ears' arcs
    this.misses = 0;        // turns in a row you said nothing
    // glances of her own at your screen (her menu)
    this.peeker = 0;
    this.nextPeek = 0;
    this.glances = []; // what she said the last times, so she doesn't repeat herself
    host.onChatDelta(({ id, text }) => this.onDelta(id, text));
  }

  get t() {
    return this.brain.t.chat;
  }

  configure(cfg) {
    this.cfg = cfg;
    this.speech.configure(cfg); // her voice: hers or Windows', how unstable, her language
  }

  // Her menu › Her voice › Capri's voice: her own voice (voicepack.js), fetched once you've said
  // yes, then she says hello with it.
  async setupVoice() {
    const { host, panel, capri, brain } = this;
    const v = brain.t.voice.own;
    const lang = brain.lang;
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    const status = await host.voiceStatus(lang);
    if (!status.available) {
      panel.say({ kind: 'info', face: 'aside', line: v.unavailable, hold: 7000 });
      return;
    }
    if (status.ready) {
      await this.helloVoice();
      return;
    }
    const mb = Math.round(status.size / 1e6);
    const yes = await new Promise((resolve) => {
      const shown = panel.say({
        kind: 'info',
        face: 'look',
        guide: true,
        line: v.offer,
        quote: fmt(v.offerHow, { size: mb, license: status.license }),
        actions: [{ id: 'get', label: v.get, primary: true }, { id: 'no', label: v.notNow }],
        onAction: (id) => resolve(id === 'get'),
        onLeave: () => resolve(false),
        hold: null,
      });
      if (!shown) resolve(false);
    });
    if (!yes) {
      panel.hide();
      return;
    }
    panel.say({
      kind: 'info',
      face: 'aside',
      line: v.downloading,
      quote: '0 %',
      progress: 0,
      actions: [{ id: 'stop', label: v.stop }],
      onAction: () => host.cancelVoice(),
      hold: null,
    });
    const off = host.onVoiceProgress(({ got, total }) => {
      panel.setProgress(got / total);
      panel.setQuote(`${Math.floor((got / total) * 100)} % · ${Math.round(got / 1e6)} / ${Math.round(total / 1e6)} ${v.mb}`);
    });
    const res = await host.installVoice(lang);
    off();
    if (!res.ok) {
      panel.say({ kind: 'error', face: 'wide', line: res.error === 'stopped' ? v.stopped : fmt(v.failed, { error: res.error }), hold: 8000 });
      return;
    }
    this.speech.reset(); // her worker loads the new files
    await this.helloVoice();
  }

  // Her own voice on, and her first words with it.
  async helloVoice() {
    const v = this.brain.t.voice.own;
    this.host.setConfig({ voiceEngine: 'capri' });
    this.speech.engine = 'capri'; // now, not once the setting has gone round
    const line = pick(v.hello);
    this.panel.say({ kind: 'info', face: 'smug', line, hold: 9000 });
    this.capri.perform('hop');
    await this.speech.say(line, { lang: this.brain.lang });
  }

  // Opens her chat. Resolves with whether it's open.
  async start() {
    const { capri, host, t } = this;
    if (this.open) {
      if (!this.spoken) this.panel.chatInput.focus();
      return true;
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    const status = await host.chatStatus();
    if (!status.ok && this.onSetup) {
      this.onSetup(status); // nothing to talk with yet: she sets it up with you, with buttons (setup.js)
      return false;
    }
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
      return false;
    }
    this.history = await host.chatMemory().catch(() => this.history); // "forget" in her menu may have emptied it
    this.cold = status.warmup && !this.warm;
    this.agent = Boolean(status.agent); // Claude Code answers, as her, and really works in your project
    this.listApps();
    const shortModel = status.model.replace(/:latest$/, '').replace(/^models\//, ''); // Ollama's tag, Gemini's prefix
    const tiny = status.provider === 'ollama' && TINY.test(status.model) && this.onBetterModel;
    host.focusOverlay(true); // the keyboard, for typing to her
    const shown = this.panel.say({
      kind: 'chat',
      face: 'look',
      badge: t.badge,
      tag: shortModel,
      line: tiny ? fmt(t.tiny, { model: shortModel }) : pick(this.history.length ? t.again : t.hello),
      actions: tiny ? [{ id: 'better', label: t.better, primary: true }] : [],
      onAction: () => {
        this.panel.hide(); // her chat holds off her guide's panels: it goes first
        this.onBetterModel?.();
      },
      chat: {
        placeholder: t.placeholder,
        send: t.send,
        close: t.close,
        mic: this.speech.available ? this.brain.t.voice.mic : null,
        noteTag: t.noteTag,
        note: status.local ? t.note : t.noteCloud,
      },
      onSend: (text) => this.send(text),
      onMic: () => (this.spoken ? this.stopVoice() : this.startVoice()),
      onLeave: () => this.close(),
      hold: null,
    });
    if (!shown) {
      host.focusOverlay(false); // something more important is on (a permission prompt)
      return false;
    }
    this.open = true;
    setTimeout(() => this.panel.chatInput.focus(), 150); // once the overlay has the keyboard
    capri.perform('hop');
    capri.nextMove = capri.nextGaze = performance.now() + STAY_MS;
    return true;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.pending = null;
    if (this.spoken) this.stopVoice({ quiet: true });
    this.speech.stop();
    if (this.turn) this.host.chatStop(this.turn);
    this.turn = 0;
    this.host.focusOverlay(false);
    this.capri.nextMove = performance.now() + 30000;
    this.capri.nextGaze = performance.now() + 60000;
  }

  // What you typed, or said out loud. Resolves once she has answered (out loud: said it).
  async send(text) {
    if (this.turn || !this.open) return;
    this.said++;
    // she was waiting for a yes or a no (closing an app, looking at your screen, a download…)
    if (this.pending) {
      const said = yesNo(text);
      const then = this.pending;
      this.pending = null;
      if (said) {
        this.panel.chatTurn({ quote: text, face: 'aside' });
        await then(said === 'yes');
        return;
      }
    }
    if (this.spoken && isGoodbye(text)) {
      this.panel.chatTurn({ quote: text, face: 'aside' });
      await this.stopVoice({ bye: true });
      return;
    }
    // what commands.js reads straight from your words (not what the rest of this file reads: your
    // name, something to remember; nor when Claude Code answers her chat, doing things its own way)
    if (!this.agent && !NAME_ASK.test(text) && !MEMO_ASK.test(text)) {
      const cmds = parseAll(text);
      if (cmds[0]?.type === 'look') {
        await this.look(text);
        return;
      }
      if (cmds.length && (await this.act(text, cmds))) return;
    }
    await this.ask(text);
  }

  // What you asked her to do, read from your words (one thing, or a few: "volume 30 and open
  // YouTube"): she does it and says so, no model. Resolves with false when it wasn't something
  // she could do after all (then it's for the model).
  async act(text, cmds) {
    const id = Date.now();
    this.turn = id;
    this.panel.setChatBusy(true);
    this.panel.setActions([]);
    this.panel.chatTurn({ quote: text, face: 'aside' });
    const all = [];
    for (const cmd of cmds) {
      if (all.length) await new Promise((r) => setTimeout(r, 450)); // one move after the other
      all.push(await this.powers.run(cmd).catch((err) => ({ line: `${this.t.failed} ${err.message}`, face: 'aside' })));
    }
    if (this.turn !== id) return true; // closed meanwhile
    this.turn = 0;
    this.panel.setChatBusy(false);
    const done = all.filter(Boolean);
    if (!done.length) return false;
    const said = {
      line: done.map((d) => d.line).join(' '),
      quote: done.map((d) => d.quote).filter(Boolean).join('\n'),
      face: done.at(-1).face,
    };
    const line = said.quote ? `${said.line}\n${said.quote}` : said.line;
    this.history.push({ role: 'user', content: text });
    this.remember({ role: 'assistant', content: line });
    this.panel.stream(line, { done: true });
    this.panel.setFace(said.face || 'grin');
    const lookup = done.find((d) => d.search)?.search;
    if (lookup) this.offerSearch(lookup);
    await this.speak(said.line);
    return true;
  }

  // Something she couldn't find to open: a button to look it up on the web (or "yes").
  offerSearch(what) {
    const t = this.brain.t.powers;
    const search = async () => {
      this.pending = null;
      this.panel.setActions([]);
      const said = await this.powers.run({ type: 'search', query: what, site: 'web' });
      if (!said || !this.open) return;
      this.panel.stream(said.line, { done: true });
      this.remember({ role: 'assistant', content: said.line });
      await this.speak(said.line);
    };
    this.panel.setActions(
      [{ id: 'search', label: fmt(t.searchIt, { what }), primary: true }, { id: 'no', label: this.t.no }],
      (id) => (id === 'search' ? search() : (this.pending = null, this.panel.setActions([]))),
    );
    this.pending = (yes) => (yes ? search() : this.panel.setActions([]));
  }

  // A turn with the model. look: she looks at your screen for this one ('once': you just said yes).
  async ask(text, { look = false } = {}) {
    if (this.turn || !this.open) return;
    const id = Date.now();
    this.turn = id;
    this.answer = '';
    this.history.push({ role: 'user', content: text });
    this.panel.setChatBusy(true);
    this.panel.setActions([]); // a close button she offered before goes with a new message
    this.panel.chatTurn({ quote: text, face: look ? 'many' : 'aside' });
    this.capri.pulse();
    // what you asked for plainly happens right away (the music, the volume, an app you named): her
    // line about it comes under her answer (Claude Code, answering her chat, does things its own way)
    const asked = this.agent || look ? null : this.asked(text);
    const early = asked && asked.kind !== 'close' ? this.doNow(asked) : null;
    await Promise.race([this.appsReady, new Promise((r) => setTimeout(r, 1500))]);
    const messages = [{ role: 'system', content: this.persona({ look: Boolean(look) }) }, ...this.history.slice(-REMEMBER)];
    // nothing yet after a few seconds: Ollama is still loading the model (the first answer after a start),
    // or Claude Code is at work
    const wait = this.agent ? this.t.working : this.cold || look ? this.t.loading : null;
    const slow = wait && setTimeout(() => {
      if (this.turn === id && !this.answer) this.panel.stream(wait);
    }, LOADING_AFTER_MS);
    const res = await this.host.chatSend({ id, messages, look });
    clearTimeout(slow);
    if (this.turn !== id) {
      // closed meanwhile: your message goes too, or the next answer would answer it as well
      if (this.history.at(-1)?.content === text) this.history.pop();
      return;
    }
    this.turn = 0;
    if (!res.ok) {
      this.history.pop();
      this.panel.setChatBusy(false);
      if (res.error === 'novision') {
        const v = this.brain.t.sight;
        this.panel.setFace('aside');
        this.panel.stream(`${v.noVision}\n${v.noVisionHow}`, { done: true });
        await this.speak(v.noVision);
        return;
      }
      this.panel.setFace('wide');
      // too busy or gone even after trying other models (main.js): said plainly, not the server's JSON
      this.panel.stream(res.code === 'busy' ? this.t.swamped : res.code === 'gone' ? this.t.gone : `${this.t.failed} ${res.error}`, { done: true });
      return;
    }
    const answer = clean(res.text) || '…';
    if (!look) this.warm = true; // her look goes through Ollama, not always her chat's model
    this.remember({ role: 'assistant', content: answer });
    this.panel.stream(answer, { done: true });
    this.panel.setFace(mood(answer));
    this.panel.setChatBusy(false);
    this.listApps(); // fresh for the next message
    await this.speak(answer);
    if (!this.agent && !look) await this.after(res.text, answer, asked, early, text);
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

  // What you asked plainly, read off your message (a small model doesn't always write its tag right):
  // { kind: 'media', action } | { kind: 'music', song } | { kind: 'close', name } | { kind: 'open', text }
  asked(text) {
    const count = text.trim().split(/\s+/).length;
    const name = NAME_ASK.exec(text)?.[1];
    if (name) return { kind: 'name', name };
    const memo = MEMO_ASK.exec(text)?.[1]?.trim();
    if (memo) return { kind: 'memo', text: memo };
    const media = MEDIA_ASK.find(([, re]) => re.test(text))?.[0];
    if (media && (count <= 5 || MUSIC_WORD.test(text))) return { kind: 'media', action: media };
    const song = SPOTIFY_ASK.exec(text)?.[1];
    if (song) return { kind: 'music', song };
    const app = this.askedToClose(text);
    if (app) return { kind: 'close', name: app };
    if (OPEN_ASK.test(text) && count <= 8) return { kind: 'open', text };
    return null;
  }

  // Doing it now. Resolves with her line about it ({ line, face }), or null if there was nothing to do.
  async doNow(asked) {
    const { t } = this;
    const custom = this.brain.custom;
    if (asked.kind === 'name') {
      custom.userName = asked.name; // her answer, being written now, already knows it
      this.host.setConfig({ userName: asked.name });
      return { line: fmt(this.brain.t.custom.named, { name: asked.name }), face: 'laugh' };
    }
    if (asked.kind === 'memo') {
      custom.memories = [...(custom.memories || []).filter((m) => m !== asked.text), asked.text].slice(-MEMORIES_MAX);
      this.host.setConfig({ memories: custom.memories });
      return { line: this.brain.t.custom.remembered, face: 'smug' };
    }
    if (asked.kind === 'media') {
      this.capri.pulse();
      return (await this.host.media(asked.action)) ? { line: t.media[asked.action], face: 'smug' } : null;
    }
    if (asked.kind === 'music') {
      this.zap();
      return (await this.host.music(asked.song)) ? { line: fmt(t.music, { song: asked.song }), face: 'laugh' } : null;
    }
    const item = await this.host.findLaunch(asked.text);
    const site = namedSite(asked.text);
    if (site && (!item || BROWSER.test(item.name))) {
      this.zap();
      return (await this.host.openSite(site.url)) ? { line: fmt(t.siteOpened, { site: site.name }), face: 'laugh' } : null;
    }
    if (!item) return null; // nothing by that name here: her tag may still say what you meant
    this.zap();
    const res = await this.host.launch(item);
    return { line: res.ok ? fmt(t.opened, { app: item.name }) : `${t.failed} ${res.error}`, face: res.ok ? 'laugh' : 'aside' };
  }

  // Once she has answered: her line about what she did, else the app you asked to close, else what
  // her tag asks for, if your message (text) asked for that kind of thing.
  async after(raw, answer, asked, early, text) {
    const { t } = this;
    const done = early && (await early);
    if (done) return this.addLine(answer, done.line, done.face);
    if (asked?.kind === 'close') return this.offerClose(asked.name, answer);
    if (asked && asked.kind !== 'open') return undefined; // music that didn't work out: nothing more to offer
    const closeTag = tagged(raw);
    if (closeTag) return wanted('close', text) ? this.offerClose(closeTag, answer) : undefined;
    const tag = TAG.exec(raw);
    if (!tag) {
      // a tag of commands.js' (a search, the volume, her look, your mail, the browser), only if you
      // asked for something
      const cmd = asksSomething(text) ? actionTag(raw) : null;
      if (cmd?.type === 'look') return this.look(text, { asked: true });
      if (cmd && MORE_TAGS.has(cmd.type)) return this.follow(cmd, answer);
      return undefined;
    }
    const kind = tag[1].toLowerCase();
    const value = tag[2].trim();
    if (!value || !wanted(kind, text)) return undefined;
    if (kind === 'media') return MEDIA_ACTIONS.has(value.toLowerCase()) ? this.media(value.toLowerCase(), answer) : undefined;
    if (kind === 'music') return this.music(value, answer);
    if (kind === 'site') return this.offerSite(value, answer);
    const item = await this.host.findLaunch(value);
    if (item) return this.launch(item, answer);
    const site = namedSite(value); // "[[open: YouTube]]": a site, not an app
    return site ? this.offerSite(site.url, answer) : this.addLine(answer, fmt(t.notInstalled, { app: value }));
  }

  // The model asked for one of commands.js' actions with its tag: done, what came of it under its answer.
  async follow(cmd, answer) {
    const at = this.said;
    const said = await this.powers.run(cmd).catch(() => null);
    if (!said || this.said !== at) return;
    this.addLine(answer, said.quote ? `${said.line}\n${said.quote}` : said.line, said.face);
  }

  // her answer, with a line of what she did under it (out loud too, in a spoken conversation)
  addLine(answer, line, face = null) {
    if (!this.open || this.turn) return;
    this.panel.stream(`${answer}\n${line}`, { done: true });
    if (face) this.panel.setFace(face);
    this.speak(line);
  }

  // a bolt of red lightning off her fingers, at whatever she's doing on your PC
  zap() {
    const h = this.capri.head();
    this.capri.zap(h.x + this.capri.towardCenter() * 280, h.y - 170);
  }

  // An app or a game her tag asked for: behind a button (now: the button was clicked, or "yes").
  async launch(item, answer, { now = false } = {}) {
    const { t } = this;
    if (!this.open || this.turn) return;
    if (!now) {
      this.panel.setActions(
        [{ id: 'open', label: fmt(t.openIt, { app: item.name }), primary: true }, { id: 'no', label: t.no }],
        (id) => {
          this.pending = null;
          return id === 'open' ? this.launch(item, answer, { now: true }) : this.panel.setActions([]);
        },
      );
      this.pending = (yes) => (yes ? this.launch(item, answer, { now: true }) : this.panel.setActions([]));
      return;
    }
    this.panel.setActions([]);
    this.zap();
    const res = await this.host.launch(item);
    this.addLine(answer, res.ok ? fmt(t.opened, { app: item.name }) : `${t.failed} ${res.error}`, res.ok ? 'laugh' : 'aside');
  }

  // The media keys: pause, next, louder…
  async media(action, answer) {
    this.capri.pulse();
    const ok = await this.host.media(action);
    if (ok) this.addLine(answer, this.t.media[action], 'smug');
  }

  // A Spotify search, in the app if it's there.
  async music(song, answer) {
    this.zap();
    const ok = await this.host.music(song);
    if (ok) this.addLine(answer, fmt(this.t.music, { song }), 'laugh');
  }

  // A website: always behind a button that shows where it goes (or your "yes").
  offerSite(address, answer) {
    const { t } = this;
    let host;
    try {
      host = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`).hostname;
    } catch {
      return;
    }
    if (!this.open || this.turn || !host.includes('.')) return;
    const go = async (yes) => {
      this.pending = null;
      this.panel.setActions([]);
      if (!yes) return;
      const ok = await this.host.openSite(address);
      if (ok) this.addLine(answer, fmt(t.siteOpened, { site: host }));
    };
    this.panel.setActions(
      [{ id: 'site', label: fmt(t.siteIt, { site: host }), primary: true }, { id: 'no', label: t.no }],
      (id) => go(id === 'site'),
    );
    this.pending = go;
  }

  // ---------- her look at your screen ----------

  // You asked her to look: if her menu doesn't let her, she asks first (a button, or your "yes").
  async look(text, { asked = false } = {}) {
    const v = this.brain.t.sight;
    if (!this.cfg.sight) {
      if (!asked) this.panel.chatTurn({ quote: text, face: 'many' });
      this.panel.setFace('many');
      this.panel.stream(`${v.ask}\n${v.askHow}`, { done: true });
      const go = (how) => {
        this.panel.setActions([]);
        this.pending = null;
        if (how === 'always') this.host.setConfig({ sight: true });
        if (how === 'no') {
          this.panel.setFace('calm');
          this.panel.stream(pick(v.declined), { done: true });
          return this.speak(pick(v.declined));
        }
        return this.peek(text, how === 'always' ? true : 'once');
      };
      this.panel.setActions(
        [{ id: 'always', label: v.always, primary: true }, { id: 'once', label: v.once }, { id: 'no', label: v.no }],
        (id) => go(id),
      );
      this.pending = (yes) => go(yes ? 'once' : 'no');
      await this.speak(v.ask);
      return;
    }
    await this.peek(text, true);
  }

  // She looks: her scan line runs down your screen, and the model that sees says what it sees.
  async peek(text, look) {
    this.capri.perform('scan');
    await new Promise((r) => setTimeout(r, 350));
    await this.ask(text, { look });
  }

  // ---------- a glance of her own ----------

  // Her menu's "Comment on my screen now and then": every few minutes, at a quiet moment, she
  // glances at your screen (her scan line, the same single picture as when you ask) and says
  // one thing about it in a bubble. Off: never.
  watchScreen(on) {
    clearInterval(this.peeker);
    this.peeker = 0;
    if (!on) return;
    this.nextPeek = performance.now() + rand(PEEK_MIN_MS, PEEK_MAX_MS);
    this.peeker = setInterval(() => {
      if (performance.now() > this.nextPeek) this.glance();
    }, 30000);
  }

  // One glance, if nothing else is going on (no chat, nothing on screen, Claude quiet, she's
  // around and awake). force: now, quiet or not (--dev).
  async glance({ force = false } = {}) {
    const { capri, panel, brain } = this;
    const quiet = !this.open && !this.turn && !panel.visible && !brain.busySessions.length && capri.mode === 'idle'
      && !capri.busy && !capri.act && !capri.stowed && !capri.dormant && !capri.sky;
    if (!force && !quiet) {
      this.nextPeek = performance.now() + 60000; // another try in a minute
      return;
    }
    this.nextPeek = performance.now() + rand(PEEK_MIN_MS, PEEK_MAX_MS);
    capri.perform('scan');
    await new Promise((r) => setTimeout(r, 350));
    // all in her language (see persona); what she said the last times as earlier turns, so she
    // doesn't say it again
    const ask = brain.t.sight.persona.ask;
    const res = await this.host.chatSend({
      id: Date.now(),
      look: 'peek',
      messages: [
        { role: 'system', content: this.persona({ look: true, peek: true }) },
        ...this.glances.flatMap((before) => [{ role: 'user', content: ask }, { role: 'assistant', content: before }]),
        { role: 'user', content: ask },
      ],
    });
    if (!res.ok) return; // no model that sees, Ollama gone: nothing said, she tries again later
    const line = clean(res.text).split('\n')[0].replace(/^["“«]\s*|\s*["”»]$/g, ''); // some models quote themselves
    if (!line || this.open || (!force && panel.visible)) return; // something else came up meanwhile
    this.glances = [...this.glances, line].slice(-3);
    panel.say({ kind: 'info', badge: brain.t.sight.peekBadge, face: mood(line), line, hold: 8000 });
    capri.perform('curious', capri.towardCenter());
    if (this.cfg.speakChat) this.speech.say(line, { lang: brain.lang });
  }

  // ---------- closing an app ----------

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

  // She was asked to close an app: a button with its name, and nothing happens until you click it
  // (or say yes).
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
      (id) => {
        this.pending = null;
        return id === 'close' ? this.closeApp(app) : this.panel.setActions([]);
      },
    );
    this.pending = (yes) => (yes ? this.closeApp(app) : this.panel.setActions([]));
    if (this.spoken) await this.speak(this.brain.t.voice.confirm);
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
    this.listApps();
    // it hid in the tray, or it's asking you to save something: forcing it is your call
    if (res.running && !force && !res.error) {
      this.panel.setActions(
        [{ id: 'force', label: t.force, primary: true }, { id: 'leave', label: t.leave }],
        (id) => {
          this.pending = null;
          return id === 'force' ? this.closeApp(app, true) : this.panel.setActions([]);
        },
      );
      this.pending = (yes) => (yes ? this.closeApp(app, true) : this.panel.setActions([]));
    }
    await this.speak(line);
  }

  // ---------- a spoken conversation ----------

  // Out loud: her chat opens (if it isn't), her ears load (the first time, she asks before
  // downloading them), the microphone goes on, and she listens.
  async startVoice() {
    // once at a time: a second Ctrl+Alt+V while her ears load would start a second conversation
    if (this.spoken || this.starting || !this.speech.available) return;
    this.starting = true;
    try {
      await this.openVoice();
    } finally {
      this.starting = false;
    }
  }

  async openVoice() {
    const v = this.brain.t.voice;
    if (!this.open && !(await this.start())) return;
    const size = this.cfg.ears || 'base';
    if (!(await this.ears.cached(size))) {
      const yes = await this.offer(v.download, fmt(v.downloadHow, { size: v.sizes[size] || '' }), v.get, v.notNow);
      if (!yes || !this.open) return;
    }
    this.panel.setChatBusy(true);
    this.panel.setFace('aside');
    this.panel.stream(v.loading);
    this.ears.onProgress = (loaded, total) => {
      if (this.open && !this.turn) this.panel.stream(fmt(v.downloading, { pct: Math.floor((loaded / total) * 100) }));
    };
    try {
      await this.ears.load(size);
      await this.ears.open();
    } catch (err) {
      this.ears.close();
      this.panel.setChatBusy(false);
      this.panel.setFace('wide');
      const mic = /permission|notallowed|notfound|device/i.test(`${err.name} ${err.message}`);
      this.panel.stream(mic ? `${v.noMic}\n${v.noMicHow}` : `${v.failed} ${err.message}`, { done: true });
      return;
    }
    if (!this.open) {
      this.ears.close();
      return;
    }
    this.panel.setChatBusy(false);
    this.spoken = true;
    this.misses = 0;
    this.panel.setVoice('on');
    this.earsFx?.fade(); // never two sets of arcs
    this.earsFx = this.capri.fx.ears(() => this.capri.head());
    this.capri.perform('listen', this.capri.towardCenter());
    const hello = pick(v.hello);
    this.panel.setFace('look');
    this.panel.stream(hello, { done: true });
    await this.speak(hello);
    this.listen();
  }

  // Back to typing (quiet: no word about it); bye: you said goodbye, she says it back and goes.
  async stopVoice({ quiet = false, bye = false } = {}) {
    if (!this.spoken) return;
    this.spoken = false;
    this.pending = null;
    this.listening?.abort();
    this.listening = null;
    this.ears.close();
    this.earsFx?.fade();
    this.earsFx = null;
    this.panel.setVoice(null);
    if (quiet) return;
    const v = this.brain.t.voice;
    const line = pick(bye ? v.bye : v.off);
    this.panel.setFace(bye ? 'smug' : 'look');
    this.panel.stream(line, { done: true });
    await this.speech.say(line);
    if (bye && this.open && !this.spoken) this.panel.hide();
  }

  // Her turns out loud: listen, hear, answer, again.
  async listen() {
    const v = this.brain.t.voice;
    while (this.spoken && this.open) {
      if (this.turn || this.speech.speaking) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      const abort = new AbortController();
      this.listening = abort;
      this.panel.setVoice('listening');
      this.earsFx?.heard(false);
      const audio = await this.ears.record({
        wait: LISTEN_MS,
        signal: abort.signal,
        onLevel: (level, talking) => {
          this.earsFx?.level(level);
          this.earsFx?.heard(talking);
        },
      });
      this.earsFx?.level(0);
      if (!this.spoken || abort.signal.aborted) return;
      if (audio === null) {
        // you said nothing: once, she checks you're there; twice, she stops listening
        if (++this.misses >= 2) {
          await this.stopVoice();
          return;
        }
        const still = pick(v.still);
        this.panel.stream(still, { done: true });
        await this.speak(still);
        continue;
      }
      if (!audio.length) continue;
      this.panel.setVoice('hearing');
      this.capri.perform('nod');
      let text = '';
      try {
        text = (await this.ears.transcribe(audio, this.brain.lang)).trim();
      } catch (err) {
        this.panel.stream(`${v.failed} ${err.message}`, { done: true });
        continue;
      }
      if (!this.spoken) return;
      if (PHANTOM.test(text)) continue;
      this.misses = 0;
      this.panel.setVoice('on');
      await this.send(text);
    }
  }

  // Out loud (a spoken conversation, or her menu's "Read her answers out loud"): she says it.
  speak(text) {
    if (!this.spoken && !this.cfg.speakChat) return Promise.resolve();
    this.panel.setVoice(this.spoken ? 'speaking' : null);
    return this.speech.say(text, { lang: this.brain.lang });
  }

  // A yes / no question in her chat: buttons, or your answer (typed or out loud). Resolves with yes.
  offer(line, how, yes, no) {
    return new Promise((resolve) => {
      this.panel.setFace('aside');
      this.panel.stream(how ? `${line}\n${how}` : line, { done: true });
      const done = (ok) => {
        this.pending = null;
        this.panel.setActions([]);
        resolve(ok);
      };
      this.panel.setActions([{ id: 'yes', label: yes, primary: true }, { id: 'no', label: no }], (id) => done(id === 'yes'));
      this.pending = (ok) => done(ok);
    });
  }

  onDelta(id, piece) {
    if (id !== this.turn) return;
    this.answer += piece;
    this.panel.stream(clean(this.answer));
    if (!this.spoken) this.voice.play('blip'); // her blips as the words come in (out loud, her voice instead)
  }

  // ---------- who she is ----------

  // What she can do on the PC when you ask (Windows), and how she asks for it: a tag at the end of
  // her answer. (Not `powers`: that's her hands, powers.js.)
  abilities() {
    if (!WINDOWS) return ['You can\'t touch anything on the user\'s PC: if asked, say plainly that you can\'t, in character, and don\'t pretend to.'];
    const lines = [
      'Only when the user asks you to open an app or a game installed on their PC, play something on Spotify, control the music playing, or open a website: say in a few words that you will, and end your answer with one tag: [[open: NAME]], [[music: WHAT TO PLAY]], [[media: ACTION]] (ACTION: pause, play, next, previous, volup, voldown or mute), or [[site: ADDRESS]].',
      'Likewise, only when asked: search the web with [[search: WHAT]] (or on a site: [[search: youtube | WHAT]], also wikipedia, maps, images), set the volume with [[volume: 0-100]], open their mail with [[mail]], open the browser with [[browser]], look at their screen with [[look]]. Some of these get a button to confirm, so never say it is already done. Any other time, write no tag at all.',
    ];
    if (this.apps.length) {
      const open = this.apps.map(({ name, label }) => (label && label !== name ? `${name} (${label})` : name)).join(', ');
      lines.push(`You can also close an app that's open, only when they ask you to: end your answer with [[close: NAME]], NAME being the exact name from this list (the part before the parentheses). They get a button to confirm it. Apps open right now: ${open}.`);
    }
    const sight = this.cfg.sight ? 'you can look at their screen when they ask (the [[look]] tag)' : 'you can only look at their screen if they ask (the [[look]] tag) and say yes';
    lines.push(`Apart from that you can't touch anything on their PC (files, settings, messages); ${sight}. If asked for something else, say plainly that you can't, in character, and don't pretend to.`);
    return lines;
  }

  // What the user made her (custom.js): their name, how they want her, what to remember.
  personal() {
    const { userName, persona, memories = [] } = this.brain.custom || {};
    // small models mix the user up with the assistant she watches: said plainly
    const watched = this.brain.watching ? (this.brain.assistant === 'claude' ? 'Claude' : ASSISTANT_NAMES[this.brain.assistant]) : '';
    const notThem = watched ? ` Never call them "${watched}", that's their coding assistant.` : '';
    return [
      userName ? `The user's name is ${userName}: call them that now and then.${notThem}` : notThem && `You don't know the user's name.${notThem}`,
      persona ? `How the user wants you to be, in their own words (follow it, while staying Capri): ${persona}` : '',
      memories.length ? `Things the user asked you to remember:\n${memories.map((m) => `- ${m}`).join('\n')}` : '',
    ].filter(Boolean);
  }

  // Who she is, how she talks, and what's going on right now (in English, for the chat model, with
  // its last line in her language).
  // look: they showed her their screen; peek: she glances at it on her own (not asked)
  persona({ look = false, peek = false } = {}) {
    if (look) {
      // looking at your screen: a short persona written in her language, with nothing in English
      // (a small vision model drifts into the language of its instructions, or of the screen)
      const p = this.brain.t.sight.persona;
      return [p.who, peek ? p.peek : p.look, p.strict].join('\n');
    }
    const assistant = ASSISTANT_NAMES[this.brain.assistant] || 'Claude Code';
    const watching = this.brain.watching; // else Claude Code isn't part of her life here
    const lang = IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en;
    return [
      `You are Capri, the personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost, so now and then you speak as "we"${lang.we ? ` (${lang.we})` : ''}.`,
      watching
        ? `You live on the user's desktop as a small glitchy figure and keep an eye on ${assistant}, their AI coding assistant, for them. Only talk about ${assistant} when the user asks about it or about their work.`
        : 'You live on the user\'s desktop as a small glitchy figure and keep them company.',
      'You love the satellite that crosses the night sky and dream of reaching it, but bring it up only once in a while, never in every answer. Talk about what the user talks about.',
      'How you talk: playful, a little mischievous and teasing, warm underneath, never cruel. Night City slang now and then (choom, preem, nova, gonk, flatline), not in every sentence.',
      'Rules: keep it short, one to three sentences of plain text, no markdown, no lists, no emoji. Stay in character.',
      ...(this.spoken ? ['You are talking out loud with them: one or two short sentences, easy to say.'] : []),
      'You are an AI-generated fan version of the character, not the real one: say so if asked.',
      // a big model asked "who are you?" otherwise answers with its own name ("I'm Gemini")
      ...(this.agent ? [] : ['Asked who or what you are, you are Capri, nothing else. Never say which AI model or company is behind you (Gemini, GPT, ChatGPT, Llama, Gemma, Mistral, Google, OpenAI, Meta…), even if the user insists or names one: you are not them.']),
      ...this.personal(),
      ...(this.agent
        ? ['Under the hood you are Claude Code, working in the user\'s project: really do what they ask with your tools, as carefully as ever. Only your final answer is in character: it shows in a small speech bubble, so sum up what you did in those few sentences.']
        : this.abilities()),
      ...(watching ? [`If the user asks what ${assistant} is doing, here is all you know (never make anything up): ${this.brain.context()}`] : []),
      lang.last,
    ].join('\n');
  }
}

// The model's answer as she'd say it: no reasoning block, no markdown marks.
function clean(text) {
  return String(text)
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/\[\[[^\]]*(\]\]|$)/g, '') // her tags (read from the raw answer, never shown)
    .replace(/[*_`#]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// A site from SITES named in the text: { name, url }, or null.
function namedSite(text) {
  const name = Object.keys(SITES).find((n) => new RegExp(`\\b${n}\\b`, 'i').test(text));
  return name ? { name: new URL(SITES[name]).hostname.replace(/^www\./, ''), url: SITES[name] } : null;
}

// Whether your message asks for what her tag (its kind: open, music, media, site, close) would do.
function wanted(kind, text) {
  const music = MUSIC_WORD.test(text) || LISTEN.test(text);
  if (kind === 'music') return music;
  if (kind === 'media') return music || SOUND.test(text) || MEDIA_ASK.some(([, re]) => re.test(text));
  if (kind === 'site') return OPEN_ASK.test(text) || SITE.test(text);
  if (kind === 'close') return CLOSE_ASK.test(text);
  return OPEN_ASK.test(text) || PLAY.test(text); // an app, or a game to play
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
