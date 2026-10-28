'use strict';

/**
 * Capri Typed Event Bus
 * Centralized, typed event hub with correlation IDs, deduplication, and subscriber cleanup.
 */

const EVENT_TYPES = Object.freeze([
  'application.focus_changed',
  'application.opened',
  'application.closed',
  'project.detected',
  'terminal.command_started',
  'terminal.command_completed',
  'terminal.command_failed',
  'coding.agent.started',
  'coding.agent.waiting_for_permission',
  'coding.agent.completed',
  'coding.agent.failed',
  'mission.started',
  'mission.progress',
  'mission.completed',
  'mission.failed',
  'memory.context_retrieved',
  'desktop.user_inactive',
  'emotion.changed',
  'browser.action_dispatched',
  'browser.action_completed',
]);

class EventBus {
  constructor() {
    this._listeners = new Map();
    this._recentEvents = [];
    this._maxRecent = 100;
    this._dedupWindowMs = 250;
  }

  /**
   * Subscribe to a typed event or pattern (e.g. 'coding.agent.*' or '*')
   * Returns an unsubscribe function.
   */
  on(type, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Event callback must be a function');
    }
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    const set = this._listeners.get(type);
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this._listeners.delete(type);
      }
    };
  }

  /**
   * Subscribe to a single event occurrence.
   */
  once(type, callback) {
    const unsub = this.on(type, (evt) => {
      unsub();
      callback(evt);
    });
    return unsub;
  }

  /**
   * Publish an event with metadata and deduplication.
   */
  emit(type, data = {}, source = 'system', correlationId = null) {
    const timestamp = Date.now();
    const event = {
      type,
      data,
      source,
      correlationId: correlationId || `evt-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp,
    };

    // Deduplication check for identical events within window
    const isDuplicate = this._recentEvents.some((recent) => (
      recent.type === event.type &&
      recent.source === event.source &&
      timestamp - recent.timestamp < this._dedupWindowMs &&
      JSON.stringify(recent.data) === JSON.stringify(event.data)
    ));

    if (isDuplicate) {
      return false;
    }

    this._recentEvents.push(event);
    if (this._recentEvents.length > this._maxRecent) {
      this._recentEvents.shift();
    }

    // Direct listeners
    const direct = this._listeners.get(type);
    if (direct) {
      for (const fn of direct) {
        try {
          fn(event);
        } catch (err) {
          console.error(`[capri:events] error in listener for ${type}:`, err);
        }
      }
    }

    // Wildcard listeners (e.g. 'mission.*' or '*')
    for (const [pattern, set] of this._listeners.entries()) {
      if (pattern === '*' || (pattern.endsWith('.*') && type.startsWith(pattern.slice(0, -2)))) {
        for (const fn of set) {
          try {
            fn(event);
          } catch (err) {
            console.error(`[capri:events] error in wildcard listener for ${pattern}:`, err);
          }
        }
      }
    }

    return true;
  }

  /**
   * Get recent events matching an optional filter.
   */
  getRecent(filter = null) {
    if (!filter) return [...this._recentEvents];
    return this._recentEvents.filter((e) => {
      if (typeof filter === 'string') return e.type === filter || e.type.startsWith(filter);
      if (typeof filter === 'function') return filter(e);
      return true;
    });
  }

  clear() {
    this._listeners.clear();
    this._recentEvents = [];
  }
}

// Global shared bus instance
const globalBus = new EventBus();

module.exports = {
  EVENT_TYPES,
  EventBus,
  globalBus,
};
