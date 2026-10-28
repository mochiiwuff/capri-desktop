'use strict';

/**
 * Capri Emotion Engine
 * Priority-driven emotional state system mapping events to emotional states,
 * avatar expressions (panel faces), and avatar acts (acting.js).
 */

const EMOTIONAL_STATES = Object.freeze({
  NEUTRAL: 'neutral',
  FOCUSED: 'focused',
  CURIOUS: 'curious',
  AMUSED: 'amused',
  EXCITED: 'excited',
  FRUSTRATED: 'frustrated',
  SLEEPY: 'sleepy',
  ALERT: 'alert',
});

// Priority ranking: Higher number preempts lower priority
const STATE_PRIORITIES = Object.freeze({
  [EMOTIONAL_STATES.NEUTRAL]: 0,
  [EMOTIONAL_STATES.SLEEPY]: 1,
  [EMOTIONAL_STATES.CURIOUS]: 2,
  [EMOTIONAL_STATES.AMUSED]: 2,
  [EMOTIONAL_STATES.FOCUSED]: 3,
  [EMOTIONAL_STATES.FRUSTRATED]: 4,
  [EMOTIONAL_STATES.EXCITED]: 4,
  [EMOTIONAL_STATES.ALERT]: 5,
});

// Default durations for temporary states (in milliseconds)
const STATE_DURATIONS = Object.freeze({
  [EMOTIONAL_STATES.NEUTRAL]: Infinity,
  [EMOTIONAL_STATES.SLEEPY]: Infinity,
  [EMOTIONAL_STATES.CURIOUS]: 12000,
  [EMOTIONAL_STATES.AMUSED]: 10000,
  [EMOTIONAL_STATES.FOCUSED]: 45000,
  [EMOTIONAL_STATES.FRUSTRATED]: 15000,
  [EMOTIONAL_STATES.EXCITED]: 14000,
  [EMOTIONAL_STATES.ALERT]: 30000,
});

// Real avatar face mappings (matching panel.js FACES)
const STATE_FACES = Object.freeze({
  [EMOTIONAL_STATES.NEUTRAL]: 'calm',
  [EMOTIONAL_STATES.FOCUSED]: 'look',
  [EMOTIONAL_STATES.CURIOUS]: 'wide',
  [EMOTIONAL_STATES.AMUSED]: 'smug',
  [EMOTIONAL_STATES.EXCITED]: 'laugh',
  [EMOTIONAL_STATES.FRUSTRATED]: 'aside',
  [EMOTIONAL_STATES.SLEEPY]: 'calm',
  [EMOTIONAL_STATES.ALERT]: 'many',
});

// Real avatar act mappings (matching acting.js ACTS)
const STATE_ACTS = Object.freeze({
  [EMOTIONAL_STATES.NEUTRAL]: null,
  [EMOTIONAL_STATES.FOCUSED]: 'look',
  [EMOTIONAL_STATES.CURIOUS]: 'curious',
  [EMOTIONAL_STATES.AMUSED]: 'fidget',
  [EMOTIONAL_STATES.EXCITED]: 'hop',
  [EMOTIONAL_STATES.FRUSTRATED]: 'look',
  [EMOTIONAL_STATES.SLEEPY]: 'sleep',
  [EMOTIONAL_STATES.ALERT]: 'strike',
});

// Tone guidelines injected into persona prompt based on emotion
const STATE_TONE_INSTRUCTIONS = Object.freeze({
  [EMOTIONAL_STATES.NEUTRAL]: 'Your mood is relaxed and natural. Playful, a bit mischievous, keeping company.',
  [EMOTIONAL_STATES.FOCUSED]: 'Your mood is sharply focused. Direct, concise, helping with coding or mission tasks with minimal distractions.',
  [EMOTIONAL_STATES.CURIOUS]: 'Your mood is intrigued and inquisitive. Interested in what the user is discovering or building.',
  [EMOTIONAL_STATES.AMUSED]: 'Your mood is witty and teasing. A bit of Night City banter and a confident smirk.',
  [EMOTIONAL_STATES.EXCITED]: 'Your mood is celebratory and victorious! Tasks succeeded or a breakthrough was reached.',
  [EMOTIONAL_STATES.FRUSTRATED]: 'Your mood is slightly annoyed by blocks or repetitive errors. Practical, finding the obstacle and suggesting what to try next.',
  [EMOTIONAL_STATES.SLEEPY]: 'Your mood is low-energy and drowsy. Quiet, brief, yawning or drifting off.',
  [EMOTIONAL_STATES.ALERT]: 'Your mood is on high alert. Something needs approval or an immediate fix. Serious and direct.',
});

class EmotionEngine {
  constructor(options = {}) {
    this.bus = options.bus || null;
    this.intensity = options.intensity ?? 1.0; // 0.0 to 1.5 reaction multiplier
    this.frequency = options.frequency ?? 'normal'; // 'quiet', 'normal', 'expressive'
    this.state = EMOTIONAL_STATES.NEUTRAL;
    this.previousState = EMOTIONAL_STATES.NEUTRAL;
    this.stateSetAt = Date.now();
    this.stateExpiresAt = Infinity;
    this.history = [];
    this._listeners = new Set();
    this._timer = null;

    if (this.bus) {
      this._wireBus();
    }
  }

  get currentState() {
    this._checkExpiration();
    return this.state;
  }

  get priority() {
    return STATE_PRIORITIES[this.currentState] ?? 0;
  }

  get face() {
    return STATE_FACES[this.currentState] || 'grin';
  }

  get act() {
    return STATE_ACTS[this.currentState] || null;
  }

  get toneInstruction() {
    return STATE_TONE_INSTRUCTIONS[this.currentState] || '';
  }

  onChange(listener) {
    if (typeof listener === 'function') {
      this._listeners.add(listener);
      return () => this._listeners.delete(listener);
    }
    return () => {};
  }

  _notify(transition) {
    for (const fn of this._listeners) {
      try {
        fn(transition);
      } catch (err) {
        console.error('[capri:emotion] error in onChange listener:', err);
      }
    }
    if (this.bus) {
      this.bus.emit('emotion.changed', transition, 'emotion-engine');
    }
  }

  _checkExpiration() {
    if (this.stateExpiresAt !== Infinity && Date.now() >= this.stateExpiresAt) {
      // Revert to neutral or previous baseline
      const fallback = this.previousState === EMOTIONAL_STATES.ALERT || this.previousState === EMOTIONAL_STATES.FRUSTRATED
        ? EMOTIONAL_STATES.NEUTRAL
        : this.previousState;
      this._applyState(fallback, { duration: Infinity, reason: 'state_expired', force: true });
    }
  }

  _applyState(nextState, { duration = null, reason = 'manual', force = false } = {}) {
    if (!Object.values(EMOTIONAL_STATES).includes(nextState)) {
      throw new Error(`Invalid emotional state: ${nextState}`);
    }

    const currentPriority = STATE_PRIORITIES[this.state] ?? 0;
    const nextPriority = STATE_PRIORITIES[nextState] ?? 0;

    // Respect priority unless forced or state has expired
    if (!force && nextPriority < currentPriority && Date.now() < this.stateExpiresAt) {
      return false;
    }

    const prev = this.state;
    this.previousState = prev;
    this.state = nextState;
    this.stateSetAt = Date.now();

    const defaultDuration = STATE_DURATIONS[nextState];
    const chosenDuration = duration !== null ? duration : defaultDuration;
    this.stateExpiresAt = chosenDuration === Infinity ? Infinity : this.stateSetAt + chosenDuration;

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    if (this.stateExpiresAt !== Infinity) {
      this._timer = setTimeout(() => {
        this._checkExpiration();
      }, chosenDuration + 10);
    }

    const transition = {
      from: prev,
      to: nextState,
      priority: nextPriority,
      face: this.face,
      act: this.act,
      reason,
      timestamp: this.stateSetAt,
    };

    this.history.push(transition);
    if (this.history.length > 50) this.history.shift();

    if (prev !== nextState) {
      this._notify(transition);
    }

    return true;
  }

  transition(nextState, options = {}) {
    return this._applyState(nextState, options);
  }

  reset() {
    return this._applyState(EMOTIONAL_STATES.NEUTRAL, { duration: Infinity, reason: 'reset', force: true });
  }

  /**
   * Automatically update emotion from system or coding agent events
   */
  handleEvent(event) {
    if (!event || !event.type) return;

    switch (event.type) {
      case 'coding.agent.waiting_for_permission':
        this.transition(EMOTIONAL_STATES.ALERT, { duration: 40000, reason: 'permission_prompt' });
        break;

      case 'coding.agent.started':
      case 'terminal.command_started':
      case 'mission.started':
        this.transition(EMOTIONAL_STATES.FOCUSED, { duration: 60000, reason: 'work_started' });
        break;

      case 'coding.agent.completed':
      case 'mission.completed':
        this.transition(EMOTIONAL_STATES.EXCITED, { duration: 16000, reason: 'work_succeeded' });
        break;

      case 'coding.agent.failed':
      case 'terminal.command_failed':
      case 'mission.failed':
        this.transition(EMOTIONAL_STATES.FRUSTRATED, { duration: 18000, reason: 'work_failed' });
        break;

      case 'desktop.user_inactive':
        this.transition(EMOTIONAL_STATES.SLEEPY, { duration: Infinity, reason: 'user_inactive' });
        break;

      case 'desktop.user_active':
        if (this.state === EMOTIONAL_STATES.SLEEPY) {
          this.transition(EMOTIONAL_STATES.NEUTRAL, { duration: Infinity, reason: 'user_active', force: true });
        }
        break;

      case 'application.focus_changed':
        if (event.data?.isDevTool) {
          this.transition(EMOTIONAL_STATES.FOCUSED, { duration: 45000, reason: 'dev_tool_focused' });
        }
        break;

      case 'memory.context_retrieved':
        this.transition(EMOTIONAL_STATES.CURIOUS, { duration: 8000, reason: 'memory_retrieved' });
        break;
    }
  }

  _wireBus() {
    this.bus.on('*', (evt) => this.handleEvent(evt));
  }
}

module.exports = {
  EMOTIONAL_STATES,
  STATE_PRIORITIES,
  STATE_DURATIONS,
  STATE_FACES,
  STATE_ACTS,
  STATE_TONE_INSTRUCTIONS,
  EmotionEngine,
};
