// Talking to her: you type in her panel, and a model (setup.js picks which) answers as her, in
// writing. The replies are AI-generated, and the panel says so on every chat.
// She can do a few things on your PC when you ask (Windows, Linux): open an app or a game, play music or
// control what's playing, open a website, close an app. She spots what you want in what you wrote,
// or the model asks for it with a tag in its answer. Music right away; an app you named yourself
// right away; anything only the model asked for, a website, and closing an app behind a button.

import { pick, fmt, cameUp, itemIn } from './util.js';
import { ASSISTANT_NAMES } from './lines.js';

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
// "close", "shut down", "ferme", "quitte", "cierra", "fecha", "закрой", "zamknij"... in any of her languages
const CLOSE_ASK = /\b(close|shut|quit|kill|exit)|ferm|quitt|coupe|arr[êe]t|cierr|cerra|fech|закр|выключ|zamknij|wyłącz|wylacz|ubij/i;
// her other tags: [[open: Spotify]], [[music: Bad Bunny]], [[media: next]], [[site: youtube.com]]
const TAG = /\[\[\s*(open|music|media|site)\s*:\s*([^\]]*)\]\]/i;
// Claude Code's, in her chat: [[show: /home/you/notes.txt]], a file or a folder for her to show you
const SHOW_TAG = /\[\[\s*show\s*:\s*([^\]]+?)\s*\]\]/i;
// "open", "launch", "ouvre", "lance", "abre", "открой", "otwórz"... in any of her languages
const OPEN_ASK = /\b(open|launch|start|run)\b|ouvr|lance|démarre|abre|abrir|inicia|ejecuta|executa|открой|запусти|otwórz|otworz|uruchom|odpal|włącz|wlacz/i;
// what to do with the music playing, said plainly (only when it's about music, or said in a few words)
const MEDIA_ASK = [
  ['pause', /\b(pause|pausa|pausar|pauza)\b|stop (the )?music|arrête la musique|пауз|zatrzymaj/i],
  ['next', /\b(next|skip|suivante?|siguiente|próxima|proxima)\b|passe (à )?la suivante|salta|pula|следующ|następn|nastepn/i],
  ['previous', /\b(previous|précédente?|anterior)\b|предыдущ|poprzedni/i],
  ['play', /\b(resume|reprends|reanuda|retoma)\b|relance la musique|remets la musique|продолж|wznów|wznow|graj dalej|\bplay (some |the )?music\b|(puść|pusc|włącz|wlacz|odpal|zagraj|odtwórz|odtworz) (jaką[sś] |jakas |coś |cos )?muzy|^\s*(graj|puść|pusc|play)\s*[.!]?\s*$/i],
  ['volup', /\b(louder|plus fort)\b|monte le son|turn (it )?up|sube el volumen|aumenta o volume|громче|głośniej|glosniej|podgłoś|podglos/i],
  ['voldown', /\b(quieter|moins fort)\b|baisse le son|turn (it )?down|baja el volumen|abaixa o volume|тише|ciszej|przycisz|ścisz|scisz/i],
  ['mute', /\bmute\b|coupe le son|silencia|sem som|выключи звук|wycisz|wyłącz dźwięk|wylacz dzwiek/i],
];
const MUSIC_WORD = /musi|chanson|song|track|titre|morceau|spotify|canci|faixa|песн|музык|трек|muzyk|piosenk|utw[oó]r/i;
// "put X on Spotify", "mets X sur Spotify", "pon X en Spotify", "coloca X no Spotify", "включи X в Spotify", "puść X na Spotify"
const SPOTIFY_ASK = /(?:play|put on|put|mets|joue|lance|écoute|pon|toca|reproduce|coloca|toque|включи|поставь|puść|pusc|włącz|wlacz|zagraj)\s+(?:moi\s+|me\s+|mi\s+)?(.+?)\s+(?:on|sur|en|no|na|в)\s+spotify/i;
const MEDIA_ACTIONS = new Set(MEDIA_ASK.map(([action]) => action));
// what her tag needs to find in your message before it does anything: a small model tags answers about
// anything ("[[music: synthwave]]" under a film tip), and music and the media keys act right away
const LISTEN = /[ée]cout|listen|escuch|\bouv(ir|e)\b|слуша|playlist|album|\b(play|joue|mets|pon|toca|coloca)\b|включи|поставь|posłuch|posluch|puść|pusc|włącz|wlacz|zagraj/i;
const SOUND = /\b(sound|volume|volumen)\b|\b(le|du|au) son\b|\bo som\b|звук|громк|dźwięk|dzwiek|głośno|glosno/i; // not "son": "his" in French
const PLAY = /\bjou(er|e)\b|\bplay\b|jugar|juega|jogar|joga|играть|поигра|zagra|pogra|grać|grac/i;
const SITE = /\b(site|web|page|lien|link|url|enlace|p[aá]gina|stron)|сайт|ссылк|\.(com|fr|org|net|io|gg|tv|be|ch|ca|es|br|pt|ru|pl)\b/i;
// "appelle-moi Max", "call me Max", "llámame Max", "me chama de Max", "зови меня Макс", "mów mi Max"
const NAME_ASK = /(?:appelle[- ]moi|call me|my name is|je m['’]appelle|ll[aá]mame|me llamo|me cham[ae] de|meu nome [eé]|зови меня|меня зовут|m[óo]w mi|nazywam si[ęe]|mam na imi[ęe])\s+([\p{L}\p{N}'’-]{1,24})/iu;
// "souviens-toi que…", "remember that…", "recuerda que…", "lembra que…", "запомни, что…", "zapamiętaj, że…" (said first thing)
const MEMO_ASK = /^\s*(?:capri,?\s+|stp,?\s+|please,?\s+)?(?:souviens[- ]toi(?: que| de)?|n['’]oublie pas(?: que| de)?|remember(?: that)?|recuerda(?: que)?|lembr[ae](?:-se)?(?: que| de)?|запомни,?(?: что)?|zapami[ęe]taj,?(?: że| ze)?)\s+(.{3,200})/iu;
// "zap me", "électrocute-moi", "dame un calambre", "me dá um choque", "ударь током", "poraź mnie prądem"
const ZAP_ASK = /\b(zap|shock|tase)\s+me\b|lectroc|lectris|calambre|\bchoque\b|eletroc|током|pora[źz]|razi[ćc]|pr[ąa][dđð]em/i;
// "show me ~/notes.txt", "where is package.json", "pokaż mi folder src", "montre-moi le dossier ~/Images"
const SHOW_ASK = /\b(show|reveal|where(?:'s| is))\b|montre|o[ùu] est|mu[eé]str|d[oó]nde est|mostr|onde (?:est[aá]|fica)|покажи|где (?:лежит|находится)|poka[żz]|gdzie/i;
// what to show: a quoted name, a path, what comes after "file"/"folder", or a name with an extension
const FILE_IN = [
  /["“«]([^"”»]+)["”»]/,
  /(?:^|\s)((?:~|\.{1,2})?\/[^\s"'”»]+|~|[A-Za-z]:\\[^\s"'”»]+)/,
  /(?:file|folder|directory|plik\S*|katalog\S*|fichier|dossier|archivo|carpeta|arquivo|pasta|файл\S*|папк\S*)\s+([^\s"'”»]+)/i,
  /(?:^|\s)([\w-]+\.[A-Za-z0-9]{1,6})(?=[\s.,!?]*$|\s)/,
];
const POINT_MS = 8000;
// "przypomnij mi za 10 min o…", "remind me in 1 h 30 min to…", "minutnik 25 min", "timer 5 min"
const REMIND_ASK = /przypomnij|remind|rappelle|recu[eé]rda|lembr|напомни|minutnik|timer|minuteur|temporizador|таймер/i;
const DURATION = /(\d+(?:[.,]\d+)?)\s*(h|godz\p{L}*|hours?|heures?|horas?|час\p{L}*|m|min\p{L}*|мин\p{L}*|s|sek\p{L}*|sec\p{L}*|seg\p{L}*|сек\p{L}*)(?!\p{L})/giu;
const REMIND_WORDS = /\b(?:capri,?|przypomnij|remind|rappelle|recu[eé]rdame|lembra|minutnik|timer|minuteur|temporizador|mi|me|moi|za|in|dans|en|em|o|about|to|de|que|of|please|prosz[ęe]|stp)\b|-moi|-me|напомни|мне|через|таймер|о(?!\p{L})/giu;
// "zrób zrzut ekranu", "screenshot", "capture d'écran", "captura de pantalla", "скриншот"
const SHOT_ASK = /zrzut\p{L}*\s+ekranu|screen\s?shot|print\s?screen|zr[óo]b\s+screena?|capture d['’][ée]cran|captura de (?:pantalla|tela)|скриншот|снимок экрана/iu;
// "zrzut okna", "screenshot of the window", "capture de la fenêtre": a window, not the whole screen
const WINDOW_WORD = /okn\p{L}*|window|fen[êe]tre|ventana|janela|окн\p{L}*/iu;
// "pokaż ostatnio pobrany", "latest download", "dernier téléchargement", "último download", "последний скачанный"
const LATEST_ASK = /(?:ostatni\p{L}*|najnowsz\p{L}*|latest|last|newest|derni\p{L}*|[uú]ltim\p{L}*|последн\p{L}*)\s+(?:\p{L}+\s+)?(?:pobran\p{L}*|[śs]ci[ąa]gni\p{L}*|download\p{L}*|t[ée]l[ée]charg\p{L}*|descarg\p{L}*|baixad\p{L}*|скачан\p{L}*|загру\p{L}*)/iu;
// "open it", "otwórz go", "to otwórz", "ouvre-le", "ábrelo", "abre", "открой его": what she just showed you
const OPEN_IT = /^\s*(?:capri,?\s+)?(?:(?:to|go|j[ąa]|it)\s+)?(?:open|otw[óo]rz|ouvre|[aá]bre|abra|открой)(?:[\s-]*(?:it|go|to|j[ąa]|le|la|lo|o|a|его|её|ее))?(?:\s+(?:please|prosz[ęe]|stp))?\s*[.!]*\s*$/i;
const MEMORIES_MAX = 30;
// "@capri-desktop fix the tests": a task for another of your Claude Code sessions (a name in quotes if it has spaces)
const HANDOFF = /^\s*@("[^"]+"|[^\s:,"]+)[\s:,]+(\S[\s\S]*)$/;
const HANDOFF_TAG = /\[\[\s*handoff\s*:\s*([^\]:]+?)\s*:\s*([^\]]+?)\s*\]\]/i; // [[handoff: capri-desktop: run the tests]]
const HANDOFF_SHOWN = 4; // sessions offered as buttons
const SUGGESTED = 6;     // sessions offered as you type "@"
const HELD_MS = 5000; // an idle session starts on a task at once: still idle by then, it's holding it
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

// how long your message says, in ms ("1 h 30 min", "90 s", "2,5 min"), or 0
function duration(text) {
  let ms = 0;
  for (const [, n, unit] of text.matchAll(DURATION)) {
    const u = unit.toLowerCase();
    const per = /^(h|godz|hour|heure|hora|час)/.test(u) ? 3600e3 : /^(s|sek|sec|seg|сек)/.test(u) ? 1e3 : 60e3;
    ms += parseFloat(n.replace(',', '.')) * per;
  }
  return Math.round(ms);
}

// "1 h 30 min", "45 s"
function span(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h && `${h} h`, m && `${m} min`, !h && sec && `${sec} s`].filter(Boolean).join(' ') || '0 s';
}

// the file or folder named in your message, if any
function fileIn(text) {
  for (const re of FILE_IN) {
    const name = re.exec(text)?.[1]?.replace(/[.,!?:;]+$/, '');
    if (name) return name;
  }
  return null;
}

// the window, front first, that has the middle of `rect` in it, or null
function windowAt(wins, rect) {
  if (!rect) return null;
  const x = rect.x + rect.w / 2, y = rect.y + rect.h / 2;
  return wins.find((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) || null;
}

// find() once it finds something, checked every 100 ms, or null after max ms
function waitFor(find, max) {
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
    this.sessions = []; // your other Claude Code sessions, as last listed (agents.js)
    this.via = 'desktop'; // where you're talking to her from: the answers to the tasks she hands go back there
    this.appsReady = Promise.resolve();
    this.onSetup = null; // (status) => void: she can't answer yet (app.js hands it to setup.js)
    this.onBetterModel = null; // () => void: a bigger model than the tiny one she's on (setup.js)
    host.onChatDelta(({ id, text }) => this.onDelta(id, text));
  }

  get t() {
    return this.brain.t.chat;
  }

  // to: a session picked in her menu, its name typed for you ("@name ", the task is yours to write)
  async start(to = null) {
    const { capri, host, t } = this;
    const address = () => {
      if (to) this.panel.chatInput.value = `@${/^[^\s:,"]+$/.test(to) ? to : `"${to}"`} `;
    };
    if (this.open) {
      // Alt+C again while you're typing to her: she closes it
      if (!to && document.hasFocus() && document.activeElement === this.panel.chatInput) {
        this.panel.hide();
        return;
      }
      // back to her (Alt+C) from another window: the keyboard comes back to her too
      host.focusOverlay(true);
      address();
      this.panel.chatInput.focus();
      return;
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    const status = await host.chatStatus();
    if (!status.ok && this.onSetup) {
      this.onSetup(status); // nothing to talk with yet: she sets it up with you, with buttons (setup.js)
      return;
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
      return;
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
        noteTag: t.noteTag,
        note: status.local ? t.note : t.noteCloud,
        suggest: (prefix) => this.suggestSessions(prefix),
        history: () => this.host.chatMemory(),
        historyLabel: t.history,
        historyBack: t.historyBack,
        historyEmpty: t.historyEmpty,
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
    address();
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
    this.handing = null;
    this.answer = '';
    // one conversation, here and on Telegram: what was said on the other side since counts too
    this.history = await this.host.chatMemory().catch(() => this.history);
    this.history.push({ role: 'user', content: text });
    this.panel.setChatBusy(true);
    this.panel.setActions([]); // a close button she offered before goes with a new message
    this.panel.chatTurn({ quote: text, face: 'aside' });
    this.capri.pulse();
    const handoff = HANDOFF.exec(text);
    if (handoff) return this.handoff(handoff[1].replace(/^"|"$/g, ''), handoff[2].trim());
    // what you asked for plainly happens right away (the music, the volume, an app you named): her
    // line about it comes under her answer. With Claude Code answering her chat, that much she does
    // on her own, without it; the rest is its job, done its own way.
    await Promise.race([this.appsReady, new Promise((r) => setTimeout(r, 1500))]);
    const asked = this.asked(text);
    if (this.agent && asked && (await this.quick(asked))) return;
    const early = !this.agent && asked && asked.kind !== 'close' ? this.doNow(asked) : null;
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
      // too busy or gone even after trying other models (main.js): said plainly, not the server's JSON
      this.panel.stream(res.code === 'busy' ? this.t.swamped : res.code === 'gone' ? this.t.gone : `${this.t.failed} ${res.error}`, { done: true });
      this.panel.setChatBusy(false);
      return;
    }
    const answer = clean(res.text) || '…';
    this.warm = true;
    this.remember({ role: 'assistant', content: answer });
    this.panel.stream(answer, { done: true });
    this.panel.setFace(mood(answer));
    this.panel.setChatBusy(false);
    // a task for another session: her Claude Code's tool (queueHandoff), or her model's tag
    const handTag = this.handing ? [null, this.handing.name, this.handing.task] : HANDOFF_TAG.exec(res.text);
    this.handing = null;
    if (handTag) this.handoff(handTag[1], handTag[2], answer);
    else if (!this.agent) this.after(res.text, answer, asked, early, text);
    else if (SHOW_TAG.test(res.text)) this.showTagged(SHOW_TAG.exec(res.text)[1], answer);
    this.listApps(); // fresh for the next message
  }

  // an answer of hers, kept with your message before it
  remember(message) {
    this.history.push(message);
    this.history = this.history.slice(-KEEP);
    this.host.chatRemember(this.history);
  }

  listApps() {
    this.appsReady = Promise.all([
      this.host.openApps().then((list) => { this.apps = list || []; }),
      this.host.agentSessions().then((list) => { this.sessions = list || []; }),
    ]).catch(() => {});
  }

  // What you asked plainly, read off your message (a small model doesn't always write its tag right):
  // { kind: 'media', action } | { kind: 'music', song } | { kind: 'close', name } | { kind: 'open', text } | { kind: 'zap' }
  // | { kind: 'show', name } | { kind: 'file', name, text? } (a file or a folder to open)
  // | { kind: 'remind', ms, what } | { kind: 'shot', app, window } | { kind: 'latest', open }
  asked(text) {
    const count = text.trim().split(/\s+/).length;
    const name = NAME_ASK.exec(text)?.[1];
    if (name) return { kind: 'name', name };
    const remind = REMIND_ASK.test(text) && duration(text);
    if (remind) return { kind: 'remind', ms: remind, what: text.replace(DURATION, ' ').replace(REMIND_WORDS, ' ').replace(/[\s,.:!?]+/g, ' ').trim() };
    if (SHOT_ASK.test(text) && count <= 10) {
      const app = this.appIn(text);
      return { kind: 'shot', app, window: Boolean(app) || WINDOW_WORD.test(text) };
    }
    if (LATEST_ASK.test(text) && count <= 8) return { kind: 'latest', open: OPEN_ASK.test(text) };
    const memo = MEMO_ASK.exec(text)?.[1]?.trim();
    if (memo) return { kind: 'memo', text: memo };
    if (ZAP_ASK.test(text) && count <= 8) return { kind: 'zap' };
    const file = SHOW_ASK.test(text) && !/https?:|www\./i.test(text) && fileIn(text);
    if (file) return { kind: 'show', name: file };
    const media = MEDIA_ASK.find(([, re]) => re.test(text))?.[0];
    if (media && (count <= 5 || MUSIC_WORD.test(text))) return { kind: 'media', action: media };
    const song = SPOTIFY_ASK.exec(text)?.[1];
    if (song) return { kind: 'music', song };
    const app = this.askedToClose(text);
    if (app) return { kind: 'close', name: app };
    if (OPEN_IT.test(text) && this.shown) return { kind: 'file', name: this.shown };
    const named = OPEN_ASK.test(text) && !/https?:|www\./i.test(text) && fileIn(text);
    if (named && count <= 8) return { kind: 'file', name: named, text };
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
    if (asked.kind === 'zap') { // at your pointer, wherever it is on her screen
      const at = await this.host.cursor().catch(() => null);
      const h = this.capri.head();
      const hit = at?.inside ? this.capri.zap(at.x, at.y) : this.capri.zap(h.x + this.capri.towardCenter() * 280, h.y - 170);
      return hit ? { line: t.zapped, face: 'smug' } : null;
    }
    if (asked.kind === 'remind') {
      this.remind(Date.now() + asked.ms, asked.what);
      return { line: fmt(t.remindSet, { when: span(asked.ms) }), face: 'smug' };
    }
    if (asked.kind === 'shot') {
      // a window: the app you named, else the one in front (not her: hers isn't in the list)
      const { fg, wins } = this.capri.windows;
      const front = (wins.find((w) => w.id === fg) || wins[0])?.id;
      // the whole screen: not her nor her chat in it, the overlay goes see-through for a moment
      if (!asked.window) {
        document.body.style.visibility = 'hidden';
        await new Promise((r) => setTimeout(r, 200));
      }
      const file = await this.host.screenshot(asked.window ? { app: asked.app, id: asked.app ? null : front } : null).catch(() => null);
      document.body.style.visibility = '';
      if (!file) return null;
      this.capri.flash([[1, 1, 1]]); // a camera flash, one white drawing
      this.panel.sendFile?.(file); // on Telegram: the picture itself
      const done = await this.show(file);
      return done && { line: fmt(t.screenshot, { name: done.name }), face: 'laugh' };
    }
    if (asked.kind === 'latest') {
      const file = await this.host.latestDownload().catch(() => null);
      return file ? this.show(file, { open: asked.open }) : { line: t.noDownloads, face: 'aside' };
    }
    if (asked.kind === 'show') return this.show(asked.name);
    if (asked.kind === 'file') {
      const done = await this.show(asked.name, { open: true });
      // not a file here ("open youtube.com"): an app or a site, as for any "open"
      return done || (asked.text ? this.doNow({ kind: 'open', text: asked.text }) : null);
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
    if (!tag) return undefined;
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

  // her answer, with a line of what she did under it
  addLine(answer, line, face = null) {
    if (!this.open || this.turn) return;
    this.panel.stream(`${answer}\n${line}`, { done: true });
    if (face) this.panel.setFace(face);
  }

  // A file or a folder you asked to see: selected in the file manager, and she points at it (or at its
  // window) for a while. null if there's no such thing: the model answers then.
  // Opened (open: true): a folder in the file manager, a file in its app, and she points at the window.
  async show(name, { open = false } = {}) {
    const { capri } = this;
    const before = capri.windows;
    const shown = await this.host.showFile(name, { open });
    if (!shown.found) return null;
    this.shown = shown.path; // for "open it" next
    if (open) this.zap();
    // the file manager comes up: a new window, or the one already there, brought back
    // or none: a window already showing that folder just selects it, and stays where it is
    const win = await waitFor(() => cameUp(before, capri.windows), 2500)
      || (!open && windowAt(capri.windows.wins, await this.host.locateFile(shown.name).catch(() => null)));
    if (win && capri.canPoint(win)) {
      const rect = open ? win : await itemIn(this.host, win, shown.name); // the file itself, if she can see it
      capri.pointAt(rect, { label: shown.name });
      setTimeout(() => {
        if (capri.pointing?.rect === rect) capri.stopPointing();
      }, POINT_MS);
    }
    return open
      ? { line: fmt(this.t.opened, { app: shown.name }), face: 'laugh', name: shown.name }
      : { line: fmt(this.t.shown, { name: shown.name }), face: 'look', name: shown.name };
  }

  // Her reminders, kept in the config across restarts: [{ at, what }]. One missed while she was off
  // comes as soon as she's back.
  arm(reminders = []) {
    this.reminders = [];
    for (const r of reminders) this.remind(r.at, r.what);
  }

  remind(at, what) {
    const r = { at, what: what || '' };
    this.reminders = [...(this.reminders || []), r];
    this.host.setConfig({ reminders: this.reminders });
    setTimeout(() => this.ring(r), Math.max(1000, at - Date.now()));
  }

  async ring(r) {
    this.reminders = this.reminders.filter((x) => x !== r);
    this.host.setConfig({ reminders: this.reminders });
    const { capri, panel, t } = this;
    if (capri.stowed) await capri.unstow();
    capri.wake();
    this.voice.play('alert');
    const cursor = await this.host.cursor().catch(() => null);
    if (cursor?.inside) await capri.summon(cursor);
    panel.say({
      kind: 'alert',
      face: 'wide',
      badge: t.reminderBadge,
      line: t.remindDue,
      quote: r.what,
      actions: [{ id: 'ok', label: t.ok, primary: true }],
      onAction: () => panel.hide(),
      hold: null,
    });
  }

  // Claude Code found it, she shows it: its line about it, hers under it
  async showTagged(name, answer) {
    const done = await this.show(name);
    if (done) this.addLine(answer, done.line, done.face);
  }

  // a bolt of red lightning off her fingers, at whatever she's doing on your PC
  zap() {
    const h = this.capri.head();
    this.capri.zap(h.x + this.capri.towardCenter() * 280, h.y - 170);
  }

  // An app or a game her tag asked for: behind a button (now: the button was clicked).
  async launch(item, answer, { now = false } = {}) {
    const { t } = this;
    if (!this.open || this.turn) return;
    if (!now) {
      this.panel.setActions(
        [{ id: 'open', label: fmt(t.openIt, { app: item.name }), primary: true }, { id: 'no', label: t.no }],
        (id) => (id === 'open' ? this.launch(item, answer, { now: true }) : this.panel.setActions([])),
      );
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

  // A website: always behind a button that shows where it goes.
  offerSite(address, answer) {
    const { t } = this;
    let host;
    try {
      host = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`).hostname;
    } catch {
      return;
    }
    if (!this.open || this.turn || !host.includes('.')) return;
    this.panel.setActions(
      [{ id: 'site', label: fmt(t.siteIt, { site: host }), primary: true }, { id: 'no', label: t.no }],
      async (id) => {
        this.panel.setActions([]);
        if (id !== 'site') return;
        const ok = await this.host.openSite(address);
        if (ok) this.addLine(answer, fmt(t.siteOpened, { site: host }));
      },
    );
  }

  // "close am music pls": an app that's open, named in a message asking to close something.
  askedToClose(text) {
    return CLOSE_ASK.test(text) ? this.appIn(text) : null;
  }

  // The open app your message names ("zrzut okna slacka"), the longest name that fits, or null.
  appIn(text) {
    const said = simple(text);
    let best = null;
    for (const app of this.apps) {
      for (const name of [simple(app.name), simple(app.label)]) {
        if (name.length >= 3 && said.includes(name) && (!best || name.length > best.length)) best = { app, length: name.length };
      }
    }
    return best?.app.name || null;
  }

  // Claude Code at the other end, and you asked plainly for the music, the volume, an app, a site,
  // closing an app, a jolt, or a file to see: she sees to it herself, her line as her answer. false if there was nothing she
  // could do (no such app here, no player): Claude Code gets your message then.
  async quick(asked) {
    if (!['media', 'music', 'open', 'close', 'zap', 'show', 'file', 'remind', 'shot', 'latest'].includes(asked.kind)) return false;
    const app = asked.kind === 'close' && (await this.host.findApp(asked.name));
    const done = asked.kind === 'close'
      ? app && { line: `${fmt(this.t.closeIt, { app: app.name })}?`, face: 'smug' }
      : await this.doNow(asked);
    if (!done || !this.open) return false;
    this.turn = 0;
    this.remember({ role: 'assistant', content: done.line });
    this.panel.stream(done.line, { done: true });
    this.panel.setFace(done.face);
    this.panel.setChatBusy(false);
    if (app) this.closeButtons(app);
    this.listApps(); // fresh for the next message
    return true;
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
    this.closeButtons(app);
  }

  closeButtons(app) {
    const { t } = this;
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

  // A task for another of your Claude Code sessions: a button for each session the name fits (all of
  // them if none does), and nothing is sent until you click one. Not her model's call: it never sees it.
  // answer: her model's, when its tag asked for it (her line comes under it)
  async handoff(name, task, answer = '') {
    const { t } = this;
    const found = await this.host.findAgent(name).catch(() => []);
    const sessions = found.length ? found : await this.host.agentSessions().catch(() => []);
    if (!this.open) return;
    this.turn = 0;
    const label = (s) => (s.project && s.project !== s.name ? `${s.name} (${s.project})` : s.name);
    let line = t.agentNone;
    if (found.length === 1) line = fmt(t.agentAsk, { name: label(found[0]) });
    else if (found.length) line = t.agentPick;
    else if (sessions.length) line = fmt(t.agentUnknown, { name });
    if (!answer) this.remember({ role: 'assistant', content: line });
    this.panel.stream(answer ? `${answer}\n${line}` : line, { done: true });
    this.panel.setFace(sessions.length ? 'smug' : 'aside');
    this.panel.setChatBusy(false);
    if (!sessions.length) return;
    const shown = sessions.slice(0, HANDOFF_SHOWN);
    this.panel.setActions(
      [...shown.map((s, i) => ({ id: String(i), label: fmt(t.agentSend, { name: label(s) }), primary: i === 0 })), { id: 'no', label: t.no }],
      (id) => (id === 'no' ? this.panel.setActions([]) : this.sendTask(shown[Number(id)], task)),
    );
  }

  // Her Claude Code asked to hand a task on, mid-answer (capri-mcp.js): offered once the answer is in
  queueHandoff(name, task) {
    this.handing = { name, task };
  }

  // A session's answer to a task she handed it (main.js, her inbox): in her chat if it's open, else in
  // her panel, whole. Kept with your chats either way, so she knows what came of it.
  async agentReply(name, text) {
    const line = fmt(this.t.agentReplied, { name: name || 'Claude' });
    this.history = await this.host.chatMemory().catch(() => this.history);
    this.remember({ role: 'assistant', content: `${line}\n${text}` });
    if (this.open && !this.turn) {
      this.panel.chatTurn({ quote: `@${name}`, face: 'look' });
      this.panel.stream(`${line}\n${text}`, { done: true });
      return;
    }
    this.capri.wake();
    this.panel.say({ kind: 'done', face: 'look', line, tag: name, reply: text, hold: null });
  }

  // "@" in her chat: your sessions whose name or folder starts with what follows it (or has it in it)
  async suggestSessions(prefix) {
    const p = prefix.toLowerCase();
    const sessions = await this.host.agentSessions().catch(() => []);
    const starts = (s) => s.name.toLowerCase().startsWith(p) || s.project.toLowerCase().startsWith(p);
    const has = (s) => s.name.toLowerCase().includes(p) || s.project.toLowerCase().includes(p);
    return [...sessions.filter(starts), ...sessions.filter((s) => !starts(s) && has(s))].slice(0, SUGGESTED).map((s) => ({
      value: /^[^\s:,"]+$/.test(s.name) ? s.name : `"${s.name}"`,
      label: s.name,
      hint: `${s.status === 'busy' ? '◉' : '○'} ${s.cwd.replace(/^\/home\/[^/]+|^\/Users\/[^/]+|^[A-Z]:\\Users\\[^\\]+/i, '~')}`,
    }));
  }

  async sendTask(session, task) {
    const { t } = this;
    this.panel.setActions([]);
    this.zap();
    const res = await this.host.sendAgent(session.pid, task, this.via);
    if (!this.open) return;
    const line = res.ok ? fmt(t.agentSent, { name: session.name }) : `${t.failed} ${res.error}`;
    this.remember({ role: 'assistant', content: line });
    this.panel.stream(line, { done: true });
    this.panel.setFace(res.ok ? 'laugh' : 'aside');
    // a busy session reads it between two steps; an idle one starts on it, unless it holds messages
    // for your approval (one that skips its permission prompts does): you'd have to let it in there
    if (!res.ok || session.status !== 'idle') return;
    setTimeout(async () => {
      if ((await this.host.agentStatus(session.pid)) !== 'idle') return;
      if (this.open && !this.turn && this.history.at(-1)?.content === line) this.panel.stream(`${line}\n${t.agentHeld}`, { done: true });
    }, HELD_MS);
  }

  // What she can do on the PC when you ask (Windows, Linux), and nothing else.
  powers() {
    const lines = [
      'Only when the user asks you to open an app or a game installed on their PC, play something on Spotify, control the music playing, or open a website: say in a few words that you will, and end your answer with one tag: [[open: NAME]], [[music: WHAT TO PLAY]], [[media: ACTION]] (ACTION: pause, play, next, previous, volup, voldown or mute), or [[site: ADDRESS]]. Some of these get a button to confirm, so never say it is already done. Any other time, write no tag at all: there are no other tags.',
    ];
    if (this.apps.length) {
      const open = this.apps.map(({ name, label }) => (label && label !== name ? `${name} (${label})` : name)).join(', ');
      lines.push(`You can also close an app that's open, only when they ask you to: end your answer with [[close: NAME]], NAME being the exact name from this list (the part before the parentheses). They get a button to confirm it. Apps open right now: ${open}.`);
    }
    lines.push(this.handoffPower());
    lines.push('Apart from that, you can\'t see the user\'s screen or files, and you can\'t touch anything else on their PC (settings, files): if asked, say plainly that you can\'t, in character, and don\'t pretend to.');
    return lines;
  }

  // Handing a task to one of the user's other Claude Code sessions: through her, never on its own
  handoffPower() {
    const names = this.sessions.map((s) => (s.project && s.project !== s.name ? `${s.name} (folder ${s.project})` : s.name)).join(', ');
    if (!names) return 'The user has no other Claude Code session running right now that you could hand a task to.';
    // her Claude Code: its tool from her (capri-mcp.js), SendMessage being off there (llm.js)
    const how = this.agent
      ? 'call your hand_off_task tool (session: its exact name from this list, the part before the parentheses; task: what to tell it, written for it). It is the only way to reach them from here: SendMessage is off in this chat on purpose, because their answer could never come back to it, so never say messaging is blocked or needs unblocking.'
      : 'end your answer with [[handoff: NAME: TASK]], NAME being the exact name from this list (the part before the parentheses), TASK what to tell it, written for it.';
    return `When the user asks you to have one of their other Claude Code sessions do something (run the tests, check something, fix something…), you can: ${how} Say in a few words that you're passing it on. They get a button to confirm, and its answer comes back to you later. Their sessions right now: ${names}.`;
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

  onDelta(id, piece) {
    if (id !== this.turn) return;
    this.answer += piece;
    this.panel.stream(clean(this.answer));
    this.voice.play('blip'); // her blips as the words come in
  }

  // Who she is, how she talks, and what's going on right now.
  persona() {
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
      'You are an AI-generated fan version of the character, not the real one: say so if asked.',
      // a big model asked "who are you?" otherwise answers with its own name ("I'm Gemini")
      ...(this.agent ? [] : ['Asked who or what you are, you are Capri, nothing else. Never say which AI model or company is behind you (Gemini, GPT, ChatGPT, Llama, Gemma, Mistral, Google, OpenAI, Meta…), even if the user insists or names one: you are not them.']),
      ...this.personal(),
      ...(this.agent
        ? [
          'Under the hood you are Claude Code, working in the user\'s project: really do what they ask with your tools, as carefully as ever. Only your final answer is in character: it shows in a small speech bubble, so sum up what you did in those few sentences.',
          this.handoffPower(),
          'Showing a file or a folder to the user: find its absolute path and end your final answer with [[show: ABSOLUTE PATH]], and Capri selects it in their file manager and points at it (one tag, only when they asked to see it). To open one you may run xdg-open. Never ask the user to change their permissions: what you can\'t run here, say so and move on.',
        ]
        : this.powers()),
      ...(watching ? [`If the user asks what ${assistant} is doing, here is all you know (never make anything up): ${this.brain.context()}`] : []),
      lang.last,
    ].join('\n');
  }
}

// Her chat on Telegram (telegram.js in main): the same her as in her panel, writing to your bot's chat
// instead. Each answer is one message there, changed as it goes on (her line about what she did, the
// buttons to confirm something, what came of it).
class TelegramPanel {
  constructor(host) {
    this.host = host;
    this.turn = null;       // the answer being written: { message, text, buttons, onAction }
    this.turns = new Map(); // message id -> its answer, for a button clicked on an older one
    this.queue = Promise.resolve(); // Telegram's calls one after another: a message exists before it's changed
    this.typing = null;
    this.chatInput = { value: '', focus() {} };
  }

  run(fn) {
    this.queue = this.queue.then(fn).catch((err) => console.error('[capri] telegram:', err.message));
  }

  chatTurn() {
    this.turn = { message: null, text: '', buttons: [], onAction: null };
  }

  // "typing…" on your phone while she thinks it over (Telegram shows it a few seconds at a time)
  setChatBusy(busy) {
    clearInterval(this.typing);
    this.typing = null;
    if (!busy) return;
    this.host.telegramTyping();
    this.typing = setInterval(() => this.host.telegramTyping(), 4500);
  }

  setFace() {}

  // only whole answers: no "still thinking" lines, no answer half written
  stream(text, { done = false } = {}) {
    if (!done) return;
    this.setChatBusy(false);
    if (!this.turn) this.chatTurn();
    this.turn.text = text;
    this.flush(this.turn);
  }

  setActions(actions, onAction) {
    if (!this.turn) return;
    this.turn.buttons = actions.map(({ id, label }) => ({ id, label }));
    this.turn.onAction = onAction;
    if (this.turn.text) this.flush(this.turn);
  }

  flush(turn) {
    const { text, buttons } = turn;
    this.run(async () => {
      if (turn.message) return this.host.telegramEdit(turn.message, text, buttons);
      turn.message = await this.host.telegramSend(text, buttons);
      this.turns.set(turn.message, turn);
      return undefined;
    });
  }

  // a button of hers clicked on your phone
  action(message, id) {
    const turn = this.turns.get(message);
    if (!turn?.buttons.some((b) => String(b.id) === id)) return;
    this.turn = turn; // what comes of it changes that message
    turn.onAction?.(id);
  }

  sendFile(file) {
    this.run(() => this.host.telegramPhoto(file));
  }

  hide() {}
}

export class TelegramChat extends Chat {
  constructor(opts) {
    super({ ...opts, panel: new TelegramPanel(opts.host) });
    this.open = true; // always: Telegram's chat doesn't close
    this.via = 'telegram';
    this.inbox = Promise.resolve(); // your messages one at a time, each answered before the next
    opts.host.onTelegram(({ text }) => {
      this.inbox = this.inbox.then(() => this.receive(text)).catch((err) => console.error('[capri] telegram:', err.message));
    });
    opts.host.onTelegramAction(({ message, id }) => this.panel.action(message, id));
  }

  async receive(text) {
    const status = await this.host.chatStatus();
    if (!status.ok) {
      this.panel.chatTurn();
      this.panel.stream(this.t.tgNoChat, { done: true });
      return;
    }
    this.agent = Boolean(status.agent);
    this.cold = status.warmup && !this.warm;
    this.listApps();
    await this.send(text);
  }

  // the words as they come: kept for the whole answer, no blips on the PC
  onDelta(id, piece) {
    if (id === this.turn) this.answer += piece;
  }

  close() {}

  persona() {
    return `${super.persona()}\nThe user is writing to you on Telegram, away from the PC: they don't see you or their screen right now.`;
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
