'use strict';

const screenExclusions = require('./screen-exclusions');

const DEFAULT_STATE = Object.freeze({
  enabled: false,
  apps: {},
  routines: [],
  updatedAt: null,
});

function normalizeLabel(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || 'unknown';
}

function readState(state) {
  const base = state && typeof state === 'object' ? state : DEFAULT_STATE;
  const apps = {};
  for (const [key, value] of Object.entries(base.apps || {})) {
    apps[key] = {
      label: normalizeLabel(value?.label || key),
      count: Number(value?.count || 0),
      totalMs: Number(value?.totalMs || 0),
      lastSeenAt: value?.lastSeenAt || null,
    };
  }
  return {
    enabled: base.enabled === true,
    apps,
    routines: Array.isArray(base.routines) ? base.routines.slice(0, 25) : [],
    updatedAt: base.updatedAt || null,
  };
}

function inferRoutine(label) {
  const text = label.toLowerCase();
  if (/code|vscode|terminal|powershell|cmd|git|npm|node|python|yarn|pnpm|typescript|jest|vitest|next|react|webpack|vite/.test(text)) return 'coding';
  if (/browser|chrome|edge|firefox|discord|slack|teams|whatsapp|outlook|mail/.test(text)) return 'communication';
  if (/spotify|youtube|music|deezer|soundcloud|netflix|movie|video/.test(text)) return 'entertainment';
  if (/word|excel|docs|notion|pdf|writer|obsidian|planner/.test(text)) return 'productivity';
  return 'general';
}

function ingestWindowActivity(snapshot, state = DEFAULT_STATE, elapsedMs = 15000, excludedApps = []) {
  const current = readState(state);
  if (!current.enabled) return current;

  const now = Date.now();
  const rawApp = typeof snapshot?.app === 'string' ? snapshot.app : '';
  if (screenExclusions.isExcluded({ app: rawApp }, excludedApps)) return current;
  const label = normalizeLabel(rawApp.replace(/\.exe$/i, ''));
  if (!rawApp || label === 'unknown' || !/^[a-z0-9_. -]{1,80}$/i.test(label)) return current;
  const key = label.toLowerCase();
  const routine = inferRoutine(label);
  const appState = current.apps[key] || { label, count: 0, totalMs: 0, lastSeenAt: null };
  const elapsed = Math.max(0, Math.min(Number(elapsedMs) || 0, 60000));
  const nextEntry = {
    label,
    count: appState.count + 1,
    totalMs: appState.totalMs + elapsed,
    lastSeenAt: new Date(now).toISOString(),
  };

  const routines = [...current.routines];
  const existingRoutine = routines.find((item) => item.routine === routine);
  if (existingRoutine) {
    existingRoutine.count += 1;
    existingRoutine.lastSeenAt = new Date(now).toISOString();
    existingRoutine.apps = Array.from(new Set([...(existingRoutine.apps || []), label])).slice(0, 12);
  } else {
    routines.push({ routine, count: 1, lastSeenAt: new Date(now).toISOString(), apps: [label] });
  }

  const next = {
    enabled: current.enabled,
    apps: { ...current.apps, [key]: nextEntry },
    routines: routines.slice(0, 20),
    updatedAt: new Date(now).toISOString(),
  };
  return next;
}

module.exports = {
  DEFAULT_STATE,
  readState,
  inferRoutine,
  ingestWindowActivity,
};
