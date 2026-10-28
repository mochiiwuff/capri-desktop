'use strict';

/**
 * Capri Desktop Context Engine
 * Tracks active foreground window, processes, dev tools (VS Code, terminals),
 * projects, recent events, and provides searchable contextual memory.
 */

const { globalBus } = require('../shared/events');
const apps = require('./apps');

const DEV_TOOL_PROCESSES = new Set([
  'code', 'code - oss', 'codium', 'cursor', 'windsurf', 'devenv',
  'windowsterminal', 'powershell', 'pwsh', 'cmd', 'bash', 'wsl',
  'wt', 'alacritty', 'wezterm', 'hyper', 'mintty', 'idea64', 'pycharm64',
]);

const BROWSER_PROCESSES = new Set([
  'brave', 'chrome', 'msedge', 'firefox', 'opera', 'vivaldi',
]);

const KNOWN_GAME_PROCESSES = new Set([
  'steam', 'steamwebhelper', 'epicgameslauncher', 'brawlhalla',
  'robloxplayerbeta', 'minecraft', 'javaw', 'valorant', 'csgo', 'cs2',
  'rocketleague', 'fortniteclient-win64-shipping', 'leagueclient',
]);

class DesktopContextEngine {
  constructor(options = {}) {
    this.bus = options.bus || globalBus;
    this.mode = options.mode || 'normal'; // 'quiet', 'normal', 'chatty'
    this.history = [];
    this.maxHistory = 100;
    this.activeWindow = null;
    this.activeProject = null;
    this.activeApp = null;
    this.lastPolled = 0;
    this.pollIntervalMs = 2500;
    this._pollTimer = null;
    this._cooldowns = new Map();
    this.isInactive = false;
  }

  start(powerMonitor = null) {
    this.powerMonitor = powerMonitor || this.powerMonitor;
    if (this._pollTimer) return;
    // Check user inactivity efficiently every 10 seconds via native powerMonitor (0% CPU, no processes)
    this._pollTimer = setInterval(() => {
      this.checkIdle();
    }, 10000);
    this.checkIdle();
  }

  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  setMode(mode) {
    if (['quiet', 'normal', 'chatty'].includes(mode)) {
      this.mode = mode;
    }
  }

  checkIdle() {
    if (!this.powerMonitor || typeof this.powerMonitor.getSystemIdleTime !== 'function') return;
    try {
      const idleSec = this.powerMonitor.getSystemIdleTime();
      const idleMs = idleSec * 1000;
      const idleLimitMs = 240000; // 4 minutes
      if (idleMs >= idleLimitMs && !this.isInactive) {
        this.isInactive = true;
        this._recordEvent('desktop.user_inactive', { idleMs });
      } else if (idleMs < 10000 && this.isInactive) {
        this.isInactive = false;
        this._recordEvent('desktop.user_active', { idleMs });
      }
    } catch {
      // Ignore idle check errors
    }
  }

  /**
   * Event-driven window updates fed directly by windows.js / windows.ps1.
   * Completely eliminates background PowerShell process spawning.
   */
  handleWindowUpdate(data) {
    if (!data) return null;
    const processName = String(data.fgProc || '').toLowerCase().trim();
    const title = String(data.fgTitle || '').trim();
    if (!processName && !title) return null;

    const isDevTool = DEV_TOOL_PROCESSES.has(processName);
    const isBrowser = BROWSER_PROCESSES.has(processName);
    const isGame = KNOWN_GAME_PROCESSES.has(processName);
    const project = this._extractProject(title, processName);

    const snapshot = {
      process: processName,
      title,
      isDevTool,
      isBrowser,
      isGame,
      project,
      timestamp: Date.now(),
    };

    const changed = !this.activeApp ||
      this.activeApp.process !== snapshot.process ||
      this.activeApp.title !== snapshot.title;

    if (changed) {
      const prev = this.activeApp;
      this.activeApp = snapshot;
      this.activeProject = project || this.activeProject;

      this._recordEvent('application.focus_changed', {
        previous: prev ? prev.process : null,
        current: snapshot.process,
        title: snapshot.title,
        isDevTool,
        project,
      });

      if (project && (!prev || prev.project !== project)) {
        this._recordEvent('project.detected', { project, process: snapshot.process });
      }
    }

    return snapshot;
  }

  async poll() {
    this.checkIdle();
    return this.activeApp;
  }

  _extractProject(title, process) {
    if (!title) return null;
    if (process.includes('code') || process.includes('cursor') || process.includes('windsurf')) {
      // Formats: "file.js - ProjectName - Visual Studio Code" or "ProjectName - Visual Studio Code"
      const parts = title.split(' - ');
      if (parts.length >= 3) {
        return parts[parts.length - 2].trim();
      } else if (parts.length === 2 && !parts[0].includes('.')) {
        return parts[0].trim();
      }
    }
    // Terminal titles e.g. "Administrator: Windows PowerShell - npm start"
    return null;
  }

  _recordEvent(type, data = {}, source = 'desktop-context') {
    const entry = {
      type,
      data,
      source,
      timestamp: Date.now(),
    };

    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.bus.emit(type, data, source);
  }

  /**
   * Log command/build executions from hooks or terminals
   */
  logCommand(cmd, { exitCode = 0, output = '', project = null } = {}) {
    const succeeded = exitCode === 0;
    const type = succeeded ? 'terminal.command_completed' : 'terminal.command_failed';
    this._recordEvent(type, {
      command: cmd,
      exitCode,
      errorSnippet: succeeded ? null : output.slice(-500),
      project: project || this.activeProject,
    });
  }

  /**
   * Get structured context summary for AI chat / brain
   */
  getContextSummary() {
    const recent = this.history.slice(-10);
    const lastFailed = [...this.history].reverse().find((e) => (
      e.type === 'terminal.command_failed' || e.type === 'coding.agent.failed'
    ));

    return {
      activeApp: this.activeApp?.process || 'unknown',
      activeTitle: this.activeApp?.title || '',
      activeProject: this.activeProject || null,
      isCoding: Boolean(this.activeApp?.isDevTool),
      lastFailedAction: lastFailed ? lastFailed.data : null,
      recentEvents: recent.map((e) => ({
        type: e.type,
        time: new Date(e.timestamp).toLocaleTimeString(),
        detail: e.data,
      })),
    };
  }

  /**
   * Answer natural questions about recent desktop context
   */
  query(question) {
    const q = String(question || '').toLowerCase();

    // "Em que estava a trabalhar?" / "what was I working on?"
    if (/em que (?:eu )?(?:estava|tava) (?:a )?trabalhar|what was i working on/i.test(q)) {
      if (this.activeProject) {
        return `Estavas a trabalhar no projeto **${this.activeProject}**${this.activeApp ? ` no **${this.activeApp.process}**` : ''}.`;
      }
      return 'Nenhum projeto específico detectado recentemente.';
    }

    // "Porque falhou o build / comando?" / "why did it fail?"
    if (/por que|porque.*(?:falhou|deu erro|o build|comando)|why did.*fail/i.test(q)) {
      const lastFailed = [...this.history].reverse().find((e) => (
        e.type === 'terminal.command_failed' || e.type === 'coding.agent.failed'
      ));
      if (lastFailed) {
        const cmd = lastFailed.data.command || 'uma operação anterior';
        const err = lastFailed.data.errorSnippet || `exit code ${lastFailed.data.exitCode}`;
        return `O comando \`${cmd}\` falhou com: ${err}.`;
      }
      return 'Não encontrei nenhum erro ou build falhado recente no meu registo.';
    }

    // "Resume a minha sessão" / "O que aconteceu desde a última vez?"
    if (/resume.*sess[aã]o|o que aconteceu|what happened/i.test(q)) {
      if (this.history.length === 0) {
        return 'Ainda não tenho eventos recentes registados na sessão atual.';
      }
      const count = this.history.length;
      const projects = [...new Set(this.history.map((h) => h.data?.project).filter(Boolean))];
      return `Registámos ${count} eventos recentes${projects.length ? ` envolvendo o(s) projeto(s): ${projects.join(', ')}` : ''}. Aplicação ativa atual: ${this.activeApp?.process || 'desktop'}.`;
    }

    return null;
  }
}

const desktopContext = new DesktopContextEngine();

module.exports = {
  DesktopContextEngine,
  desktopContext,
};
