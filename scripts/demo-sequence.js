'use strict';

// A fake but realistic Claude Code session, used by `npm run demo` and the tray menu, then the
// showcase: everything she does on her own, one after the other (app.js). Each step:
// [delay before sending (ms), event]. What you'd type and what Claude would write come in her
// language; what Claude Code and the tools print themselves stays as they print it (English).

const SESSION = 'demo-session';
const CWD = 'C:/Users/you/projects/night-city-api';

const TEXT = {
  fr: {
    prompt: 'Ajoute un endpoint /gigs avec pagination et des tests',
    explore: 'Vérifier les autres routes',
    test: 'Lancer les tests des gigs',
    push: 'Pousser sur main',
    reply: "J'ai ajouté **GET /gigs** avec une pagination par curseur, et 6 tests passent. Le push est fait.",
  },
  en: {
    prompt: 'Add a /gigs endpoint with pagination and tests',
    explore: 'Check the other routes',
    test: 'Run the gigs tests',
    push: 'Push to main',
    reply: 'I added **GET /gigs** with cursor pagination, and 6 tests pass. The push is done.',
  },
  es: {
    prompt: 'Añade un endpoint /gigs con paginación y tests',
    explore: 'Revisar las otras rutas',
    test: 'Ejecutar los tests de gigs',
    push: 'Hacer push a main',
    reply: 'He añadido **GET /gigs** con paginación por cursor, y pasan 6 tests. El push está hecho.',
  },
  pt: {
    prompt: 'Adicione um endpoint /gigs com paginação e testes',
    explore: 'Verificar as outras rotas',
    test: 'Rodar os testes de gigs',
    push: 'Fazer push na main',
    reply: 'Adicionei **GET /gigs** com paginação por cursor, e 6 testes passam. O push foi feito.',
  },
  ru: {
    prompt: 'Добавь эндпоинт /gigs с пагинацией и тестами',
    explore: 'Проверить остальные маршруты',
    test: 'Запустить тесты gigs',
    push: 'Запушить в main',
    reply: 'Готово: **GET /gigs** с пагинацией по курсору, 6 тестов проходят. Пуш сделан.',
  },
  uk: {
    prompt: 'Додай ендпоінт /gigs з пагінацією і тестами',
    explore: 'Перевірити решту маршрутів',
    test: 'Запустити тести gigs',
    push: 'Запушити в main',
    reply: 'Готово: **GET /gigs** з пагінацією за курсором, 6 тестів проходять. Пуш зроблено.',
  },
};

// demo: not a real Claude Code event (she doesn't count it as her first contact)
const base = (name, extra = {}) => ({ hook_event_name: name, session_id: SESSION, cwd: CWD, demo: true, ...extra });
const tool = (name, input) => base('PreToolUse', { tool_name: name, tool_input: input });
const done = (name, input, ms) => base('PostToolUse', { tool_name: name, tool_input: input, duration_ms: ms });

// The steps, in `lang` (fr, en, es, pt, ru; English for anything else).
module.exports = function demoSteps(lang = 'en') {
  const t = TEXT[lang] || TEXT.en;
  return [
    [0, base('SessionStart', { source: 'startup' })],
    [2600, base('UserPromptSubmit', { prompt: t.prompt })],
    [1800, tool('Glob', { pattern: 'src/**/*.ts' })],
    [700, tool('Read', { file_path: `${CWD}/src/routes/index.ts` })],
    [900, tool('Read', { file_path: `${CWD}/src/db/gigs.ts` })],
    [1100, tool('Grep', { pattern: 'paginate' })],
    [900, tool('WebFetch', { url: 'https://docs.night.city/api/pagination' })],
    [1000, tool('Agent', { description: t.explore, subagent_type: 'Explore' })],
    [500, base('SubagentStart', { agent_type: 'Explore' })],
    [2400, base('SubagentStop', { agent_type: 'Explore' })],
    [1500, tool('Write', { file_path: `${CWD}/src/routes/gigs.ts`, content_len: 1840 })],
    [1300, tool('Edit', { file_path: `${CWD}/src/routes/index.ts`, old_string_len: 40, new_string_len: 92 })],
    [1200, tool('Bash', { command: 'npm test -- gigs', description: t.test })],
    [2200, base('PostToolUseFailure', { tool_name: 'Bash', tool_input: { command: 'npm test -- gigs' }, error: 'Exit code 1\nExpected 20 items, received 21' })],
    [1600, tool('Edit', { file_path: `${CWD}/src/routes/gigs.ts`, old_string_len: 12, new_string_len: 14 })],
    [1000, tool('Bash', { command: 'git push origin main', description: t.push })],
    [700, base('Notification', { notification_type: 'permission_prompt', title: 'Permission needed', message: 'Claude needs your permission to use Bash' })],
    [5200, done('Bash', { command: 'npm test -- gigs' }, 3100)],
    [1500, base('Stop', { last_assistant_message: t.reply })],
    // not a Claude event: starts the showcase once the done panel has been read
    [9000, base('CapriShowcase')],
  ];
};
