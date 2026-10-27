// What you ask her to do, read straight from what you said (typed, or heard in a spoken
// conversation), in any of her languages: no model in between, so it's instant and works with
// the smallest one. What isn't recognized here goes to the model, which can still ask for an
// action with a tag at the end of its answer ([[open: youtube.com]]...), honored only when your
// message asked for something (see `asksSomething`).
//
// parse(text) -> null, or one of:
//   { type: 'look' }                                   look at your screen and comment
//   { type: 'media', action: 'play'|'pause'|'toggle'|'next'|'previous'|'stop' }
//   { type: 'playing' }                                what's this song?
//   { type: 'music', query }                           put something on ("mets du Daft Punk")
//   { type: 'volume', set?, delta?, mute?, app? }      the volume (the PC's, or an app's)
//   { type: 'search', query, site }                    site: web, youtube, wikipedia, maps, images
//   { type: 'open', target }                           a site or an app, whichever it is
//   { type: 'launch', target }                         an app of the Start menu
//   { type: 'mail' }                                   your mail (Gmail, Outlook: her menu says which)
//   { type: 'browser' }                                just the browser ("une page web", "internet")
//
// The patterns run on a simplified copy of the text: lower case, Latin accents dropped
// (é -> e, ç -> c, ñ -> n), Cyrillic kept as is.

const plain = (text) => String(text || '')
  .toLowerCase()
  .replace(/[À-ÿ]/g, (c) => c.normalize('NFD')[0])
  .replace(/[’`]/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

// "Capri, can you please...", "dis, tu peux...", "puedes...": what comes before the request
const POLITE = new RegExp([
  '^(?:(?:hey|hi|ok|okay|eh|dis|dites|oye|ei|ola|hola|salut|ну|эй|слушай)\\s*[,!]?\\s+)?',
  '(?:capri\\s*[,!:]?\\s*)?',
  '(?:(?:est-ce que |est ce que |et ce que |et-ce que )?(?:tu (?:peux|pourrais|veux bien)|peux-tu|pourrais-tu|veux-tu|tu voudrais',
  '|can you|could you|would you|will you|please|pls|i want you to|i\'d like you to',
  '|(?:me )?puedes|podrias|por favor|quiero que',
  '|(?:voce |vc )?(?:pode|poderia)|por favor',
  '|можешь|могла бы|пожалуйста)\\s+)*',
  '(?:me |m\'|moi |me la |le |la )?',
].join(''), 'i');
const TAIL = /\s*(?:,?\s*(?:s'il te plait|s'il vous plait|stp|svp|please|pls|por favor|пожалуйста|capri|choom))*\s*[.!?…]*$/i;

function core(text) {
  return plain(text).replace(/\s*[,;:]\s*/g, ' ').replace(/-(?:moi|nous|toi|me|la|le)(?![\p{L}])/gu, '').replace(TAIL, '').replace(POLITE, '').replace(TAIL, '').trim();
}

const words = (s) => (s ? s.split(' ').length : 0);

// ---------- look at the screen ----------

const LOOK = new RegExp([
  '(?:regarde|regarder|jet(?:te|er) un (?:oeil|coup d\'oeil)|commente|commenter|analyse|analyser|lis|lire|dis-moi ce que tu vois).{0,20}(?:ecran|ce que je fais|ce qu\'il y a)',
  '|qu\'(?:est-ce que|est ce que) tu vois|tu vois quoi|que vois-tu|tu vois (?:mon|l\')ecran',
  '|(?:look|take a look|have a look|glance|check out|comment)(?: at)?.{0,12}(?:my |the |this )?screen',
  '|what (?:do|can) you see|what\'s on (?:my|the) screen|what am i (?:doing|looking at)',
  '|(?:mira|mirar|echa un vistazo a|comenta).{0,12}pantalla|que ves|que estoy haciendo',
  '|(?:olha|olhar|veja|ver|da uma olhada n?a|comenta).{0,12}tela|o que (?:voce|vc) (?:ve|esta vendo)',
  '|(?:посмотри|глянь|взгляни|прокомментируй).{0,12}(?:экран|что у меня)|что ты видишь|что на (?:моем|моём)? ?экране',
].join(''), 'i');

// ---------- music ----------

const NEXT = /^(?:(?:passe|mets|joue|go to|play|skip(?: to)?|pon|toca|pasa|coloca|vai para|включи|переключи)(?: (?:a|la|le|the|na|en|на))* )?(?:(?:musique|chanson|piste|morceau|titre|son|song|track|tune|cancion|tema|pista|musica|faixa|трек|песн[яю]) )?(?:suivante?|next|siguiente|proxima|seguinte|следующ(?:ий|ая|ую))(?: (?:musique|chanson|piste|morceau|titre|song|track|one|cancion|tema|musica|faixa|трек|песн[яю]))?$|^(?:skip|zappe|saute|salta|pula|пропусти)(?: (?:it|ca|la|cette chanson|this song|esta|essa|эту|это))?$/i;
const PREVIOUS = /^(?:(?:remets|reviens a|go back to|play|pon|vuelve a|volta|coloca|включи|верни)(?: (?:a|la|le|the|na|en|на))* )?(?:(?:musique|chanson|piste|morceau|titre|song|track|cancion|tema|pista|musica|faixa|трек|песн[яю]) )?(?:precedente?|previous|last|anterior|предыдущ(?:ий|ая|ую))(?: (?:musique|chanson|piste|morceau|titre|song|track|one|cancion|tema|musica|faixa|трек|песн[яю]))?$/i;
const PAUSE = /^(?:(?:mets?|met|put|pon|coloca|поставь) (?:la |the |a |el )?(?:musique|music|musica|музыку) (?:en |on |em |на )?(?:pause|pausa|паузу)|(?:mets?|met|fais|put|hit|haz|pon|coloca|da|поставь|сделай|stop|arrete|stoppe|coupe|pause|detiens|para|parar|pausa|pare|останови|выключи)(?: (?:en|on|la|le|em|на))? ?(?:pause|pausa|паузу)?(?: (?:la |the |a |le |el )?(?:musique|music|son|song|musica|cancion|музыку|песню))?|pause|pausa|пауза|stop|silence)$/i;
const RESUME = /^(?:(?:reprends|relance|remets|continue|resume|unpause|keep playing|play|continua|reanuda|sigue|retoma|volta|продолжи|включи|возобнови|play)(?: (?:la |the |a |el |le )?(?:musique|music|son|song|musica|cancion|музыку|песню|lecture|playback|reproduccion))?|(?:mets?|met|put|pon|coloca|включи|joue)(?: (?:la |the |a |de la |some |del |um pouco de )?(?:musique|music|musica|музыку))|play)$/i;
const PLAYING = /(?:c'est quoi (?:cette|ce|la) (?:musique|chanson|son|morceau|titre)|qu'est-ce qui (?:passe|joue|tourne)|quelle (?:est cette )?(?:musique|chanson)|qui chante|what(?:'s| is) (?:this|that|the) (?:song|track|music|tune)|what(?:'s| is) playing|who(?:'s| is) (?:singing|this)|que (?:cancion|musica) es (?:esta|esa)|que (?:esta sonando|suena)|quien canta|que musica e essa|o que (?:esta )?tocando|quem canta|что (?:это за|за) (?:песня|музыка|трек)|что (?:сейчас )?играет|кто поет)/i;
// "mets du Daft Punk", "play some lofi", "pon música de Bad Bunny", "включи Кино"
const MUSIC = /^(?:mets?|met|joue|ecoute|play|put on|listen to|pon|ponme|toca|reproduce|coloca|toque|bota|включи|поставь|сыграй)(?: (?:moi|me|us))? (?:(?:de la |du |des |de l'|un peu de |la |le |les |some |a little |um pouco de |algo de |un poco de |)(?:musique|musica|music|музыку|песни|chansons|songs|canciones|cancoes)(?: (?:de|d'|of|by|da|do|del))? ?)?(.+)$/i;

// ---------- volume ----------

const VOL_WORD = '(?:volume|son|sound|audio|volumen|sonido|som|громкость|звук|musique|music|musica|музыку)';
const SET = new RegExp(`(?:${VOL_WORD}|mets|met|set|pon|coloca|сделай|поставь)\\D{0,25}?(\\d{1,3})\\s*(?:%|pour ?cent|percent|por ?ciento|por ?cento|процент\\S*)?$`, 'i');
const UP = /(?:mont(?:er|e)|augment(?:er|e)|hausse|plus fort|plus haut|turn (?:it |that |this )?up|turn up|louder|volume up|raise|crank|pump|sub(?:e|ir)|mas alto|mas fuerte|aument(?:a|ar)|mais alto|mais forte|громче|прибавь|увеличь|погромче)/i;
const DOWN = /(?:baiss(?:er|e)|diminu(?:er|e)|moins fort|plus bas|moins haut|turn (?:it |that |this )?down|turn down|quieter|softer|lower|volume down|baj(?:a|ar)|mas bajo|mas suave|abaix(?:a|ar)|diminu(?:i|ir)|mais baixo|тише|убавь|уменьши|потише)/i;
const MUTE = /^(?:coupe(?:r)? (?:le )?(?:son|volume)|mute|mute (?:it|the sound|the music)|silence|chut|shh+|silencia(?:r)?|quita el sonido|tira o som|muta(?:r)?|mudo|выключи звук|без звука|заглуши)$/i;
const UNMUTE = /^(?:remets? (?:le )?(?:son|volume)|reactive (?:le )?(?:son|volume)|unmute|turn (?:the )?sound (?:back )?on|sound on|devuelve el sonido|activa el sonido|quita el silencio|ativa o som|liga o som|volta o som|включи звук|верни звук)$/i;
const AMOUNT = /(?:de |by |en |em |на )(\d{1,2})\s*(?:%|points?|pour ?cent)?/i;
const VOLUME_ANY = new RegExp(`${UP.source}|${DOWN.source}|${VOL_WORD}`, 'i');
const VOL_WORD_RE = new RegExp(VOL_WORD, 'i');
const MAX = /(?:a fond|au max(?:imum)?s?|(?:to the |all the way )?max(?:imum)?s?|full blast|all the way up|al maximo|a tope|no maximo|ao maximo|на максимум|на полную|до максимума)/i;
const MIN = /(?:au min(?:imum)?|to the min(?:imum)?|all the way down|al minimo|no minimo|ao minimo|на минимум|до минимума)/i;
const VOL_START = new RegExp(`^(?:le |la |el |o |the )?${VOL_WORD}`, 'i');
// what's left once the volume words are gone: maybe an app ("baisse spotify")
// (\b only knows Latin letters: these lookarounds know every alphabet)
const word = (alternatives) => new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${alternatives})(?![\p{L}\p{N}])`, 'giu');
const FILLER = word('le|la|les|du|de|des|un|une|peu|encore|plus|moins|fort|bas|haut|son|sons|volume|sound|sounds|audio|the|it|that|this|bit|little|of|up|down|some|el|los|las|lo|poco|del|o|a|os|um|pouco|do|da|volumen|sonido|som|musique|music|musica|cancion|chanson|громкость|звук|музыку|чуть|немного');

// ---------- the web, apps ----------

const SEARCH = /^(?:cherche(?:r|z)?|recherche(?:r|z)?|google|googlise|trouve(?:r|z)?|search(?: for)?|look up|find|google|busca(?:r)?|buscame|encuentra|pesquisa(?:r)?|procura(?:r)?|найди|поищи|загугли|ищи)(?: (?:moi|me|for me|pra mim|мне))? (.+)$/i;
const SEARCH_SITE = [
  ['youtube', /\s+(?:sur|on|en|no|na|в|на) (?:youtube|yt|ютубе?)$/i],
  ['wikipedia', /\s+(?:sur|on|en|na|в|на) (?:wikipedia|wiki|wikipedie|википедии)$/i],
  ['maps', /\s+(?:sur|on|en|no|na|в|на) (?:google )?(?:maps|la carte|the map|el mapa|o mapa|картах?)$/i],
  ['images', /\s+(?:en |in |as |в )?(?:images|pictures|photos|imagenes|imagens|картинк\S*)$/i],
  ['web', /\s+(?:sur|on|en|no|na|в|на) (?:google|internet|le web|the web|the internet|la web|интернете)$/i],
];
const OPEN = /^(?:ouvr(?:e|ir|es|ez)|va sur|allez sur|aller sur|emmene-moi sur|affiche(?:r)?|open|go to|take me to|show me|pull up|bring up|abre|abrir|ve a|llevame a|abra|vai para|me leva para|открой|зайди на|перейди на|покажи)\s+(?:(?:le site|the site|the website|el sitio|o site|сайт|l'appli(?:cation)?|the app|la app|o app|приложение)\s+(?:de\s+|of\s+)?)?(.+)$/i;
const LAUNCH = /^(?:lance(?:r|z)?|demarre(?:r|z)?|execute(?:r|z)?|launch|start|run|fire up|boot up|inicia(?:r)?|ejecuta(?:r)?|arranca(?:r)?|inicie|iniciar|executa(?:r)?|liga(?:r)?|запусти|включи приложение)\s+(?:(?:l'appli(?:cation)?|le logiciel|le programme|the app|the program|la app|el programa|o app|o programa|приложение|программу)\s+)?(.+)$/i;

// What you open can be no app or site in particular: your mail (the service picked in her menu),
// or just the browser ("une page web", "internet").
const MINE = '(?:(?:mes|ma|mon|my|mis|mi|meus|minha|meu|мою|мои|мой)\\s+)?';
const MAIL = new RegExp(`^(?:moi\\s+)?(?:la |le |les |the |el |o |a |une? )?${MINE}(?:boite (?:mail|e-?mail|aux lettres|de reception)|mails?|e-?mails?|courriels?|messagerie|inbox|mailbox|correos?(?: electronicos?)?|bandeja de entrada|caixa de (?:entrada|e-?mail)|почт[уаы](?: ящик)?|имейл\\S*|письма)$`, 'iu');
const BROWSER = new RegExp(`^(?:moi\\s+)?(?:la |le |les |the |el |o |a |une? |an? |un |um |uma )?${MINE}(?:(?:nouvel(?:le)? |new |nueva |nova |novo )?(?:page(?: web| internet)?|web ?page|onglet|tab|pestana|aba|navigateur|browser|navegador|internet|le web|the web|la web|интернет|браузер|вкладку|страницу)(?: web| internet)?)$`, 'iu');

// "du daft punk" -> "daft punk", "the notepad" -> "notepad"
const tidy = (s) => String(s || '')
  .replace(/^(?:(?:un peu |a bit of |a little |un poco |um pouco |algo )?(?:de la|de l'|du|des|de|of|some|del|do|da)\s+|(?:le|la|les|l'|the|el|o|a|un|une)\s+)/i, '').replace(/["«»“”]/g, '').trim();

export function parse(text) {
  const s = core(text);
  if (!s || words(s) > 14) return null; // a long message is a conversation, not an order

  if (LOOK.test(s)) return { type: 'look' };

  // the volume first: "mets le son à 30" isn't putting some music on
  if (MUTE.test(s)) return { type: 'volume', mute: true };
  if (UNMUTE.test(s)) return { type: 'volume', mute: false };
  const set = SET.exec(s);
  if (set && VOLUME_ANY.test(s) && !/\b(?:min|minute|sec|h|heure|hour)/.test(s)) {
    return { type: 'volume', set: Math.min(100, Number(set[1])), app: appIn(s) };
  }
  // "plus fort", "baisse spotify", "monte le son": the verb first, or the volume named
  // ("je suis monté sur le toit" isn't one)
  // "à fond", "au maximum", "to the max", "al máximo": all the way up (or down: "au minimum")
  if (VOLUME_ANY.test(s) && MAX.test(s)) return { type: 'volume', set: 100, app: appIn(s.replace(MAX, ' ')) };
  if (VOLUME_ANY.test(s) && MIN.test(s)) return { type: 'volume', set: 0, app: appIn(s.replace(MIN, ' ')) };
  const turn = UP.exec(s) || DOWN.exec(s);
  const up = Boolean(turn) && UP.test(turn[0]);
  if (turn && (turn.index === 0 || VOL_WORD_RE.test(s)) && words(s) <= 8) {
    const amount = Number(AMOUNT.exec(s)?.[1]) || (/(?:un peu|a bit|a little|un poco|um pouco|чуть|немного)/i.test(s) ? 5 : /(?:beaucoup|a lot|way|mucho|muito|сильно|намного)/i.test(s) ? 25 : 10);
    return { type: 'volume', delta: up ? amount : -amount, app: appIn(s) };
  }

  if (PLAYING.test(s)) return { type: 'playing' };
  if (NEXT.test(s)) return { type: 'media', action: 'next' };
  if (PREVIOUS.test(s)) return { type: 'media', action: 'previous' };
  if (PAUSE.test(s)) return { type: 'media', action: 'pause' };
  if (RESUME.test(s)) return { type: 'media', action: 'play' };
  const music = MUSIC.exec(s);
  if (music && !/(?:pause|pausa|паузу)/.test(music[1]) && !VOL_START.test(music[1])) return { type: 'music', query: tidy(music[1]) };

  const search = SEARCH.exec(s);
  if (search) {
    let query = search[1];
    let site = 'web';
    for (const [name, re] of SEARCH_SITE) {
      if (re.test(query)) {
        site = name;
        query = query.replace(re, '');
        break;
      }
    }
    return { type: 'search', query: tidy(query), site };
  }
  const launch = LAUNCH.exec(s);
  const open = !launch && OPEN.exec(s);
  const target = launch?.[1] || open?.[1];
  if (target && MAIL.test(target)) return { type: 'mail' };
  if (target && BROWSER.test(target)) return { type: 'browser' };
  if (launch) return { type: 'launch', target: tidy(launch[1]) };
  if (open && !/(?:ecran|screen|pantalla|tela|экран)/.test(open[1])) return { type: 'open', target: tidy(open[1]) };
  return null;
}

// "mets le volume à 30 et ouvre YouTube": several at once, when every part is one. Else the
// whole message as one (or none: []).
const AND = /\s*[,;]?\s+(?:et puis|and then|y luego|e depois|а потом|et|puis|and|then|y|luego|e|depois|и|потом)\s+/i;
export function parseAll(text) {
  const parts = String(text || '').split(AND).filter((p) => p.trim());
  if (parts.length > 1 && parts.length <= 4) {
    const all = parts.map(parse);
    if (all.every(Boolean) && !all.some((c) => c.type === 'look')) return all;
  }
  const one = parse(text);
  return one ? [one] : [];
}

// "baisse spotify", "volume de discord à 20": an app named among the volume words, if any.
function appIn(s) {
  const left = s.replace(UP, ' ').replace(DOWN, ' ').replace(AMOUNT, ' ')
    .replace(/\d{1,3}\s*(?:%|pour ?cent|percent|por ?ciento|por ?cento|процент\S*)?/gi, ' ')
    .replace(/(?<![\p{L}])[ld]'/giu, ' ')
    .replace(word('mets|met|set|pon|coloca|сделай|поставь|turn|a|to|at|al|em|на|en'), ' ')
    .replace(FILLER, ' ')
    .replace(/[^\p{L}\p{N} .-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return left.length >= 3 && words(left) <= 3 ? left : '';
}

// Your message asked her to do something (a verb of action, in any of her languages): only then
// does a tag the model wrote count. A model can write a tag when you were just chatting.
const ASKS = /(?<![\p{L}])(?:ouvr|lance|demarr|mets|met |joue|cherch|recherch|baiss|mont|coupe|regard|passe|arret|open|launch|start|run|play|put|search|look|find|turn|skip|pause|stop|mute|abre|abra|inici|ejecut|pon|toca|busca|pesquis|procur|baj|sub|aument|abaix|mira|olh|откр|запуст|включ|найд|поищ|посмотр|выключ|останов|громч|тише)/iu;
export function asksSomething(text) {
  return ASKS.test(plain(text));
}

// "yes" / "no", when she's waiting for one out loud (closing an app, looking at your screen)
const YES = /^(?:oui|ouais|ouai|yep|yes|yeah|yup|sure|ok|okay|d'accord|vas-y|go|fais-le|do it|confirme|confirm|si|claro|dale|vale|hazlo|sim|pode|claro|manda|faz|да|давай|конечно|ага)(?![\p{L}])/iu;
const NO = /^(?:non|nan|no|nope|nah|pas question|laisse|leave it|cancel|annule|nada|cancela|nao|deixa|нет|не надо|отмена)(?![\p{L}])/iu;
export function answer(text) {
  const s = core(text);
  if (NO.test(s)) return 'no';
  if (YES.test(s)) return 'yes';
  return null;
}

// "stop", "au revoir", "bye": the end of a spoken conversation (a short message, nothing else in it)
const BYE = /^(?:(?:merci )?c'est tout(?: merci)?|stop|stoppe|arrete(?:-toi)?|tais-toi|au revoir|bye|bye bye|goodbye|good night|bonne nuit|a plus|ciao|see you|that's all|c'est tout|merci c'est tout|thanks that's all|adios|hasta luego|chao|tchau|ate mais|ate logo|пока|до свидания|хватит|всё|все|стоп)$/i;
export function isGoodbye(text) {
  return BYE.test(core(text));
}

// The tags a model can end its answer with, and what they ask for. [[close: X]] stays with the
// chat (it already had its own button), the others are read here.
const TAG = /\[\[\s*(open|launch|search|media|volume|look|music|mail|browser)\s*:?\s*([^\]]*)\]\]/i;
export function tagged(raw) {
  const tag = TAG.exec(String(raw || ''));
  if (!tag) return null;
  const kind = tag[1].toLowerCase();
  const arg = tag[2].trim();
  switch (kind) {
    case 'look':
      return { type: 'look' };
    case 'mail':
      return { type: 'mail' };
    case 'browser':
      return { type: 'browser' };
    case 'open':
      return arg ? { type: 'open', target: tidy(arg) } : null;
    case 'launch':
      return arg ? { type: 'launch', target: tidy(arg) } : null;
    case 'search': {
      const [site, ...rest] = arg.split('|').map((p) => p.trim());
      return rest.length ? { type: 'search', site: site || 'web', query: rest.join(' ') } : arg ? { type: 'search', site: 'web', query: arg } : null;
    }
    case 'music':
      return arg ? { type: 'music', query: tidy(arg) } : { type: 'media', action: 'play' };
    case 'media': {
      const action = /next|suiv/.test(arg) ? 'next' : /prev|prec/.test(arg) ? 'previous' : /pause/.test(arg) ? 'pause' : /stop/.test(arg) ? 'stop' : /play|resume/.test(arg) ? 'play' : 'toggle';
      return { type: 'media', action };
    }
    case 'volume': {
      if (/^mute/i.test(arg)) return { type: 'volume', mute: true };
      if (/^unmute/i.test(arg)) return { type: 'volume', mute: false };
      if (/^up/i.test(arg)) return { type: 'volume', delta: 10 };
      if (/^down/i.test(arg)) return { type: 'volume', delta: -10 };
      const n = Number(/\d{1,3}/.exec(arg)?.[0]);
      return Number.isFinite(n) ? { type: 'volume', set: Math.min(100, n) } : null;
    }
    default:
      return null;
  }
}
