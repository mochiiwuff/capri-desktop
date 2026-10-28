'use strict';

/**
 * Capri Multi-Assistant Gateway
 * Provides a unified abstraction layer across:
 * - API-based models (OpenAI, Claude/Anthropic, Gemini, Ollama, Groq, OpenRouter, DeepSeek)
 * - CLI-based agents (Claude Code, Codex, OpenCode)
 * - Browser-based sessions (Brave extension)
 * - Exported chat transcript import
 * Enables multi-assistant comparison, query forwarding, and keeps Capri's personality distinct.
 */

const fs = require('node:fs');
const llm = require('./llm');
const config = require('./config');

const INTEGRATION_MODES = Object.freeze({
  API: 'api',           // Direct model API call (OpenAI, Anthropic, Gemini, Ollama...)
  CLI: 'cli',           // CLI-driven coding agent (claude -p, etc.)
  BROWSER: 'browser',   // Web navigation session in Brave
  EXPORT: 'export',     // Offline imported chat transcripts
});

class AssistantGateway {
  constructor(options = {}) {
    this.history = [];
    this.maxHistory = 50;
  }

  /**
   * List available assistants and their capabilities
   */
  async listAssistants() {
    const cfg = config.load();
    const providers = Object.entries(llm.PROVIDERS).map(([id, p]) => {
      const mode = p.kind === 'claude' ? INTEGRATION_MODES.CLI : INTEGRATION_MODES.API;
      const isConfigured = Boolean(
        p.local ||
        id === 'pollinations' ||
        cfg.apiKeys?.[id] ||
        (p.env && process.env[p.env]) ||
        (id === 'custom' && cfg.customUrl)
      );

      return {
        id,
        name: p.label,
        mode,
        isLocal: Boolean(p.local),
        isConfigured,
        capabilities: {
          streaming: true,
          vision: p.kind !== 'claude',
          tools: p.kind === 'claude',
        },
      };
    });

    // Add Browser Agent
    providers.push({
      id: 'brave-browser',
      name: 'Brave Browser Session',
      mode: INTEGRATION_MODES.BROWSER,
      isLocal: true,
      isConfigured: true,
      capabilities: {
        streaming: false,
        vision: false,
        tools: true,
      },
    });

    return providers;
  }

  /**
   * Unified send method
   */
  async send({ provider = null, model = null, messages = [], image = null, onDelta = null, signal = null }) {
    const cfg = config.load();
    const activeProvider = provider || cfg.provider;
    const abort = signal || new AbortController().signal;

    const reqRecord = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      provider: activeProvider,
      model,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.history.push(reqRecord);
    if (this.history.length > this.maxHistory) this.history.shift();

    try {
      // Ensure API keys are decrypted
      const setup = require('./setup');
      const decryptedCfg = { ...cfg, apiKeys: setup.openKeys(cfg.apiKeys) };

      const reply = await llm.chat(
        activeProvider,
        decryptedCfg,
        { model, messages, image },
        onDelta || (() => {}),
        abort
      );

      reqRecord.status = 'completed';
      reqRecord.durationMs = Date.now() - reqRecord.timestamp;

      return {
        ok: true,
        provider: activeProvider,
        model: model || 'default',
        rawText: reply,
        // Capri's persona presentation wrapper
        capriPresentation: this._formatAsCapri(reply),
      };
    } catch (err) {
      reqRecord.status = 'failed';
      reqRecord.error = err.message;
      return {
        ok: false,
        provider: activeProvider,
        error: err.message,
        code: err.code || null,
      };
    }
  }

  /**
   * Run comparison / second opinion between two assistants
   */
  async compare({ query, providers = ['gemini', 'openai'], context = '' }) {
    const messages = [
      { role: 'system', content: 'You are a technical advisor. Provide a concise, direct analysis.' },
      ...(context ? [{ role: 'user', content: `Context:\n${context}` }] : []),
      { role: 'user', content: query },
    ];

    const results = await Promise.allSettled(
      providers.map((p) => this.send({ provider: p, messages }))
    );

    const comparisons = providers.map((p, i) => {
      const res = results[i];
      if (res.status === 'fulfilled' && res.value.ok) {
        return {
          provider: p,
          ok: true,
          response: res.value.rawText,
        };
      }
      return {
        provider: p,
        ok: false,
        error: res.status === 'rejected' ? res.reason.message : res.value.error,
      };
    });

    return {
      query,
      comparisons,
      timestamp: Date.now(),
    };
  }

  /**
   * Import an offline chat transcript (JSON or Markdown)
   */
  importTranscript(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

    if (ext === '.json') {
      try {
        const parsed = JSON.parse(content);
        return {
          ok: true,
          type: 'json',
          turns: Array.isArray(parsed) ? parsed.length : parsed.messages ? parsed.messages.length : 1,
          preview: JSON.stringify(parsed).slice(0, 300),
        };
      } catch (err) {
        throw new Error(`Invalid JSON transcript: ${err.message}`);
      }
    } else {
      // Markdown lines
      const turns = content.split(/^#+\s+/m).filter(Boolean);
      return {
        ok: true,
        type: 'markdown',
        turns: turns.length,
        preview: content.slice(0, 300),
      };
    }
  }

  _formatAsCapri(rawText) {
    // Strip reasoning tags
    return String(rawText || '')
      .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
      .replace(/\[\[[^\]]*(\]\]|$)/g, '')
      .trim();
  }
}

const assistantGateway = new AssistantGateway();

module.exports = {
  INTEGRATION_MODES,
  AssistantGateway,
  assistantGateway,
};
