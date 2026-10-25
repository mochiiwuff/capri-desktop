'use strict';

// The tray menu (and the one she opens when you right-click her), in every language she speaks.
// The order of this object is the order of the Language submenu.

const TRAY = {
  fr: {
    name: 'Français',
    online: (port) => `Capri — à l'écoute sur ${port}`,
    teleport: 'Téléporter', satellite: 'Regarder le satellite', demo: 'Lancer la démo', help: 'Comment ça marche ?',
    show: 'La faire revenir', hide: 'La ranger',
    size: 'Taille', small: 'Petite', medium: 'Moyenne', large: 'Grande', sound: 'Son', mute: 'Muet',
    soundsDir: 'Ouvrir le dossier des sons perso', screen: 'Écran', wander: 'Se balader quand rien ne se passe',
    possess: 'Posséder mes fenêtres', lang: 'Langue', auto: 'Automatique (système)', startup: 'Lancer au démarrage',
    hooksOn: 'Hooks Claude Code : installés', hooksOff: 'Installer les hooks Claude Code',
    hooksRemove: 'Retirer les hooks Claude Code', quit: 'Quitter',
    login: 'Lancer au démarrage', gnomeOn: 'Assistant GNOME : actif',
    gnomeOff: 'Installer l’assistant GNOME (pour voir mes fenêtres)', gnomeRelog: 'Assistant GNOME : ferme ta session et reviens',
  },
  en: {
    name: 'English',
    online: (port) => `Capri — listening on ${port}`,
    teleport: 'Teleport', satellite: 'Look at the satellite', demo: 'Play demo', help: 'How does it work?',
    show: 'Bring her back', hide: 'Put her away',
    size: 'Size', small: 'Small', medium: 'Medium', large: 'Large', sound: 'Sound', mute: 'Mute',
    soundsDir: 'Open custom sounds folder', screen: 'Screen', wander: 'Wander around when idle',
    possess: 'Possess my windows', lang: 'Language', auto: 'Automatic (system)', startup: 'Start with Windows',
    hooksOn: 'Claude Code hooks: installed', hooksOff: 'Install Claude Code hooks',
    hooksRemove: 'Remove Claude Code hooks', quit: 'Quit',
    login: 'Start at login', gnomeOn: 'GNOME helper: on',
    gnomeOff: 'Install the GNOME helper (to see my windows)', gnomeRelog: 'GNOME helper: log out and back in',
  },
  es: {
    name: 'Español',
    online: (port) => `Capri — escuchando en ${port}`,
    teleport: 'Teletransportar', satellite: 'Mirar el satélite', demo: 'Ver la demo', help: '¿Cómo funciona?',
    show: 'Traerla de vuelta', hide: 'Guardarla',
    size: 'Tamaño', small: 'Pequeña', medium: 'Mediana', large: 'Grande', sound: 'Sonido', mute: 'Silenciar',
    soundsDir: 'Abrir la carpeta de sonidos propios', screen: 'Pantalla', wander: 'Pasear cuando no pasa nada',
    possess: 'Poseer mis ventanas', lang: 'Idioma', auto: 'Automático (sistema)', startup: 'Iniciar con Windows',
    hooksOn: 'Hooks de Claude Code: instalados', hooksOff: 'Instalar los hooks de Claude Code',
    hooksRemove: 'Quitar los hooks de Claude Code', quit: 'Salir',
    login: 'Iniciar al iniciar sesión', gnomeOn: 'Ayudante de GNOME: activo',
    gnomeOff: 'Instalar el ayudante de GNOME (para ver mis ventanas)', gnomeRelog: 'Ayudante de GNOME: cierra sesión y vuelve',
  },
  pt: {
    name: 'Português (Brasil)',
    online: (port) => `Capri — ouvindo na porta ${port}`,
    teleport: 'Teletransportar', satellite: 'Olhar o satélite', demo: 'Ver a demo', help: 'Como funciona?',
    show: 'Trazer de volta', hide: 'Guardar',
    size: 'Tamanho', small: 'Pequena', medium: 'Média', large: 'Grande', sound: 'Som', mute: 'Sem som',
    soundsDir: 'Abrir a pasta de sons personalizados', screen: 'Tela', wander: 'Passear quando nada acontece',
    possess: 'Possuir minhas janelas', lang: 'Idioma', auto: 'Automático (sistema)', startup: 'Iniciar com o Windows',
    hooksOn: 'Hooks do Claude Code: instalados', hooksOff: 'Instalar os hooks do Claude Code',
    hooksRemove: 'Remover os hooks do Claude Code', quit: 'Sair',
    login: 'Iniciar ao entrar na sessão', gnomeOn: 'Ajudante do GNOME: ativo',
    gnomeOff: 'Instalar o ajudante do GNOME (para ver minhas janelas)', gnomeRelog: 'Ajudante do GNOME: saia da sessão e volte',
  },
  ru: {
    name: 'Русский',
    online: (port) => `Capri — слушаю порт ${port}`,
    teleport: 'Телепортироваться', satellite: 'Посмотреть на спутник', demo: 'Запустить демо', help: 'Как это работает?',
    show: 'Вернуть её', hide: 'Спрятать',
    size: 'Размер', small: 'Маленькая', medium: 'Средняя', large: 'Большая', sound: 'Звук', mute: 'Без звука',
    soundsDir: 'Открыть папку своих звуков', screen: 'Экран', wander: 'Гулять, когда ничего не происходит',
    possess: 'Вселяться в мои окна', lang: 'Язык', auto: 'Автоматически (системный)', startup: 'Запускать вместе с Windows',
    hooksOn: 'Хуки Claude Code: установлены', hooksOff: 'Установить хуки Claude Code',
    hooksRemove: 'Удалить хуки Claude Code', quit: 'Выйти',
    login: 'Запускать при входе', gnomeOn: 'Помощник GNOME: работает',
    gnomeOff: 'Установить помощника GNOME (чтобы видеть мои окна)', gnomeRelog: 'Помощник GNOME: выйди из сеанса и зайди снова',
  },
};

module.exports = { TRAY, LANGS: Object.keys(TRAY) };
