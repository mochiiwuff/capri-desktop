// Taking care of your PC from her chat (system.js through host.pcDo): what weighs on it, room to
// make, what starts with Windows, its apps' updates, files kept twice, where the sound comes out,
// your microphone, Wi-Fi and Bluetooth, a USB stick, the screen's brightness, the Xbox Game Bar,
// lost windows and your other screen, your setups, game mode, and the internet when it's down.
// Read off your message in her five languages, done without her AI (it's quicker, and it works with
// the internet down), and what she finds comes with buttons: closing, deleting, opening or
// changing anything waits for your click.

import { fmt } from './util.js';

const MB = 1024 ** 2;
const WAIT_LINE_MS = 1500;

// --- What you ask, in her five languages -------------------------------------------------------

const PC = /(?<![\p{L}])(?:pc|ordi\p{L}*|computer|ordenador|computador|компьютер\p{L}*|пк)(?![\p{L}])/iu;
const LOAD = /processeur|\bcpu\b|\bram\b|m[ée]moire|memory|memoria|mem[óo]ria|процессор|памят/i;
const SLOW = /(?<![\p{L}])(?:rame|ramer|lag\p{L}*|lent|lente|ralenti\p{L}*|slow\p{L}*|lento|lenta|trava\p{L}*|тормоз\p{L}*|медленн\p{L}*|лага\p{L}*)(?![\p{L}])|what(?:'s| is) (?:using|eating|hogging|slowing)|qu['’]est[- ]ce qui (?:consomme|bouffe|prend|mange|utilise|ralentit)|qu[eé] (?:consume|est[aá] usando|ralentiza)|o que (?:est[aá] )?(?:consumindo|usando|deixando)|что (?:ест|жр[её]т|грузит|тормозит)/iu;

const SPACE = /fais(?:[- ]moi)? de la place|lib[eè]re(?:r)? (?:de )?(?:l['’]espace|la place|de la place|du stockage|de l['’]espace)|nettoie (?:mon |le |l['’])?(?:pc|ordi\p{L}*|disque)|vide (?:la |ma )?corbeille|(?:vide|supprime) (?:mes |les )?fichiers temporaires|free (?:up )?(?:some )?(?:disk )?space|clean (?:up )?(?:my |the )?(?:pc|computer|disk|drive)|empty (?:my |the )?(?:recycle )?bin|libera (?:espacio|espa[çc]o)|limpia (?:mi |el )?(?:pc|ordenador|disco)|vac[ií]a (?:la )?papelera|limpa (?:meu |o )?(?:pc|computador|disco)|esvazi[ae] a lixeira|освободи место|почисти (?:компьютер|пк|диск)|очисти (?:корзину|диск|компьютер|пк)/iu;

const STARTUP = /d[ée]marrage|lancement de windows|startup|start(?:s|ing)? with windows|boot|inicio de windows|al (?:arrancar|iniciar)(?: windows)?|arranque|inicializa[çc][ãa]o|autostart|автозагруз\p{L}*|при запуске/iu;
const DISABLE = /(?<![\p{L}])(?:d[ée]sactive|enl[eè]ve|retire|supprime|vire|disable|remove|stop|turn off|desactiva|quita|elimina|desativa|tira|убери|отключи)(?![\p{L}])/iu;
const ENABLE = /(?<![\p{L}])(?:r[ée]active|remets|rajoute|enable|re-?enable|turn on|activa|reactiva|ativa|reativa|включи|верни)(?![\p{L}])/iu;

const UPDATES = /(?:mets?|mettre) (?:[àa] jour|a jour) (?:mes |les |toutes (?:mes|les) )?(?:applis?|applications|logiciels|programmes|apps)|mises? [àa] jour (?:de |des )?(?:mes )?(?:applis?|applications|logiciels|programmes)|update (?:all )?(?:my |the |all )?(?:apps|applications|programs|software)|actualiza (?:mis |las |todas )?(?:aplicaciones|apps|programas)|atualiz[ae] (?:meus |os |todos )?(?:aplicativos|apps|programas)|обнови (?:все )?(?:приложения|программы)/iu;

const DUPLICATES = /doublons?|en double|duplicate|duplicad|repetid|дубл/i;
const PLACES = [
  ['videos', /vid[ée]os?|v[ií]deos?|видео/i],
  ['downloads', /t[ée]l[ée]chargements?|downloads?|descargas?|загрузк/i],
  ['documents', /documents?|documentos?|документ/i],
  ['desktop', /\bbureau\b|desktop|escritorio|[áa]rea de trabalho|рабоч\p{L}* стол/iu],
  ['pictures', /photos?|images?|pictures?|fotos?|im[áa]gen(?:es)?|imagens|фото|картинк/i],
];

const SOUND = /(?<![\p{L}])(?:sound|audio|sonido|[áa]udio|звук)(?![\p{L}])|(?<![\p{L}])(?:le|du|au|el|o) (?:son|som)(?![\p{L}])/iu;
const OUTPUT_TO = /(?:son|sound|audio|sonido|som|[áa]udio|звук)\s+(?:sur|dans|on|to|into|through|en|por|no|na|nos|nas|em|в|на)\s+(?:(?:mon|ma|mes|le|la|les|l['’]|my|the|mi|mis|el|los|las|meu|minha|meus|o|a|os|as|мои|мой)\s+)?(.{2,40}?)\s*[.!?]*$/iu;
const OUTPUT_LIST = /sortie (?:audio|son)|audio output|output device|salida de audio|sa[íi]da de [áa]udio|аудиовыход|вывод звука/i;
// what you call the device: matched against Windows' names for them
const KINDS = [
  ['headset', /casque|[ée]couteurs?|headphones?|headset|earbuds?|earphones?|airpods|buds|auriculares|cascos|fones?|наушник\p{L}*|гарнитур\p{L}*/iu],
  ['speakers', /enceintes?|haut-?parleurs?|speakers?|altavo(?:z|ces)|alto-?falantes?|caixas? de som|колонк\p{L}*|динамик\p{L}*/iu],
  ['screen', /[ée]cran|t[ée]l[ée]|\btv\b|monitor|moniteur|pantalla|televisi[oó]n|tela|televis[ãa]o|монитор|телевизор/iu],
];
const DEVICE_KIND = {
  headset: /headphone|headset|casque|[ée]couteur|earphone|earbud|airpods|buds|auricular|fone|наушник|гарнитур/i,
  speakers: /speaker|haut-?parleur|enceinte|altavo|alto-?falante|динамик|колонк/i,
  screen: /display audio|high definition audio|hdmi|displayport/i,
};
// Windows' virtual outputs (Steam's, VB-Audio's...): only picked when you name them
const VIRTUAL = /steam streaming|vb-audio|\bcable\b|virtual|voicemeeter|nvidia broadcast|sonar/i;

const MIC = /(?<![\p{L}])(?:micro|mic|microphone|micr[oó]fono|microfone|микрофон\p{L}*)(?![\p{L}])/iu;
const OFF = /(?<![\p{L}])(?:coupe|d[ée]sactive|[ée]teins|turn off|switch off|disable|silencia|desactiva|apaga|desativa|desliga|выключи|отключи|заглуши)(?![\p{L}])|(?<!un)mute|(?<!des)muta/iu;
const ON = /(?<![\p{L}])(?:remets|rallume|r[ée]active|active|allume|turn on|switch on|enable|activa|reactiva|enciende|ativa|reativa|liga|включи)(?![\p{L}])|unmute|desmuta/iu;

const RADIOS = [['wifi', /wi-?fi|wlan|вай-?фай/i], ['bluetooth', /bluetooth|блютуз/i]];
const SETTINGS_WORD = /param[eè]tres?|r[ée]glages?|settings|configuraci[oó]n|configura[çc][õo]es|ajustes|настройк/i;

const EJECT = /[ée]jecte|eject|expulsa|ejet[ae]|извлеки/i;
const LETTER = /(?<![\p{L}])([d-z])\s*:/iu;

const BRIGHT = /luminosit[ée]|brightness|brillo|brilho|яркост\p{L}*/iu;
const DOWN = /baisse|diminue|r[ée]duis|moins|\bdown\b|lower|\bdim\b|decrease|baja|reduce|menos|diminui|abaixa|уменьши|понизь|убавь/i;
const UP = /monte|augmente|\bplus\b|\bup\b|raise|increase|sube|aumenta|m[áa]s\b|mais\b|увеличь|повысь|прибавь/i;

const CLIP = /^(?:capri,?\s+)?clip(?:pe|per)?(?:[- ](?:ça|ca|that|it|this|eso|isso|это))?\s*[.!?]*$|clip(?:pe|per)? (?:les|the|los|os) (?:\d+ )?(?:derni[eè]res?|last|[uú]ltim[oa]s)|fais (?:un )?clip|make a clip|haz un clip|faz um clip|сделай клип|enregistre ce qui (?:vient de se passer|s['’]est pass[ée])|record (?:that|what (?:just )?happened)|graba (?:lo que (?:acaba de pasar|pas[oó])|eso)|grava (?:o que aconteceu|isso)|запиши (?:что было|последние)/iu;
const RECORD = /enregistre (?:mon |l['’])?[ée]cran|lance l['’]enregistrement|record (?:my |the )?screen|screen ?record|start recording|graba (?:mi |la )?pantalla|grava (?:minha |a )?tela|запиши экран|начни запись|(?:arr[êe]te|stop|det[eé]n|para|pare) (?:l['’]|la |a |the )?(?:enregistrement|recording|grabaci[oó]n|grava[çc][ãa]o)|останови запись/iu;

const LOST = /perdu (?:ma|une|la|mes) fen[êe]tres?|fen[êe]tres? (?:perdues?|disparues?|hors (?:de l['’])?[ée]cran|introuvables?)|ram[eè]ne (?:mes |les |ma |la )?fen[êe]tres?|lost (?:a |my |the )?windows?|windows? (?:is |are )?off ?screen|bring (?:my |the )?windows? back|perd[ií] (?:una |la |mi |mis )?ventanas?|ventanas? (?:perdidas?|fuera de la pantalla)|perdi (?:uma |a |minha |minhas )?janelas?|janelas? (?:perdidas?|fora da tela)|потерял\p{L}* окн\p{L}*|окн\p{L}* за экраном|верни окн\p{L}*/iu;
const OTHER_SCREEN = /\s*(?:sur|vers|to|on|onto|en|a|para|no|na|на)\s+(?:l['’]autre|the other|my other|el otro|la otra|o outro|a outra|другой|второй)\s+(?:[ée]cran|screen|monitor|pantalla|tela|экран|монитор)|\s*(?:sur|on|to|en|na|no|на)\s+(?:l['’]|the |la |a |o )?(?:[ée]cran|screen|monitor|pantalla|tela|экран|монитор)\s*(\d)/iu;
const MOVE = /^\s*(?:mets?|bouge|d[ée]place|envoie|passe|put|move|send|pon|mueve|manda|coloca|move|bota|manda|поставь|перемести|отправь)\s+/iu;

const SETUP = /set-?up|espace de travail|workspace|espacio de trabajo|espa[çc]o de trabalho|сетап|рабочее пространство/iu;
const SETUP_SAVE = /(?<![\p{L}])(?:retiens|m[ée]morise|sauvegarde|enregistre|garde|save|remember|memorize|keep|guarda|recuerda|memoriza|salva|grava|lembra|запомни|сохрани)(?![\p{L}])/iu;
const SETUP_OPEN = /(?<![\p{L}])(?:lance|ouvre|d[ée]marre|charge|remets|restaure|launch|open|start|load|restore|lanza|abre|inicia|carga|restaura|carrega|запусти|открой|загрузи|верни)(?![\p{L}])/iu;
const SETUP_LIST = /(?:mes|quels|my|which|what|mis|cu[aá]les|meus|quais|мои|какие)\s+(?:sont mes\s+)?(?:set-?ups|сетапы)/iu;

const GAME = /mode (?:jeu|gaming|gamer)|(?:game|gaming) mode|modo (?:juego|gamer|gaming|jogo)|игров\p{L}* режим|режим игры/iu;
const GAME_OFF = /(?:fin|arr[êe]te|quitte|d[ée]sactive|sors|coupe) (?:du |le |de )?mode (?:jeu|gaming|gamer)|(?:end|stop|exit|quit|turn off|disable) (?:the )?(?:game|gaming) mode|(?:game|gaming) mode off|(?:fin|termina|sal|desactiva|apaga) (?:del |el )?modo (?:juego|gamer|gaming)|(?:fim|sai|desativa|desliga) (?:do |o )?modo (?:jogo|gamer|gaming)|(?:выключи|выйди из|заверши|отключи) игров/iu;
const GAME_CLOSE = /(?:mode (?:jeu|gaming)|(?:game|gaming) mode|modo (?:juego|jogo|gaming)|игров\p{L}* режим\p{L}*),?\s+(?:ferme|close|cierra|fecha|закрой|закрывай)\s+(.{2,80}?)\s*[.!?]*$/iu;

const NET = /internet (?:ne )?(?:marche|fonctionne|va|passe) (?:plus|pas)|(?:plus|pas) (?:de |d['’])?(?:internet|connexion|r[ée]seau)|pourquoi (?:j['’]ai )?(?:pas|plus) internet|connexion (?:ne )?(?:marche|fonctionne) (?:plus|pas)|internet (?:is )?(?:not working|down|broken|isn['’]t working)|(?:no|lost) (?:internet|connection)|why (?:is|isn['’]t) (?:my )?internet|(?:can['’]t|cannot) connect to (?:the )?internet|internet no (?:funciona|va|anda)|sin (?:internet|conexi[oó]n)|internet n[ãa]o (?:funciona|est[áa] funcionando|pega)|sem (?:internet|conex[ãa]o)|интернет не работает|нет интернета|пропал интернет/iu;

// the words around a name: "désactive Discord au démarrage" -> "Discord"
const FILLER = /(?<![\p{L}])(?:le|la|les|l['’]|du|de|des|au|à|a|en|mon|ma|mes|the|my|from|at|on|in|of|el|los|las|del|al|mi|mis|o|os|as|do|da|no|na|meu|minha|в|из|при|и|stp|svp|please|pls|por favor|пожалуйста|programme|app|appli|application|program|programa|aplicativo|программ\p{L}*|приложени\p{L}*)(?![\p{L}])/giu;
const named = (text, ...drop) => drop.reduce((s, re) => s.replace(new RegExp(re.source, `${re.flags.replace('g', '')}g`), ' '), text)
  .replace(FILLER, ' ').replace(/[\s.,!?'’"«»]+/g, ' ').trim();

// --- Doing it ------------------------------------------------------------------------------------

export class Care {
  constructor({ chat, host, panel, brain, capri }) {
    Object.assign(this, { chat, host, panel, brain, capri });
    this.recording = false; // the Game Bar's recording, as far as she knows
    host.onPcProgress((p) => this.progress(p));
  }

  get t() {
    return this.brain.t.chat.care;
  }

  // Your message, read: { kind: 'care', what, ... }, or null for anything else.
  asked(text, count) {
    const care = (what, more = {}) => ({ kind: 'care', what, ...more });
    if (count > 25) return null; // a long message is a conversation, not an order
    if (NET.test(text)) return care('internet');
    if (GAME_CLOSE.test(text)) {
      const list = GAME_CLOSE.exec(text)[1].split(/\s*(?:,|\bet\b|\band\b|\by\b|\be\b|\bи\b)\s*/i).map((s) => named(s)).filter(Boolean);
      if (list.length) return care('gameMode', { close: list });
    }
    if (GAME_OFF.test(text)) return care('gameMode', { on: false });
    if (GAME.test(text)) return care('gameMode', { on: true });
    if (SLOW.test(text) && (PC.test(text) || LOAD.test(text))) return care('heavy');
    if (SPACE.test(text)) return care('space');
    if (UPDATES.test(text)) return care('updates');
    if (DUPLICATES.test(text)) return care('duplicates', { where: PLACES.find(([, re]) => re.test(text))?.[0] || 'pictures' });
    if (STARTUP.test(text)) {
      const off = DISABLE.test(text);
      const on = !off && ENABLE.test(text);
      const name = (off || on) && named(text, STARTUP, off ? DISABLE : ENABLE, /windows/i);
      return care('startup', name ? { name, on } : {});
    }
    if (MIC.test(text) && (OFF.test(text) || ON.test(text))) return care('mic', { mute: OFF.test(text) });
    const radio = RADIOS.find(([, re]) => re.test(text))?.[0];
    if (radio && !SETTINGS_WORD.test(text) && (OFF.test(text) || ON.test(text))) return care('radio', { radio, on: !OFF.test(text) });
    if (EJECT.test(text)) return care('eject', { letter: LETTER.exec(text)?.[1]?.toUpperCase() || null });
    if (BRIGHT.test(text)) {
      const level = /(\d{1,3})\s*%?/.exec(text)?.[1];
      if (level && Number(level) <= 100) return care('brightness', { level: Number(level) });
      return care('brightness', { by: DOWN.test(text) ? -20 : UP.test(text) ? 20 : null });
    }
    if (RECORD.test(text)) return care('gameBar', { bar: 'record' });
    if (CLIP.test(text)) return care('gameBar', { bar: 'clip' });
    if (LOST.test(text)) return care('rescue');
    if (MOVE.test(text) && OTHER_SCREEN.test(text)) {
      const index = Number(OTHER_SCREEN.exec(text)[1]) || null;
      const name = named(text, MOVE, OTHER_SCREEN, /fen[êe]tre|window|ventana|janela|окно/i);
      if (name.length >= 2) return care('toScreen', { name, index });
    }
    if (SETUP_LIST.test(text)) return care('setups');
    if (SETUP.test(text)) {
      // "retiens mon setup de jeu", "save my gaming setup": its name is around the word setup
      const after = /(?:set-?up|espace de travail|workspace|espacio de trabajo|espa[çc]o de trabalho|сетап|рабочее пространство)\s+(?:(?:de|du|d['’]|for|para|pour|do|da|для)\s+)?(.{1,30}?)\s*[.!?]*$/iu.exec(text)?.[1];
      const before = /(?:mon|ma|le|my|the|this|mi|el|meu|minha|o|мой|ce)\s+(\p{L}[\p{L}\p{N}-]{1,20})\s+set-?up/iu.exec(text)?.[1];
      const name = named(after || before || '');
      if (SETUP_SAVE.test(text)) return care('remember', { name });
      if (SETUP_OPEN.test(text)) return care('launchSetup', { name });
    }
    const kind = KINDS.find(([, re]) => re.test(text))?.[0];
    const target = OUTPUT_TO.exec(text)?.[1];
    if (((SOUND.test(text) && kind) || target || OUTPUT_LIST.test(text)) && !OFF.test(text) && !/\d/.test(text)) {
      return care('output', { device: kind || null, target: kind ? null : named(target || '') || null });
    }
    return null;
  }

  // Doing it: { line, face, buttons?, onButton? } for her chat (chat.js), or null if it failed.
  async now(asked) {
    const { t } = this;
    const run = (req) => this.host.pcDo(req);
    const size = (bytes) => this.size(bytes);
    const list = (items) => this.list(items);
    switch (asked.what) {
      case 'heavy': {
        const r = await run({ action: 'heavy' });
        if (!r) return null;
        const weighing = r.apps.filter((a) => a.cpu >= 5 || a.memory >= 400 * MB);
        if (!weighing.length) return { line: fmt(t.calm, { cpu: r.cpu, used: size(r.used), total: size(r.total) }), face: 'smug' };
        const closable = weighing.filter((a) => a.window);
        return {
          line: fmt(t.heavy, { list: list(weighing.map((a) => fmt(a.cpu >= 5 ? t.appCpu : t.appMem, { app: a.label, cpu: Math.round(a.cpu), mem: size(a.memory) }))) }),
          face: 'look',
          buttons: closable.map((a, i) => ({ id: a.name, label: fmt(this.chat.t.closeIt, { app: a.label }), primary: i === 0 })),
          onButton: (id) => {
            const app = closable.find((a) => a.name === id);
            if (app) this.chat.closeApp({ name: app.name, label: app.label }); // its own lines, and forcing it if it hides
            return null;
          },
        };
      }
      case 'space': {
        const r = await run({ action: 'space' });
        if (!r) return null;
        const free = r.temp + r.bin;
        const lines = [];
        const buttons = [];
        if (free >= 20 * MB) {
          lines.push(fmt(t.spaceFree, { total: size(free), temp: size(r.temp), bin: size(r.bin) }));
          // what you'd be clearing, so it's no surprise (After Effects' cache is often most of it)
          if (r.sources?.length) lines.push(fmt(t.tempFrom, { list: list(r.sources.map((s) => `${s.name} (${size(s.size)})`)) }));
          buttons.push({ id: 'clean', label: fmt(t.freeIt, { size: size(free) }), primary: true });
        }
        if (r.big.length) {
          lines.push(fmt(t.spaceBig, { list: list(r.big.map((f) => `${f.name} (${size(f.size)})`)) }));
          r.big.slice(0, 2).forEach((f, i) => buttons.push({ id: `file${i}`, label: fmt(t.trashIt, { file: shorter(f.name) }), primary: !buttons.length }));
        }
        if (!lines.length) return { line: t.spaceNone, face: 'smug' };
        return {
          line: lines.join('\n'), face: 'look', buttons,
          onButton: async (id) => {
            this.chat.zap();
            if (id === 'clean') {
              const c = await run({ action: 'clean' });
              return c && { line: fmt(t.freed, { size: size(c.freed) }), face: 'laugh', again: true };
            }
            const f = r.big[Number(id.slice(4))];
            const res = f && await run({ action: 'trash', path: f.path });
            return res?.ok ? { line: fmt(t.trashed, { file: f.name, size: size(res.size) }), face: 'smug', again: true } : null;
          },
        };
      }
      case 'startup': return this.startup(asked);
      case 'updates': {
        const r = await run({ action: 'updates' });
        if (r == null) return { line: t.noWinget, face: 'aside' };
        if (!r.length) return { line: t.upToDate, face: 'smug' };
        const names = r.slice(0, 6).map((u) => u.name);
        return {
          line: fmt(t.updates, { count: r.length, list: `${list(names)}${r.length > 6 ? '…' : ''}` }), face: 'look',
          buttons: [{ id: 'all', label: t.updateAll, primary: true }],
          onButton: () => ({
            line: t.updating, face: 'smug',
            later: run({ action: 'updateAll' }).then((done) => {
              this.clearTicker();
              if (!done) return null;
              return done.left.length ? { line: fmt(t.updatedLeft, { list: list(done.left) }), face: 'aside' } : { line: t.updated, face: 'laugh' };
            }),
          }),
        };
      }
      case 'duplicates': {
        const where = t.places[asked.where];
        const r = await run({ action: 'duplicates', where: asked.where });
        this.clearTicker();
        if (!r) return null;
        if (!r.copies) return { line: fmt(t.dupNone, { where }), face: 'smug' };
        return {
          line: fmt(t.dupFound, { count: r.copies, where, size: size(r.wasted) }), face: 'look',
          buttons: [{ id: 'trash', label: fmt(t.dupTrash, { size: size(r.wasted) }), primary: true }, { id: 'show', label: t.dupShow }],
          onButton: async (id) => {
            if (id === 'show') {
              this.host.openFile(r.first, true); // Explorer, with a copy picked
              return { again: true };
            }
            this.chat.zap();
            const res = await run({ action: 'trashDuplicates', where: asked.where });
            return res && { line: fmt(t.dupTrashed, { count: res.count, size: size(res.freed) }), face: 'laugh' };
          },
        };
      }
      case 'output': return this.output(asked);
      case 'mic': {
        const r = await run({ action: 'mic', mute: asked.mute });
        if (!r) return null;
        return r.none ? { line: t.noMic, face: 'aside' } : { line: r.muted ? t.micOff : t.micOn, face: 'smug' };
      }
      case 'radio': {
        const name = t.radios[asked.radio];
        const r = await run({ action: 'radio', kind: asked.radio, on: asked.on });
        if (!r) return null;
        if (r.none) return { line: fmt(t.radioNone, { radio: name }), face: 'aside' };
        if (r.denied) {
          run({ action: 'settings', page: asked.radio });
          return { line: fmt(t.radioDenied, { radio: name }), face: 'aside' };
        }
        return { line: fmt(r.state === 'On' ? t.radioOn : t.radioOff, { radio: name }), face: 'smug' };
      }
      case 'eject': {
        const drives = (await run({ action: 'usb' })) || [];
        if (!drives.length) return { line: t.noUsb, face: 'look' };
        const one = asked.letter ? drives.find((d) => d.letter === asked.letter) : drives.length === 1 && drives[0];
        if (one) return this.eject(one);
        return {
          line: t.ejectPick, face: 'look',
          buttons: drives.map((d, i) => ({ id: d.letter, label: this.drive(d), primary: i === 0 })),
          onButton: (id) => this.eject(drives.find((d) => d.letter === id)),
        };
      }
      case 'brightness': {
        const r = await run({ action: 'brightness', level: asked.level ?? null, by: asked.by ?? null });
        if (!r) return null;
        return r.none ? { line: t.noBrightness, face: 'aside' } : { line: fmt(t.brightness, { level: r.level }), face: 'smug' };
      }
      case 'gameBar': return this.gameBar(asked.bar);
      case 'rescue': {
        this.chat.zap();
        const r = await run({ action: 'rescue' });
        if (!r) return null;
        return r.moved.length ? { line: fmt(t.rescued, { list: list(r.moved) }), face: 'smug' } : { line: t.noneLost, face: 'look' };
      }
      case 'toScreen': {
        const r = await run({ action: 'toScreen', name: asked.name, index: asked.index });
        if (!r) return null;
        if (r.screens < 2) return { line: t.oneScreen, face: 'look' };
        if (!r.found) return { line: fmt(this.chat.t.pc.notOpen, { app: asked.name }), face: 'look' };
        this.chat.zap();
        return { line: fmt(t.movedScreen, { app: r.name, screen: r.screen }), face: 'smug' };
      }
      case 'remember': {
        const r = await run({ action: 'remember', name: asked.name });
        if (!r) return null;
        if (!r.apps.length) return { line: t.setupEmpty, face: 'look' };
        return { line: fmt(r.name === 'setup' ? t.setupSavedPlain : t.setupSaved, { name: r.name, list: list(r.apps) }), face: 'smug' };
      }
      case 'setups': {
        const r = await run({ action: 'setups' });
        return r?.names.length ? { line: fmt(t.setupList, { list: list(r.names) }), face: 'look' } : { line: t.noSetups, face: 'look' };
      }
      case 'launchSetup': {
        const names = (await run({ action: 'setups' }))?.names || [];
        const name = (asked.name || (names.length === 1 ? names[0] : 'setup')).toLowerCase();
        if (!names.includes(name)) return { line: names.length ? fmt(t.setupUnknown, { name, list: list(names) }) : t.noSetups, face: 'look' };
        // it opens apps: your click first, as for any app she'd open
        const plain = name === 'setup';
        return {
          line: fmt(plain ? t.setupAskPlain : t.setupAsk, { name }), face: 'smug',
          buttons: [{ id: 'go', label: t.setupGo, primary: true }, { id: 'no', label: this.chat.t.no }],
          onButton: async (id) => {
            if (id !== 'go') return null;
            this.chat.zap();
            const r = await run({ action: 'launchSetup', name });
            if (!r) return null;
            if (r.failed.length) return { line: fmt(plain ? t.setupPartlyPlain : t.setupPartly, { name, list: list(r.failed) }), face: 'aside' };
            return { line: fmt(plain ? t.setupDonePlain : t.setupDone, { name }), face: 'laugh' };
          },
        };
      }
      case 'gameMode': return this.gameMode(asked);
      case 'internet': return this.internet();
      default:
        return null;
    }
  }

  // What starts with Windows, with a button to take some out; or one of them, by name, out or back in.
  async startup({ name, on }) {
    const { t } = this;
    const all = (await this.host.pcDo({ action: 'startup' })) || [];
    const set = async (item, wanted) => {
      const r = await this.host.pcDo({ action: 'setStartup', name: item.name, on: wanted });
      if (r?.admin) return { line: fmt(t.startupAdmin, { app: pretty(item.name) }), face: 'aside' };
      return r?.ok ? { line: fmt(wanted ? t.enabled : t.disabled, { app: pretty(item.name) }), face: 'smug', again: true } : null;
    };
    if (name) {
      const key = simple(name);
      const item = all.find((s) => simple(s.name) === key) || all.find((s) => key.length >= 3 && (simple(s.name).includes(key) || key.includes(simple(s.name))));
      if (!item) return { line: fmt(t.startupUnknown, { app: name }), face: 'look' };
      this.chat.zap();
      return set(item, on);
    }
    const enabled = all.filter((s) => s.on);
    if (!enabled.length) return { line: t.startupNone, face: 'smug' };
    const off = all.filter((s) => !s.on);
    const yours = enabled.filter((s) => s.where === 'user' || s.where === 'folder');
    return {
      line: [fmt(t.startup, { list: this.list(enabled.map((s) => pretty(s.name))) }), off.length ? fmt(t.startupOff, { list: this.list(off.map((s) => pretty(s.name))) }) : ''].filter(Boolean).join('\n'),
      face: 'look',
      buttons: (yours.length ? yours : enabled).slice(0, 3).map((s, i) => ({ id: s.name, label: fmt(t.disableIt, { app: pretty(s.name) }), primary: i === 0 })),
      onButton: (id) => set(all.find((s) => s.name === id), false),
    };
  }

  // Where the sound comes out: the device you named (or the kind: headset, speakers, screen), else
  // a button for each.
  async output({ device: kind, target }) {
    const { t } = this;
    const all = (await this.host.pcDo({ action: 'outputs' })) || [];
    const real = all.filter((o) => !VIRTUAL.test(o.name));
    const use = async (device) => {
      if (device.on) return { line: fmt(t.outputAlready, { device: device.name }), face: 'look' };
      return (await this.host.pcDo({ action: 'useOutput', id: device.id })) ? { line: fmt(t.outputSet, { device: device.name }), face: 'smug' } : null;
    };
    const words = String(target || '').split(/\s+/).map(simple).filter((w) => w.length >= 3);
    const wanted = kind ? real.filter((o) => DEVICE_KIND[kind].test(o.name))
      : all.filter((o) => words.some((w) => simple(o.name).includes(w)));
    const device = wanted.find((o) => !o.on) || wanted[0];
    if (device) return use(device);
    if (real.length <= 1) return { line: fmt(t.outputOnly, { device: (real[0] || all[0])?.name || '…' }), face: 'look' };
    return {
      line: fmt(t.outputPick, { list: this.list(real.map((o) => o.name)) }), face: 'look',
      buttons: real.slice(0, 4).map((o, i) => ({ id: o.id, label: deviceLabel(o.name), primary: i === 0 })),
      onButton: (id) => use(real.find((o) => o.id === id)),
    };
  }

  drive(d) {
    return `${d.label || this.t.usbStick} (${d.letter}:)`;
  }

  async eject(d) {
    const { t } = this;
    const r = await this.host.pcDo({ action: 'eject', letter: d.letter });
    const drive = this.drive(d);
    if (r?.ok) return { line: fmt(t.ejected, { drive }), face: 'smug' };
    return { line: fmt(r?.busy ? t.ejectBusy : t.ejectFailed, { drive }), face: 'aside' };
  }

  // The Game Bar takes what's in front: her chat out of the way first (the game gets the keyboard
  // back), then its shortcut, and her line in a panel of her own.
  async gameBar(bar) {
    const { t } = this;
    if (this.chat.open) this.panel.hide();
    await new Promise((r) => setTimeout(r, 500));
    const r = await this.host.pcDo({ action: 'gameBar', what: bar });
    let say;
    if (!r) say = { line: t.failed, face: 'aside' };
    else if (r.off || r.noHistory) {
      say = {
        line: r.off ? t.gameBarOff : t.clipOff, face: 'look',
        actions: [{ id: 'settings', label: t.openSettings, primary: true }],
        onAction: () => this.host.pcDo({ action: 'settings', page: 'gaming' }),
      };
    } else if (bar === 'clip') say = { line: t.clipped, face: 'smug' };
    else {
      this.recording = !this.recording;
      say = { line: this.recording ? t.recording : t.recordStop, face: 'smug' };
    }
    this.panel.say({ kind: 'info', hold: say.actions ? 12000 : 4000, ...say });
    return null;
  }

  // Game mode on (behind a button: it closes apps), off, or the apps it closes.
  async gameMode({ on, close }) {
    const { t } = this;
    const run = (req) => this.host.pcDo(req);
    if (close) {
      const r = await run({ action: 'gameClose', apps: close });
      return r && { line: fmt(t.gameCloseSet, { list: this.list(r.apps) }), face: 'smug' };
    }
    if (!on) {
      const r = await run({ action: 'gameMode', on: false });
      if (!r) return null;
      if (r.notOn) return { line: t.gameNotOn, face: 'look' };
      this.host.setConfig({ visible: true }); // back out of her biochip
      return { line: r.reopened.length ? fmt(t.gameOffReopen, { list: this.list(r.reopened) }) : t.gameOff, face: 'laugh' };
    }
    const closing = (await this.host.getConfig()).gameClose || [];
    return {
      line: [t.gameAsk, closing.length ? fmt(t.gameAskClose, { list: this.list(closing) }) : t.gameAskNone].join(' '), face: 'smug',
      buttons: [{ id: 'go', label: t.gameGo, primary: true }, { id: 'no', label: this.chat.t.no }],
      onButton: async (id) => {
        if (id !== 'go') return null;
        this.chat.zap();
        const r = await run({ action: 'gameMode', on: true });
        if (!r) return null;
        // then she folds herself away, out of your game
        setTimeout(() => this.host.setConfig({ visible: false }), 3500);
        const lines = [t.gameOn];
        if (r.closed?.length) lines.push(fmt(t.gameClosed, { list: this.list(r.closed) }));
        if (r.plan === false) lines.push(t.gameNoPlan);
        return { line: lines.join('\n'), face: 'laugh' };
      },
    };
  }

  // Why the internet's down, and what to do about it in one sentence.
  async internet() {
    const { t } = this;
    const r = await this.host.pcDo({ action: 'internet' });
    if (!r) return null;
    switch (r.problem) {
      case 'offline':
        return {
          line: t.netOffline, face: 'wide',
          buttons: [{ id: 'wifi', label: t.wifiOn, primary: true }, { id: 'settings', label: t.wifiSettings }],
          onButton: async (id) => {
            if (id === 'settings') {
              this.host.pcDo({ action: 'settings', page: 'wifi' });
              return null;
            }
            const w = await this.host.pcDo({ action: 'radio', kind: 'wifi', on: true });
            return { line: w?.state === 'On' ? fmt(t.radioOn, { radio: t.radios.wifi }) : fmt(t.radioDenied, { radio: t.radios.wifi }), face: 'smug' };
          },
        };
      case 'box': return { line: t.netBox, face: 'aside' };
      case 'isp': return { line: t.netIsp, face: 'aside' };
      case 'dns': return { line: r.fixed ? t.netDnsFixed : t.netDns, face: r.fixed ? 'laugh' : 'aside' };
      case 'portal':
        return {
          line: t.netPortal, face: 'look',
          buttons: [{ id: 'open', label: t.netPortalOpen, primary: true }],
          onButton: () => {
            this.host.openSite('http://www.msftconnecttest.com/redirect'); // Windows' own way to the sign-in page
            return null;
          },
        };
      default: return { line: t.netOk, face: 'look' };
    }
  }

  // What takes a while, in her ticker (unless Claude's at work in it)
  progress(p) {
    const { t } = this;
    const shown = this.panel.tickerAction;
    if (shown && !shown.care && !shown.countdown) return;
    if (p.kind === 'update') this.panel.setTicker({ verb: t.updateVerb, target: `${p.at}/${p.of}${p.id ? ` ${p.id}` : ''}`, thinking: true, care: true });
    else if (p.kind === 'duplicates' && p.of) this.panel.setTicker({ verb: t.dupVerb, target: `${Math.round((100 * p.at) / p.of)} %`, thinking: true, care: true });
  }

  clearTicker() {
    if (this.panel.tickerAction?.care) this.panel.setTicker(null);
  }

  // A line that comes later (her chat may be closed by then): in her chat if it's free, else a panel
  tell(line, face = 'look') {
    if (this.chat.interject(line, [], null)) return;
    this.panel.say({ kind: 'done', face, line, hold: 7000 });
  }

  size(bytes) {
    const { t } = this;
    const gb = bytes >= 1024 ** 3;
    const n = new Intl.NumberFormat(this.brain.lang, { maximumFractionDigits: gb && bytes < 100 * 1024 ** 3 ? 1 : 0 })
      .format(gb ? bytes / 1024 ** 3 : Math.max(1, bytes / MB));
    return `${n} ${gb ? t.gb : t.mb}`;
  }

  // "Chrome, Discord et Steam"
  list(items) {
    return items.length > 1 ? `${items.slice(0, -1).join(', ')} ${this.t.and} ${items.at(-1)}` : items[0] || '';
  }
}

const simple = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
// a name as it starts: "Discord.lnk" -> "Discord", "com.squirrel.Teams.Teams" -> "Teams"
const pretty = (name) => String(name).replace(/\.(lnk|exe|url)$/i, '').replace(/^com\.squirrel\.([^.]+)\..*$/i, '$1');
// a device's name for a button: "Speaker (Realtek(R) Audio)" -> "Speaker (Realtek)", "Haut-parleurs (Yeti Classic)" -> "Haut-parleurs (Yeti)"
function deviceLabel(name) {
  const parts = /^(.*?)\s*\((.*)\)$/.exec(name);
  if (!parts) return shorter(name);
  const brand = parts[2].replace(/\((?:R|TM)\)/gi, '').trim().split(/\s+/)[0];
  return shorter(brand ? `${parts[1]} (${brand})` : parts[1]);
}

// a long name short enough for a button
const shorter = (s) => (s.length > 26 ? `${s.slice(0, 24)}…` : s);
