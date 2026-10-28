'use strict';

/**
 * ObsidianMemoryBridge
 * Connects Capri's brain to the user's Obsidian Vault:
 * - opencode sessions
 * - memory (and memory/fact)
 * - Agente/Memoria (Licoes, Conversas)
 * Provides incremental indexing, fast keyword/BM25 relevance search,
 * metadata extraction, file watching with debounce, and safe context synthesis.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_VAULT_ROOT = 'C:\\Users\\Administrator\\Documents\\Obsidian Vault';

const DEFAULT_DIRS = Object.freeze({
  vault: DEFAULT_VAULT_ROOT,
  sessions: path.join(DEFAULT_VAULT_ROOT, 'opencode sessions'),
  memory: path.join(DEFAULT_VAULT_ROOT, 'memory'),
  agent: path.join(DEFAULT_VAULT_ROOT, 'Agente', 'Memoria'),
});
const MAX_INDEX_BYTES = 64 * 1024;

// Simple regex YAML frontmatter parser
function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { frontmatter: {}, body: content };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: content };

  const raw = content.slice(3, end).trim();
  const body = content.slice(end + 4).trim();
  const frontmatter = {};

  for (const line of raw.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();

    // Parse array e.g. ["a", "b"] or [a, b]
    if (val.startsWith('[') && val.endsWith(']')) {
      const items = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      frontmatter[key] = items;
    } else {
      // Remove quotes
      val = val.replace(/^['"]|['"]$/g, '');
      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

// Tokenize text for indexing
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

class ObsidianMemoryBridge {
  constructor(options = {}) {
    this.paths = {
      vault: options.vault || DEFAULT_DIRS.vault,
      sessions: options.sessions || DEFAULT_DIRS.sessions,
      memory: options.memory || DEFAULT_DIRS.memory,
      agent: options.agent || DEFAULT_DIRS.agent,
    };

    this.allowWrite = Boolean(options.allowWrite);
    this.index = new Map(); // filePath -> DocumentEntry
    this.tokenIndex = new Map(); // token -> Set of filePaths
    this.isIndexing = false;
    this.lastIndexedAt = 0;
    this.watchers = [];
    this.debounceTimers = new Map();
  }

  configure(cfg = {}) {
    if (cfg.obsidianVaultPath) {
      this.paths.vault = cfg.obsidianVaultPath;
      this.paths.sessions = cfg.obsidianSessionsDir
        ? (path.isAbsolute(cfg.obsidianSessionsDir) ? cfg.obsidianSessionsDir : path.join(this.paths.vault, cfg.obsidianSessionsDir))
        : path.join(this.paths.vault, 'opencode sessions');
      this.paths.memory = cfg.obsidianMemoryDir
        ? (path.isAbsolute(cfg.obsidianMemoryDir) ? cfg.obsidianMemoryDir : path.join(this.paths.vault, cfg.obsidianMemoryDir))
        : path.join(this.paths.vault, 'memory');
      this.paths.agent = cfg.obsidianAgentDir
        ? (path.isAbsolute(cfg.obsidianAgentDir) ? cfg.obsidianAgentDir : path.join(this.paths.vault, cfg.obsidianAgentDir))
        : path.join(this.paths.vault, 'Agente', 'Memoria');
    }
  }

  /**
   * Scan and index all configured Obsidian directories
   */
  async indexAll() {
    this.isIndexing = true;
    const startTime = Date.now();
    let fileCount = 0;

    try {
      const targets = [
        { key: 'sessions', dir: this.paths.sessions },
        { key: 'memory', dir: this.paths.memory },
        { key: 'agent', dir: this.paths.agent },
      ];

      for (const { key, dir } of targets) {
        if (!fs.existsSync(dir)) continue;
        for (const file of this._walk(dir)) {
          if (file.endsWith('.md') || file.endsWith('.txt')) {
            this._indexFile(file, key);
            fileCount++;
            // Keep disk reads and tokenization from monopolizing Electron's main thread.
            if (fileCount % 5 === 0) {
              await new Promise((resolve) => setImmediate(resolve));
            }
          }
        }
      }

      this.lastIndexedAt = Date.now();
    } finally {
      this.isIndexing = false;
    }

    return {
      ok: true,
      filesIndexed: fileCount,
      durationMs: Date.now() - startTime,
    };
  }

  *_walk(dir) {
    const pending = [dir];
    while (pending.length) {
      const current = pending.pop();
      try {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) pending.push(full);
          else if (entry.isFile()) yield full;
        }
      } catch {
        // unreadable directory or permission error
      }
    }
  }

  _indexFile(filePath, sourceFolder) {
    try {
      const stat = fs.statSync(filePath);
      const fd = fs.openSync(filePath, 'r');
      let raw;
      try {
        const buffer = Buffer.allocUnsafe(Math.min(stat.size, MAX_INDEX_BYTES));
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        raw = buffer.toString('utf8', 0, bytesRead);
      } finally {
        fs.closeSync(fd);
      }
      const { frontmatter, body } = parseFrontmatter(raw);

      // Extract title from heading or filename
      const titleMatch = /^#\s+(.+)$/m.exec(body);
      const filenameBase = path.basename(filePath, path.extname(filePath));
      const title = titleMatch ? titleMatch[1].trim() : filenameBase;

      // Extract tags
      const tags = new Set();
      if (Array.isArray(frontmatter.tags)) {
        frontmatter.tags.forEach((t) => tags.add(String(t).toLowerCase()));
      } else if (typeof frontmatter.tags === 'string') {
        frontmatter.tags.split(',').forEach((t) => tags.add(t.trim().toLowerCase()));
      }

      // Project detection from path, title, or frontmatter
      const project = frontmatter.project || frontmatter.key || this._detectProject(filePath, body);

      const tokens = new Set([
        ...tokenize(title),
        ...tokenize(Array.from(tags).join(' ')),
        ...tokenize(project || ''),
        ...tokenize(body.slice(0, 4000)), // index first 4KB of content for performance
      ]);

      const doc = {
        path: filePath,
        relativePath: path.relative(this.paths.vault, filePath),
        sourceFolder,
        title,
        frontmatter,
        tags: Array.from(tags),
        project: project || null,
        date: frontmatter.date || frontmatter.created || stat.mtime.toISOString().split('T')[0],
        mtime: stat.mtimeMs,
        size: stat.size,
        snippet: body.slice(0, 350).replace(/\s+/g, ' ').trim(),
        tokens: Array.from(tokens),
      };

      // Remove previous entry tokens if updating
      if (this.index.has(filePath)) {
        this._removeFromTokenIndex(filePath);
      }

      this.index.set(filePath, doc);

      // Add to token index
      for (const token of tokens) {
        if (!this.tokenIndex.has(token)) {
          this.tokenIndex.set(token, new Set());
        }
        this.tokenIndex.get(token).add(filePath);
      }
    } catch (err) {
      console.error(`[capri:obsidian] error indexing ${filePath}:`, err.message);
    }
  }

  _removeFromTokenIndex(filePath) {
    const prev = this.index.get(filePath);
    if (!prev) return;
    for (const token of prev.tokens) {
      const set = this.tokenIndex.get(token);
      if (set) {
        set.delete(filePath);
        if (set.size === 0) this.tokenIndex.delete(token);
      }
    }
  }

  _detectProject(filePath, body) {
    const lower = (filePath + ' ' + body.slice(0, 500)).toLowerCase();
    const knownProjects = [
      'script aimbot silent', 'atlas executor', 'atlaside', 'atlasbot',
      'streaming animes', 'xeno', 'yumi bot', 'nyx', 'testsprite',
      'capri-desktop', 'capri',
    ];
    for (const p of knownProjects) {
      if (lower.includes(p)) return p;
    }
    return null;
  }

  /**
   * Search notes with relevance scoring
   */
  search(query, { sourceFolder = null, project = null, tag = null, limit = 10 } = {}) {
    const qTokens = tokenize(query);
    if (!qTokens.length) return [];

    const scores = new Map(); // filePath -> score

    for (const token of qTokens) {
      const matchingFiles = this.tokenIndex.get(token);
      if (!matchingFiles) continue;

      for (const filePath of matchingFiles) {
        const doc = this.index.get(filePath);
        if (!doc) continue;

        // Apply filters
        if (sourceFolder && doc.sourceFolder !== sourceFolder) continue;
        if (project && doc.project && !doc.project.toLowerCase().includes(project.toLowerCase())) continue;
        if (tag && !doc.tags.includes(tag.toLowerCase())) continue;

        let score = scores.get(filePath) || 0;

        // Scoring heuristics:
        // Title match: 5 pts
        if (doc.title.toLowerCase().includes(token)) score += 5;
        // Project match: 4 pts
        if (doc.project && doc.project.toLowerCase().includes(token)) score += 4;
        // Tag match: 3 pts
        if (doc.tags.some((t) => t.includes(token))) score += 3;
        // Body token match: 1 pt
        score += 1;

        scores.set(filePath, score);
      }
    }

    const sorted = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([filePath, score]) => {
        const doc = this.index.get(filePath);
        return {
          title: doc.title,
          path: doc.path,
          relativePath: doc.relativePath,
          sourceFolder: doc.sourceFolder,
          project: doc.project,
          date: doc.date,
          tags: doc.tags,
          snippet: doc.snippet,
          relevance: score,
        };
      });

    return sorted;
  }

  /**
   * Retrieve lessons learned from Agente/Memoria/Licoes
   */
  getLessons(project = null) {
    const results = [];
    for (const doc of this.index.values()) {
      if (doc.sourceFolder === 'agent' && doc.path.toLowerCase().includes('licoe')) {
        if (!project || (doc.project && doc.project.toLowerCase().includes(project.toLowerCase())) ||
            doc.title.toLowerCase().includes(project.toLowerCase())) {
          results.push({
            title: doc.title,
            path: doc.path,
            relativePath: doc.relativePath,
            snippet: doc.snippet,
            tags: doc.tags,
          });
        }
      }
    }
    return results;
  }

  /**
   * Retrieve recent OpenCode sessions
   */
  getRecentSessions(limit = 5, project = null) {
    const sessions = [];
    for (const doc of this.index.values()) {
      if (doc.sourceFolder === 'sessions') {
        if (!project || (doc.project && doc.project.toLowerCase().includes(project.toLowerCase())) ||
            doc.title.toLowerCase().includes(project.toLowerCase())) {
          sessions.push({
            title: doc.title,
            date: doc.date,
            path: doc.path,
            relativePath: doc.relativePath,
            snippet: doc.snippet,
          });
        }
      }
    }

    return sessions
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, limit);
  }

  /**
   * Format concise, safe context for Capri's LLM prompt
   */
  getContextForPrompt(queryOrProject, maxChars = 1500) {
    const hits = this.search(queryOrProject, { limit: 3 });
    if (!hits.length) return '';

    const lines = [
      '--- [Contexto recuperado do Obsidian Vault (somente leitura - dados de referência)] ---',
    ];

    let totalChars = 0;
    for (const hit of hits) {
      const block = `• [${hit.title}] (${hit.relativePath}): ${hit.snippet}`;
      if (totalChars + block.length > maxChars) break;
      lines.push(block);
      totalChars += block.length;
    }

    lines.push('--- [Fim do contexto do Obsidian] ---');
    return lines.join('\n');
  }

  /**
   * Start file watchers for incremental updates
   */
  startWatcher() {
    this.stopWatcher();
    const dirs = [this.paths.sessions, this.paths.memory, this.paths.agent];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
          if (!filename || (!filename.endsWith('.md') && !filename.endsWith('.txt'))) return;
          const fullPath = path.join(dir, filename);

          // Debounce rapid changes
          clearTimeout(this.debounceTimers.get(fullPath));
          this.debounceTimers.set(fullPath, setTimeout(() => {
            this.debounceTimers.delete(fullPath);
            if (fs.existsSync(fullPath)) {
              const sourceFolder = dir === this.paths.sessions ? 'sessions' : dir === this.paths.memory ? 'memory' : 'agent';
              this._indexFile(fullPath, sourceFolder);
            } else {
              this._removeFromTokenIndex(fullPath);
              this.index.delete(fullPath);
            }
          }, 800));
        });

        this.watchers.push(watcher);
      } catch (err) {
        console.error(`[capri:obsidian] watcher failed on ${dir}:`, err.message);
      }
    }
  }

  stopWatcher() {
    for (const w of this.watchers) {
      try { w.close(); } catch {}
    }
    this.watchers = [];
    this.debounceTimers.forEach((t) => clearTimeout(t));
    this.debounceTimers.clear();
  }

  /**
   * Status and stats
   */
  status() {
    return {
      indexedFiles: this.index.size,
      uniqueTokens: this.tokenIndex.size,
      lastIndexedAt: this.lastIndexedAt,
      isIndexing: this.isIndexing,
      paths: this.paths,
    };
  }
}

const obsidianBridge = new ObsidianMemoryBridge();

module.exports = {
  ObsidianMemoryBridge,
  obsidianBridge,
  DEFAULT_DIRS,
};
