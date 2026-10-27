'use strict';

// Focus mode: a pomodoro she counts down for you. Rounds of work, a short break after each,
// a long one after the last round. Kept here, in the main process, so the tray can show it and a
// reload of the overlay doesn't lose it; the overlay draws the countdown from `endsAt`.

const MIN = 60 * 1000;
const PRESETS = {
  classic: { work: 25 * MIN, rest: 5 * MIN, long: 15 * MIN, rounds: 4 },
  deep: { work: 50 * MIN, rest: 10 * MIN, long: 20 * MIN, rounds: 4 },
};

// Your own times (minutes, as typed in the "Set my own times" window): what each may be.
const LIMITS = { work: [1, 240], rest: [1, 120], long: [1, 120], rounds: [1, 12] };

// Whole numbers within LIMITS, or null with the field that's wrong.
function checkTimes(times) {
  const out = {};
  for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
    const n = Number(times?.[key]);
    if (!Number.isInteger(n) || n < lo || n > hi) return { ok: false, field: key, min: lo, max: hi };
    out[key] = n;
  }
  return { ok: true, times: out };
}

// custom: () => your own times in minutes (the config's focusCustom)
function createFocus({ onChange, custom = () => null }) {
  // phase: 'off' | 'work' | 'rest' | 'long'
  let state = { phase: 'off', preset: null, round: 0, rounds: 0, length: 0, endsAt: 0, left: 0, paused: false };
  let plan = PRESETS.classic;
  let timer = null;

  const snapshot = () => ({ ...state, now: Date.now() });

  const arm = () => {
    clearTimeout(timer);
    if (state.phase === 'off' || state.paused) return;
    timer = setTimeout(next, Math.max(0, state.endsAt - Date.now()));
  };

  const enter = (phase, round, event) => {
    const length = phase === 'work' ? plan.work : phase === 'rest' ? plan.rest : plan.long;
    state = { ...state, phase, round, length, endsAt: Date.now() + length, left: length, paused: false };
    arm();
    onChange(event, snapshot());
  };

  // the phase ran out: work -> a break (the long one after the last round), a break -> work
  function next() {
    if (state.phase === 'work') {
      enter(state.round >= state.rounds ? 'long' : 'rest', state.round, 'break');
    } else if (state.phase === 'rest') {
      enter('work', state.round + 1, 'back');
    } else if (state.phase === 'long') {
      enter('work', 1, 'back');
    }
  }

  return {
    get state() {
      return snapshot();
    },
    // preset: 'classic', 'deep' or 'custom' (your own times)
    start(preset = 'classic') {
      let name = PRESETS[preset] ? preset : 'classic';
      plan = PRESETS[name];
      if (preset === 'custom') {
        const mine = checkTimes(custom());
        if (mine.ok) {
          name = 'custom';
          const { work, rest, long, rounds } = mine.times;
          plan = { work: work * MIN, rest: rest * MIN, long: long * MIN, rounds };
        }
      }
      state = { ...state, preset: name, rounds: plan.rounds };
      enter('work', 1, 'start');
    },
    pause() {
      if (state.phase === 'off' || state.paused) return;
      state = { ...state, paused: true, left: Math.max(0, state.endsAt - Date.now()) };
      arm();
      onChange('pause', snapshot());
    },
    resume() {
      if (state.phase === 'off' || !state.paused) return;
      state = { ...state, paused: false, endsAt: Date.now() + state.left };
      arm();
      onChange('resume', snapshot());
    },
    skip() {
      if (state.phase !== 'off') next();
    },
    stop() {
      if (state.phase === 'off') return;
      clearTimeout(timer);
      state = { ...state, phase: 'off', paused: false, endsAt: 0, left: 0 };
      onChange('stop', snapshot());
    },
  };
}

module.exports = { createFocus, checkTimes, PRESETS, LIMITS };
