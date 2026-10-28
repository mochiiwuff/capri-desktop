'use strict';

const TEXT = {
  fr: {
    title: 'Diagnostic et fonctions disponibles', copy: 'Copier le diagnostic', refresh: 'Actualiser', close: 'Fermer',
    intro: 'Voici ce que Capri peut utiliser dans cette session. Les captures peuvent demander une permission.',
    systemMotion: 'Comme le système',
    states: { supported: 'Pris en charge', unavailable: 'Indisponible', conditional: 'À confirmer' },
    features: { overlay: 'Affichage de Capri', windowTracking: 'Suivi des fenêtres', screenCapture: 'Capture d’écran',
      appCatalog: 'Applications installées', closeApps: 'Fermer une application', media: 'Commandes multimédias',
      aiDetection: 'Détection des autres IA', taskbarRest: 'Repos sur la barre des tâches', autoStart: 'Démarrage automatique',
      ollamaInstall: 'Installation automatique d’Ollama', ollamaLaunch: 'Lancer un assistant via Ollama' },
    reasons: {
      windowsOnly: 'Cette intégration est actuellement disponible uniquement sous Windows.',
      noTracking: 'Le suivi des fenêtres nécessite Windows ou une session Hyprland.',
      nativeWayland: 'L’overlay nécessite XWayland : relance Capri sans --ozone-platform=wayland.',
      noDisplay: 'Aucun affichage X11/XWayland n’est disponible. Lance Capri depuis ta session de bureau.',
      noHyprctl: 'hyprctl est introuvable. Vérifie l’installation de Hyprland et relance depuis sa session.',
      hyprctlOffline: 'Hyprland ne répond pas. Vérifie la session puis actualise le diagnostic.',
      portalPermission: 'Le portail répond, mais la capture reste à essayer avec ta permission ; le résultat dépend du bureau.',
      portalUnknown: 'Le portail de capture n’est pas confirmé. Vérifie xdg-desktop-portal-hyprland et PipeWire ; un portail peut démarrer à la demande.',
      noAutoStart: 'Le démarrage automatique Linux n’est pas encore intégré. Utilise les réglages de démarrage de ton bureau.',
      manualOllama: 'Installe Ollama séparément depuis son site ou le gestionnaire de paquets de ta distribution.',
      manualLaunch: 'Lance ollama launch claude ou ollama launch codex dans ton terminal. L’ouverture automatique est réservée à Windows.',
    },
    trayNote: 'La visibilité de l’icône ne peut pas être confirmée. Sous Hyprland, vérifie le module tray de Waybar. Le clic droit sur Capri ouvre aussi son menu.',
    captureFailed: 'La capture a échoué ou a été annulée. Vérifie les permissions et le portail du bureau dans le diagnostic.',
  },
  en: {
    title: 'Diagnostics and available features', copy: 'Copy diagnostics', refresh: 'Refresh', close: 'Close',
    intro: 'These are the features Capri can use in this session. Screen capture may request permission.',
    systemMotion: 'Follow the system',
    states: { supported: 'Supported', unavailable: 'Unavailable', conditional: 'Needs confirmation' },
    features: { overlay: 'Capri overlay', windowTracking: 'Window tracking', screenCapture: 'Screen capture',
      appCatalog: 'Installed applications', closeApps: 'Close an application', media: 'Media controls',
      aiDetection: 'Detect other AIs', taskbarRest: 'Rest on the taskbar', autoStart: 'Start at login',
      ollamaInstall: 'Install Ollama automatically', ollamaLaunch: 'Launch an assistant through Ollama' },
    reasons: {
      windowsOnly: 'This integration is currently available only on Windows.',
      noTracking: 'Window tracking requires Windows or a Hyprland session.',
      nativeWayland: 'The overlay requires XWayland: restart Capri without --ozone-platform=wayland.',
      noDisplay: 'No X11/XWayland display is available. Start Capri from your desktop session.',
      noHyprctl: 'hyprctl was not found. Check your Hyprland installation and start Capri from its session.',
      hyprctlOffline: 'Hyprland is not responding. Check the session and refresh diagnostics.',
      portalPermission: 'The portal is running, but capture still needs to be tried with your permission; results depend on the desktop.',
      portalUnknown: 'The capture portal is unconfirmed. Check xdg-desktop-portal-hyprland and PipeWire; a portal may start on demand.',
      noAutoStart: 'Linux autostart is not integrated yet. Use your desktop startup settings.',
      manualOllama: 'Install Ollama separately from its website or your distribution package manager.',
      manualLaunch: 'Run ollama launch claude or ollama launch codex in your terminal. Automatic launching is currently Windows-only.',
    },
    trayNote: 'Tray icon visibility is unconfirmed. On Hyprland, check the Waybar tray module. Right-clicking Capri also opens her menu.',
    captureFailed: 'Screen capture failed or was cancelled. Check permissions and the desktop portal in diagnostics.',
  },
};

// Keep the diagnostic usable in every language offered by the application.
TEXT.es = { ...TEXT.en, title: 'Diagnóstico y funciones disponibles', copy: 'Copiar diagnóstico', refresh: 'Actualizar', close: 'Cerrar',
  intro: 'Estas son las funciones disponibles en esta sesión. La captura puede pedir permiso.', systemMotion: 'Como el sistema',
  states: { supported: 'Compatible', unavailable: 'No disponible', conditional: 'Por confirmar' },
  captureFailed: 'La captura falló o se canceló. Revisa los permisos y el portal del escritorio en el diagnóstico.' };
TEXT.pt = { ...TEXT.en, title: 'Diagnóstico e funções disponíveis', copy: 'Copiar diagnóstico', refresh: 'Atualizar', close: 'Fechar',
  intro: 'Estas são as funções disponíveis nesta sessão. A captura pode pedir permissão.', systemMotion: 'Como o sistema',
  states: { supported: 'Compatível', unavailable: 'Indisponível', conditional: 'A confirmar' },
  captureFailed: 'A captura falhou ou foi cancelada. Confira as permissões e o portal do desktop no diagnóstico.' };
TEXT.ru = { ...TEXT.en, title: 'Диагностика и доступные функции', copy: 'Копировать диагностику', refresh: 'Обновить', close: 'Закрыть',
  intro: 'Функции, доступные в этом сеансе. Для снимка экрана может потребоваться разрешение.', systemMotion: 'Как в системе',
  states: { supported: 'Поддерживается', unavailable: 'Недоступно', conditional: 'Нужно проверить' },
  captureFailed: 'Снимок не сделан или отменён. Проверь разрешения и портал рабочего стола в диагностике.' };

TEXT.es.features = { overlay: 'Visualización de Capri', windowTracking: 'Seguimiento de ventanas', screenCapture: 'Captura de pantalla',
  appCatalog: 'Aplicaciones instaladas', closeApps: 'Cerrar una aplicación', media: 'Controles multimedia',
  aiDetection: 'Detectar otras IA', taskbarRest: 'Descansar en la barra de tareas', autoStart: 'Inicio automático',
  ollamaInstall: 'Instalar Ollama automáticamente', ollamaLaunch: 'Abrir un asistente con Ollama' };
TEXT.es.reasons = {
  windowsOnly: 'Esta integración actualmente solo está disponible en Windows.',
  noTracking: 'El seguimiento de ventanas requiere Windows o una sesión Hyprland.',
  nativeWayland: 'La capa necesita XWayland: reinicia Capri sin --ozone-platform=wayland.',
  noDisplay: 'No hay pantalla X11/XWayland disponible. Inicia Capri desde tu sesión de escritorio.',
  noHyprctl: 'No se encontró hyprctl. Revisa Hyprland e inicia Capri desde su sesión.',
  hyprctlOffline: 'Hyprland no responde. Revisa la sesión y actualiza el diagnóstico.',
  portalPermission: 'El portal está activo, pero hay que probar la captura con tu permiso; el resultado depende del escritorio.',
  portalUnknown: 'El portal de captura no está confirmado. Revisa xdg-desktop-portal-hyprland y PipeWire; puede iniciarse bajo demanda.',
  noAutoStart: 'El inicio automático en Linux aún no está integrado. Usa los ajustes de inicio de tu escritorio.',
  manualOllama: 'Instala Ollama por separado desde su web o el gestor de paquetes de tu distribución.',
  manualLaunch: 'Ejecuta ollama launch claude u ollama launch codex en tu terminal. La apertura automática solo funciona en Windows.',
};
TEXT.es.trayNote = 'No se puede confirmar la visibilidad del icono. En Hyprland, revisa el módulo tray de Waybar. El clic derecho en Capri también abre su menú.';

TEXT.pt.features = { overlay: 'Exibição da Capri', windowTracking: 'Acompanhamento de janelas', screenCapture: 'Captura de tela',
  appCatalog: 'Aplicativos instalados', closeApps: 'Fechar um aplicativo', media: 'Controles de mídia',
  aiDetection: 'Detectar outras IAs', taskbarRest: 'Descansar na barra de tarefas', autoStart: 'Início automático',
  ollamaInstall: 'Instalar Ollama automaticamente', ollamaLaunch: 'Abrir um assistente pelo Ollama' };
TEXT.pt.reasons = {
  windowsOnly: 'Esta integração está disponível apenas no Windows por enquanto.',
  noTracking: 'O acompanhamento de janelas exige Windows ou uma sessão Hyprland.',
  nativeWayland: 'A sobreposição exige XWayland: reinicie Capri sem --ozone-platform=wayland.',
  noDisplay: 'Nenhuma tela X11/XWayland está disponível. Inicie Capri pela sua sessão de desktop.',
  noHyprctl: 'hyprctl não foi encontrado. Confira o Hyprland e inicie Capri pela sessão dele.',
  hyprctlOffline: 'Hyprland não responde. Confira a sessão e atualize o diagnóstico.',
  portalPermission: 'O portal está ativo, mas a captura precisa ser testada com sua permissão; o resultado depende do desktop.',
  portalUnknown: 'O portal de captura não foi confirmado. Confira xdg-desktop-portal-hyprland e PipeWire; ele pode iniciar sob demanda.',
  noAutoStart: 'O início automático no Linux ainda não está integrado. Use as configurações de inicialização do seu desktop.',
  manualOllama: 'Instale Ollama separadamente pelo site ou pelo gerenciador de pacotes da sua distribuição.',
  manualLaunch: 'Execute ollama launch claude ou ollama launch codex no terminal. A abertura automática só funciona no Windows.',
};
TEXT.pt.trayNote = 'A visibilidade do ícone não foi confirmada. No Hyprland, confira o módulo tray do Waybar. Clicar com o botão direito na Capri também abre o menu.';

TEXT.ru.features = { overlay: 'Отображение Capri', windowTracking: 'Отслеживание окон', screenCapture: 'Снимок экрана',
  appCatalog: 'Установленные приложения', closeApps: 'Закрытие приложения', media: 'Управление воспроизведением',
  aiDetection: 'Обнаружение других ИИ', taskbarRest: 'Отдых на панели задач', autoStart: 'Автозапуск',
  ollamaInstall: 'Автоматическая установка Ollama', ollamaLaunch: 'Запуск помощника через Ollama' };
TEXT.ru.reasons = {
  windowsOnly: 'Эта интеграция пока доступна только в Windows.',
  noTracking: 'Для отслеживания окон нужна Windows или сеанс Hyprland.',
  nativeWayland: 'Для наложения нужен XWayland: перезапусти Capri без --ozone-platform=wayland.',
  noDisplay: 'Экран X11/XWayland недоступен. Запусти Capri из сеанса рабочего стола.',
  noHyprctl: 'hyprctl не найден. Проверь установку Hyprland и запусти Capri из его сеанса.',
  hyprctlOffline: 'Hyprland не отвечает. Проверь сеанс и обнови диагностику.',
  portalPermission: 'Портал работает, но снимок нужно проверить с твоего разрешения; результат зависит от рабочего стола.',
  portalUnknown: 'Портал снимков не подтверждён. Проверь xdg-desktop-portal-hyprland и PipeWire; портал может запускаться по запросу.',
  noAutoStart: 'Автозапуск в Linux пока не встроен. Используй настройки запуска рабочего стола.',
  manualOllama: 'Установи Ollama отдельно с сайта или через менеджер пакетов дистрибутива.',
  manualLaunch: 'Выполни ollama launch claude или ollama launch codex в терминале. Автоматический запуск пока доступен только в Windows.',
};
TEXT.ru.trayNote = 'Видимость значка не подтверждена. В Hyprland проверь модуль tray в Waybar. Правый щелчок по Capri тоже открывает меню.';

function platformText(lang) { return TEXT[lang] || TEXT.en; }

module.exports = { platformText };
