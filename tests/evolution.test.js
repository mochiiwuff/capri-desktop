'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { EventBus, globalBus } = require('../src/shared/events');
const {
  EmotionEngine,
  EMOTIONAL_STATES,
  STATE_PRIORITIES,
  STATE_FACES,
  STATE_ACTS,
} = require('../src/shared/emotion');
const { DesktopContextEngine } = require('../src/main/context-engine');
const { ObsidianMemoryBridge, obsidianBridge } = require('../src/main/obsidian-bridge');
const {
  MissionEngine,
  MISSION_STATES,
  TASK_STATES,
  RISK_LEVELS,
} = require('../src/main/mission-engine');
const { AssistantGateway, INTEGRATION_MODES } = require('../src/main/assistant-gateway');
const { boundMessages, chatCompletionModels, classifyFailure } = require('../src/main/llm');

// ----------------------------------------------------
// 1. EVENT BUS TESTS
// ----------------------------------------------------
test('LLM context keeps the latest request while bounding oversized history and context', () => {
  const messages = boundMessages([
    { role: 'system', content: 'persona' },
    { role: 'user', content: 'old question '.repeat(4000) },
    { role: 'assistant', content: 'old answer '.repeat(4000) },
    { role: 'user', content: 'latest request '.repeat(4000) },
  ]);
  assert.ok(messages.reduce((size, message) => size + message.content.length, 0) <= 18000);
  assert.equal(messages[0].role, 'system');
  assert.match(messages.at(-1).content, /latest request/);
});

test('chat model lists exclude speech and embedding models from fallback choices', () => {
  assert.deepEqual(chatCompletionModels(['qwen/qwen3.8-27b', 'whisper-large-v3', 'text-embedding-3-small']), ['qwen/qwen3.8-27b']);
});

test('LLM rate limits distinguish exhausted token quotas from transient overload', () => {
  assert.equal(classifyFailure(429, 'Rate limit reached for tokens per day (TPD)'), 'quota');
  assert.equal(classifyFailure(429, 'Rate limit reached for requests per minute'), 'busy');
});

test('event bus handles typed events, wildcards, deduplication and unsubscribe', () => {
  const bus = new EventBus();
  const received = [];

  const unsubSpecific = bus.on('mission.started', (e) => received.push(e));
  const unsubWildcard = bus.on('mission.*', (e) => received.push({ wildcard: true, ...e }));

  // Emit event
  const ok1 = bus.emit('mission.started', { id: 'm1' }, 'test');
  assert.equal(ok1, true);
  assert.equal(received.length, 2); // specific + wildcard

  // Deduplication check: identical event within window should be dropped
  const okDedup = bus.emit('mission.started', { id: 'm1' }, 'test');
  assert.equal(okDedup, false);
  assert.equal(received.length, 2);

  // Unsubscribe specific
  unsubSpecific();
  bus.emit('mission.progress', { id: 'm1', step: 1 }, 'test');
  assert.equal(received.length, 3); // only wildcard received

  unsubWildcard();
  bus.emit('mission.completed', { id: 'm1' }, 'test');
  assert.equal(received.length, 3); // none received
});

// ----------------------------------------------------
// 2. EMOTION ENGINE TESTS
// ----------------------------------------------------
test('emotion engine enforces priorities, durations, faces and tone instructions', (t) => {
  const bus = new EventBus();
  const emotion = new EmotionEngine({ bus });

  assert.equal(emotion.currentState, EMOTIONAL_STATES.NEUTRAL);
  assert.equal(emotion.face, 'calm');

  // Low priority transition
  emotion.transition(EMOTIONAL_STATES.CURIOUS);
  assert.equal(emotion.currentState, EMOTIONAL_STATES.CURIOUS);
  assert.equal(emotion.face, 'wide');
  assert.equal(emotion.act, 'curious');

  // Higher priority preempts lower
  emotion.transition(EMOTIONAL_STATES.ALERT);
  assert.equal(emotion.currentState, EMOTIONAL_STATES.ALERT);
  assert.equal(emotion.face, 'many');
  assert.equal(emotion.act, 'strike');

  // Lower priority cannot preempt higher active priority
  const rejected = emotion.transition(EMOTIONAL_STATES.AMUSED);
  assert.equal(rejected, false);
  assert.equal(emotion.currentState, EMOTIONAL_STATES.ALERT);

  // Forced transition works
  emotion.transition(EMOTIONAL_STATES.AMUSED, { force: true });
  assert.equal(emotion.currentState, EMOTIONAL_STATES.AMUSED);
  assert.equal(emotion.face, 'smug');
  assert.match(emotion.toneInstruction, /witty and teasing/i);

  // Event bus integration
  bus.emit('coding.agent.completed', { files: 2 }, 'agent');
  assert.equal(emotion.currentState, EMOTIONAL_STATES.EXCITED);
  assert.equal(emotion.face, 'laugh');

  bus.emit('coding.agent.failed', { error: 'test failed' }, 'agent');
  assert.equal(emotion.currentState, EMOTIONAL_STATES.FRUSTRATED);
  assert.equal(emotion.face, 'aside');

  bus.emit('coding.agent.waiting_for_permission', {}, 'agent');
  assert.equal(emotion.currentState, EMOTIONAL_STATES.ALERT);
  assert.equal(emotion.face, 'many');
});

// ----------------------------------------------------
// 3. DESKTOP CONTEXT ENGINE TESTS
// ----------------------------------------------------
test('desktop context engine tracks dev tools, projects and answers contextual queries', () => {
  const bus = new EventBus();
  const context = new DesktopContextEngine({ bus });

  // Simulate active state
  context.activeApp = { process: 'code', title: 'main.js - capri-desktop - Visual Studio Code', isDevTool: true };
  context.activeProject = 'capri-desktop';

  // Log a failed command
  context.logCommand('npm test', { exitCode: 1, output: 'SyntaxError: unexpected token', project: 'capri-desktop' });

  const summary = context.getContextSummary();
  assert.equal(summary.activeApp, 'code');
  assert.equal(summary.activeProject, 'capri-desktop');
  assert.equal(summary.isCoding, true);
  assert.equal(summary.lastFailedAction.command, 'npm test');

  // Query: "Em que estava a trabalhar?"
  const ansWork = context.query('Em que eu estava a trabalhar?');
  assert.match(ansWork, /capri-desktop/);

  // Query: "Porque falhou o build?"
  const ansFail = context.query('Porque falhou o comando?');
  assert.match(ansFail, /npm test/);
  assert.match(ansFail, /SyntaxError/);

  // Query: "Resume a sessão"
  const ansSummary = context.query('Resume a minha sessão');
  assert.match(ansSummary, /capri-desktop/);
});

// ----------------------------------------------------
// 4. OBSIDIAN MEMORY BRIDGE TESTS
// ----------------------------------------------------
test('obsidian memory bridge indexes real vault, searches with ranking and extracts lessons', async () => {
  // Use the real Obsidian vault already on disk
  const res = await obsidianBridge.indexAll();
  assert.equal(res.ok, true);
  assert.ok(res.filesIndexed > 500, `Expected > 500 files, found ${res.filesIndexed}`);

  const status = obsidianBridge.status();
  assert.ok(status.indexedFiles > 500);
  assert.ok(status.uniqueTokens > 5000);

  // Search keyword in user's vault
  const hits = obsidianBridge.search('aimbot silent');
  assert.ok(hits.length > 0);
  assert.ok(hits[0].title.toLowerCase().includes('aimbot') || hits[0].snippet.toLowerCase().includes('aimbot'));
  assert.ok(hits[0].relevance > 0);

  // Extract lessons
  const lessons = obsidianBridge.getLessons('script aimbot silent');
  assert.ok(lessons.length > 0);
  assert.ok(lessons.some((l) => /aimbot/i.test(l.title)));

  // Retrieve OpenCode sessions
  const sessions = obsidianBridge.getRecentSessions(3);
  assert.ok(sessions.length > 0);
  assert.ok(sessions[0].title);

  // Prompt context generation with safety bound
  const promptContext = obsidianBridge.getContextForPrompt('aimbot silent', 800);
  assert.ok(promptContext.includes('--- [Contexto recuperado do Obsidian Vault'));
  assert.ok(promptContext.length <= 1200);
});

// ----------------------------------------------------
// 5. MISSION ENGINE TESTS
// ----------------------------------------------------
test('mission engine executes tasks, handles dependencies, risk gating and pause/resume', async (t) => {
  const tempStorage = path.join(__dirname, 'test-missions.json');
  t.after(() => {
    try { fs.unlinkSync(tempStorage); } catch {}
  });

  const bus = new EventBus();
  const executed = [];

  const engine = new MissionEngine({
    bus,
    storageFile: tempStorage,
    tools: {
      searchStep: async (args) => {
        executed.push(`search:${args.query}`);
        return { hits: 2 };
      },
      writeStep: async (args) => {
        executed.push(`write:${args.file}`);
        return { written: true };
      },
    },
  });

  const mission = engine.createMission({
    title: 'Test Autonomous Mission',
    objective: 'Run two safe steps with dependency',
    tasks: [
      {
        id: 'step-1',
        description: 'First safe search',
        tool: 'searchStep',
        args: { query: 'cyberpunk' },
        risk: RISK_LEVELS.LOW,
      },
      {
        id: 'step-2',
        description: 'Second step dependent on first',
        tool: 'writeStep',
        args: { file: 'out.txt' },
        risk: RISK_LEVELS.LOW,
        dependencies: ['step-1'],
      },
    ],
  });

  assert.equal(mission.status, MISSION_STATES.RUNNING);

  // Wait for step execution
  await new Promise((r) => setTimeout(r, 600));

  const updated = engine.getMission(mission.id);
  assert.equal(updated.status, MISSION_STATES.COMPLETED);
  assert.equal(updated.tasks[0].status, TASK_STATES.COMPLETED);
  assert.equal(updated.tasks[1].status, TASK_STATES.COMPLETED);
  assert.deepEqual(executed, ['search:cyberpunk', 'write:out.txt']);
  assert.ok(updated.finalReport);
  assert.equal(updated.finalReport.completedTasks, 2);

  // Pause / Resume test
  const pausedMission = engine.createMission({
    title: 'Pausable Mission',
    objective: 'Testing pause/resume',
    tasks: [{ id: 'p1', description: 'Step P', tool: 'searchStep', args: { query: 'test' } }],
  });
  engine.pauseMission(pausedMission.id);
  assert.equal(engine.getMission(pausedMission.id).status, MISSION_STATES.PAUSED);

  engine.resumeMission(pausedMission.id);
  assert.equal(engine.getMission(pausedMission.id).status, MISSION_STATES.RUNNING);

  engine.cancelMission(pausedMission.id);
  assert.equal(engine.getMission(pausedMission.id).status, MISSION_STATES.CANCELLED);
});

test('mission engine rejects empty/cyclic plans and waits for plan approval', async (t) => {
  const tempStorage = path.join(__dirname, 'test-mission-approval.json');
  t.after(() => { try { fs.unlinkSync(tempStorage); } catch {} });
  const executed = [];
  const engine = new MissionEngine({
    bus: new EventBus(),
    storageFile: tempStorage,
    tools: { search: async ({ query }) => { executed.push(query); return { ok: true }; } },
  });

  assert.throws(() => engine.createMission({ objective: 'Research something', tasks: [] }), /executable task/i);
  assert.throws(() => engine.createMission({
    objective: 'Research something',
    tasks: [
      { id: 'a', tool: 'search', dependencies: ['b'] },
      { id: 'b', tool: 'search', dependencies: ['a'] },
    ],
  }), /cycle/i);

  const mission = engine.createMission({
    objective: 'Research Capri',
    approvalRequired: true,
    tasks: [{ id: 'a', description: 'Search Capri', tool: 'search', args: { query: 'Capri' } }],
  });
  assert.equal(mission.status, MISSION_STATES.AWAITING_APPROVAL);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.deepEqual(executed, []);
  assert.equal(engine.approveMission(mission.id), true);
  for (let i = 0; i < 10 && engine.getMission(mission.id).status !== MISSION_STATES.COMPLETED; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(engine.getMission(mission.id).status, MISSION_STATES.COMPLETED);
  assert.deepEqual(executed, ['Capri']);
});

// ----------------------------------------------------
// 6. MULTI-ASSISTANT GATEWAY TESTS
// ----------------------------------------------------
test('assistant gateway lists providers, distinguishes modes and formats transcripts', async () => {
  const gateway = new AssistantGateway();
  const assistants = await gateway.listAssistants();

  assert.ok(assistants.length >= 10);
  const openai = assistants.find((a) => a.id === 'openai');
  const claude = assistants.find((a) => a.id === 'claude');
  const brave = assistants.find((a) => a.id === 'brave-browser');

  assert.equal(openai.mode, INTEGRATION_MODES.API);
  assert.equal(claude.mode, INTEGRATION_MODES.CLI);
  assert.equal(brave.mode, INTEGRATION_MODES.BROWSER);

  // Persona presentation cleaning
  const formatted = gateway._formatAsCapri('<think>thinking details</think>Hello choom! [[music: lofi]]');
  assert.equal(formatted, 'Hello choom!');
});

// ----------------------------------------------------
// 7. INACTIVITY & RECONFIGURATION TESTS
// ----------------------------------------------------
test('emotion transitions on user inactivity/activity and obsidian bridge reconfigures', () => {
  const bus = new EventBus();
  const emotion = new EmotionEngine({ bus });

  // Inactivity transitions to sleepy
  bus.emit('desktop.user_inactive', { idleMs: 250000 });
  assert.equal(emotion.currentState, EMOTIONAL_STATES.SLEEPY);
  assert.equal(emotion.act, 'sleep');

  // Activity wakes her back to neutral
  bus.emit('desktop.user_active', { idleMs: 100 });
  assert.equal(emotion.currentState, EMOTIONAL_STATES.NEUTRAL);

  // Obsidian configure updates vault paths
  const bridge = new ObsidianMemoryBridge();
  bridge.configure({
    obsidianVaultPath: 'D:\\TestVault',
    obsidianSessionsDir: 'sessions',
    obsidianMemoryDir: 'mem',
  });
  assert.equal(bridge.paths.vault, 'D:\\TestVault');
  assert.equal(bridge.paths.sessions, path.join('D:\\TestVault', 'sessions'));
  assert.equal(bridge.paths.memory, path.join('D:\\TestVault', 'mem'));
});

// ----------------------------------------------------
// 8. VISION MODEL DETECTION TESTS
// ----------------------------------------------------
test('isVisionModel correctly identifies vision-capable provider+model combinations', () => {
  const { isVisionModel } = require('../src/main/llm');

  // Groq: only llava / llama-3.2-*-vision models support images
  assert.equal(isVisionModel('groq', 'llama-3.2-11b-vision-preview'), true, 'Groq llama-3.2-11b vision');
  assert.equal(isVisionModel('groq', 'llama-3.2-90b-vision-preview'), true, 'Groq llama-3.2-90b vision');
  assert.equal(isVisionModel('groq', 'qwen/qwen3.8-27b'), true, 'Groq Qwen 3.8 vision');
  assert.equal(isVisionModel('groq', 'qwen/qwen2.5-vl'), true, 'Groq Qwen VL vision');
  assert.equal(isVisionModel('groq', 'llama3-8b-8192'), false, 'Groq llama3-8b (no vision)');
  assert.equal(isVisionModel('groq', 'mixtral-8x7b-32768'), false, 'Groq mixtral (no vision)');

  // OpenAI: gpt-4o and gpt-4-turbo support vision; gpt-3.5 does not
  assert.equal(isVisionModel('openai', 'gpt-4o'), true, 'OpenAI gpt-4o vision');
  assert.equal(isVisionModel('openai', 'gpt-4o-mini'), true, 'OpenAI gpt-4o-mini vision');
  assert.equal(isVisionModel('openai', 'gpt-4-turbo'), true, 'OpenAI gpt-4-turbo vision');
  assert.equal(isVisionModel('openai', 'gpt-3.5-turbo'), false, 'OpenAI gpt-3.5-turbo (no vision)');

  // Gemini: all models support vision
  assert.equal(isVisionModel('gemini', 'gemini-2.0-flash'), true, 'Gemini flash vision');
  assert.equal(isVisionModel('gemini', 'gemini-1.5-pro'), true, 'Gemini pro vision');

  // DeepSeek: no vision support
  assert.equal(isVisionModel('deepseek', 'deepseek-chat'), false, 'DeepSeek (no vision)');

  // Claude CLI: never supports vision
  assert.equal(isVisionModel('claude', 'Claude Code'), false, 'Claude CLI (no vision)');

  // Ollama: vision depends on model name
  assert.equal(isVisionModel('ollama', 'llava:13b'), true, 'Ollama llava vision');
  assert.equal(isVisionModel('ollama', 'moondream'), true, 'Ollama moondream vision');
  assert.equal(isVisionModel('ollama', 'llama3'), false, 'Ollama llama3 (no vision)');
  assert.equal(isVisionModel('ollama', 'mistral'), false, 'Ollama mistral (no vision)');

  // OpenRouter: optimistic (always true — user chose it)
  assert.equal(isVisionModel('openrouter', 'any-model'), true, 'OpenRouter (optimistic)');

  // Custom: also optimistic
  assert.equal(isVisionModel('custom', 'my-server'), true, 'Custom (optimistic)');

  // Null / undefined guards
  assert.equal(isVisionModel(null, 'gpt-4o'), false, 'null provider');
  assert.equal(isVisionModel('openai', null), false, 'null model');
});

// ----------------------------------------------------
// 9. WEB SEARCH ENGINE TESTS
// ----------------------------------------------------
test('web search engine validates queries, protects SSRF and formats context', async () => {
  const { WebSearchEngine } = require('../src/main/web-search');
  const engine = new WebSearchEngine();

  // Empty query guard
  const empty = await engine.search('');
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.results, []);

  // SSRF guard
  const blockedLocal = await engine.fetchPage('http://localhost:8080/secret');
  assert.equal(blockedLocal.ok, false);
  assert.match(blockedLocal.error, /Endereço local não permitido/i);

  const blockedIp = await engine.fetchPage('http://127.0.0.1:3000');
  assert.equal(blockedIp.ok, false);
  assert.match(blockedIp.error, /Endereço local não permitido/i);

  const invalidProto = await engine.fetchPage('ftp://example.com/file');
  assert.equal(invalidProto.ok, false);
  assert.match(invalidProto.error, /Protocolo inválido/i);

  // Formatting context
  const mockResults = [
    { title: 'Cyberpunk 2077', url: 'https://example.com/cp2077', snippet: 'RPG set in Night City.' },
  ];
  const context = engine.formatContext('Cyberpunk', mockResults);
  assert.ok(context.includes('Resultados de pesquisa na internet'));
  assert.ok(context.includes('Cyberpunk 2077'));
  assert.ok(context.includes('RPG set in Night City.'));
});

test('web search ranks title/snippet matches above provider-order noise', async () => {
  const { WebSearchEngine } = require('../src/main/web-search');
  const engine = new WebSearchEngine({ timeout: 100 });
  engine.searchBrave = async () => [
    { title: 'Unrelated desktop wallpaper', url: 'https://example.com/wallpaper', snippet: 'A collection of backgrounds.' },
  ];
  engine.searchDuckDuckGoLite = async () => [
    { title: 'Capri Desktop: setup and voice', url: 'https://docs.example.com/capri', snippet: 'Configure Capri Desktop voice and tools.' },
  ];
  engine.searchDuckDuckGoHtml = async () => [];

  const result = await engine.search('Capri desktop voice');
  assert.equal(result.ok, true);
  assert.equal(result.results[0].title, 'Capri Desktop: setup and voice');
});
