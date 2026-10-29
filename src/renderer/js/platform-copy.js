// macOS wording stays separate so the existing Windows translations remain unchanged.
const COPY = {
  en: {
    install: 'Download Ollama from its site, move it to Applications, and open it. Then come back here.',
    icon: 'My icon is in the menu bar at the top of your screen.',
    hidden: 'Look for Capri in the menu bar. You can also right-click me for the same menu.',
    wake: 'Open Ollama from Applications, then talk to me again.',
    media: 'Allow Capri in System Settings → Privacy & Security → Accessibility, then try again. My menu has a shortcut to those settings.',
    key: 'I keep it on this Mac, encrypted using your macOS Keychain.',
  },
  fr: {
    install: 'Télécharge Ollama depuis son site, place-le dans Applications et ouvre-le. Puis reviens ici.',
    icon: 'Mon icône est dans la barre des menus, en haut de ton écran.',
    hidden: 'Cherche Capri dans la barre des menus. Un clic droit sur moi ouvre le même menu.',
    wake: 'Ouvre Ollama depuis Applications, puis reparle-moi.',
    media: 'Autorise Capri dans Réglages Système → Confidentialité et sécurité → Accessibilité, puis réessaie.',
    key: 'Je la garde sur ce Mac, chiffrée avec ton trousseau macOS.',
  },
  es: {
    install: 'Descarga Ollama de su sitio, muévelo a Aplicaciones y ábrelo. Después vuelve aquí.',
    icon: 'Mi icono está en la barra de menús, arriba de la pantalla.',
    hidden: 'Busca Capri en la barra de menús. También puedes hacer clic derecho sobre mí.',
    wake: 'Abre Ollama desde Aplicaciones y vuelve a hablar conmigo.',
    media: 'Permite Capri en Ajustes del Sistema → Privacidad y seguridad → Accesibilidad y vuelve a intentarlo.',
    key: 'La guardo en este Mac, cifrada con tu llavero de macOS.',
  },
  pt: {
    install: 'Baixe o Ollama pelo site, mova para Aplicativos e abra. Depois volte aqui.',
    icon: 'Meu ícone fica na barra de menus, no topo da tela.',
    hidden: 'Procure Capri na barra de menus. Clicar com o botão direito em mim abre o mesmo menu.',
    wake: 'Abra o Ollama em Aplicativos e fale comigo de novo.',
    media: 'Permita Capri em Ajustes do Sistema → Privacidade e Segurança → Acessibilidade e tente de novo.',
    key: 'Eu guardo ela neste Mac, criptografada com as Chaves do macOS.',
  },
  ru: {
    install: 'Скачай Ollama с его сайта, перемести в «Программы» и открой. Затем вернись сюда.',
    icon: 'Мой значок в строке меню вверху экрана.',
    hidden: 'Ищи Capri в строке меню. Правый клик по мне открывает то же меню.',
    wake: 'Открой Ollama из папки «Программы» и поговори со мной снова.',
    media: 'Разреши Capri в Системных настройках → Конфиденциальность и безопасность → Универсальный доступ и повтори попытку.',
    key: 'Я храню его на этом Mac, зашифрованным с помощью Связки ключей macOS.',
  },
};
const cache = new WeakMap();

export function platformCopy(base, lang, platform) {
  if (platform !== 'darwin') return base;
  if (cache.has(base)) return cache.get(base);
  const convert = (value) => {
    if (typeof value === 'string') return value.replaceAll('Ctrl+Alt+C', '⌘⌥C')
      .replace(/\bPCs\b/g, 'Macs').replace(/\bPC\b/g, 'Mac').replaceAll('ПК', 'Mac');
    if (Array.isArray(value)) return value.map(convert);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v)]));
    return value;
  };
  const result = convert(base);
  const copy = COPY[lang] || COPY.en;
  result.guide.icon.line = copy.icon;
  result.guide.icon.hidden = copy.hidden;
  result.setup.installHow = result.setup.noWingetHow = copy.install;
  result.setup.wakeFailedHow = copy.wake;
  result.motion.line = result.motion.line.replaceAll('Windows', 'macOS');
  result.setup.pasteHow = copy.key;
  result.chat.mediaUnavailable = copy.media;
  result.chat.folders.explorer = 'Finder';
  cache.set(base, result);
  return result;
}
