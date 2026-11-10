'use strict';

const activity = require('./activity');

const DEFAULT_STATE = Object.freeze({
  enabled: false,
  facts: [],
  activity: activity.DEFAULT_STATE,
  updatedAt: null,
});

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function canonicalText(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickFact(summary, category, source = 'conversation', confidence = 0.7) {
  const text = normalizeText(summary);
  if (!text) return null;
  return {
    id: `${category}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    category,
    source,
    text,
    confidence,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(state) {
  const facts = Array.isArray(state?.facts) ? state.facts : [];
  return {
    enabled: state?.enabled !== false,
    facts: facts.map((fact) => ({
      ...fact,
      text: normalizeText(fact?.text),
      category: fact?.category || 'general',
      source: fact?.source || 'conversation',
      confidence: Number(fact?.confidence ?? 0.5),
      createdAt: fact?.createdAt || new Date().toISOString(),
      updatedAt: fact?.updatedAt || fact?.createdAt || new Date().toISOString(),
    })),
    activity: activity.readState(state?.activity || activity.DEFAULT_STATE),
    updatedAt: state?.updatedAt || null,
  };
}

function mergeFacts(existing, incoming) {
  const merged = new Map();
  for (const fact of [...existing, ...incoming]) {
    const key = canonicalText(fact?.text || fact?.summary || '');
    if (!key) continue;
    const current = merged.get(key);
    if (!current || new Date(fact.updatedAt || fact.createdAt || Date.now()) > new Date(current.updatedAt || current.createdAt || Date.now())) {
      merged.set(key, { ...current, ...fact, updatedAt: fact.updatedAt || fact.createdAt || current?.updatedAt || new Date().toISOString() });
    }
  }
  return [...merged.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function extractConversationFacts(text) {
  const value = normalizeText(text);
  if (!value) return [];
  const lower = value.toLowerCase();
  const facts = [];

  const rules = [
    {
      category: 'preference',
      test: /(prefiro|gosto de|detesto|odeio|quero|preciso de|me chame de|meu nome é|eu sou|sou o|sou a|não gosto de|nao gosto de)/i,
      build: (v) => {
        const match = v.match(/(?:prefiro|gosto de|detesto|odeio|quero|preciso de|me chame de|meu nome é|eu sou|sou o|sou a|não gosto de|nao gosto de)\s+(.{3,200})/i);
        return match ? match[1].trim().replace(/[.!?]+$/, '') : v;
      },
    },
    {
      category: 'project',
      test: /(projeto|trabalho no|estou trabalhando em|estou no|planejo|desenvolvendo|estou usando|vou focar em|foco em)/i,
      build: (v) => {
        const match = v.match(/(?:projeto|trabalho no|estou trabalhando em|estou no|planejo|desenvolvendo|estou usando|vou focar em|foco em)\s+(.{3,200})/i);
        return match ? match[1].trim().replace(/[.!?]+$/, '') : v;
      },
    },
    {
      category: 'routine',
      test: /(normalmente|costumo|sempre|todo dia|toda semana|de manhã|à noite|a noite|manhã|tarde|meu horário|meu ritual)/i,
      build: (v) => v,
    },
    {
      category: 'general',
      test: /(lembre|recorde|guarde|memorize|remember|tenha em mente|importante que)/i,
      build: (v) => v,
    },
  ];

  for (const rule of rules) {
    if (!rule.test.test(value)) continue;
    const normalized = normalizeText(rule.build(value));
    if (normalized.length < 4 || normalized.length > 240) continue;
    const fact = pickFact(normalized, rule.category, 'conversation', rule.category === 'project' ? 0.9 : 0.8);
    if (fact) facts.push(fact);
  }

  // Fallback: capture a clean subject for obvious identity statements.
  const identity = value.match(/(?:meu nome(?: é| é\s+)?|chamo-me|chamo me|sou o|sou a)\s+(.{2,80})/i);
  if (identity && !facts.some((fact) => fact.category === 'preference')) {
    const fact = pickFact(identity[1].trim().replace(/[.!?]+$/, ''), 'preference', 'conversation', 0.75);
    if (fact) facts.push(fact);
  }

  if (!facts.length && /(?:gosto|odeio|prefiro|quero|preciso|importa|interessa|projeto|trabalho|rotina|horário)/i.test(lower)) {
    const fact = pickFact(value, 'general', 'conversation', 0.55);
    if (fact) facts.push(fact);
  }

  return facts;
}

function ingestConversation(text, state = DEFAULT_STATE) {
  const current = normalizeState(state);
  if (!current.enabled) return current;
  const facts = extractConversationFacts(text);
  const merged = mergeFacts(current.facts, facts);
  const next = {
    ...current,
    facts: merged.slice(0, 40),
    updatedAt: new Date().toISOString(),
  };
  return next;
}

function ingestWindowActivity(snapshot, state = DEFAULT_STATE, elapsedMs = 15000) {
  const current = normalizeState(state);
  const nextActivity = activity.ingestWindowActivity(snapshot, current.activity, elapsedMs);
  return {
    ...current,
    activity: nextActivity,
    updatedAt: new Date().toISOString(),
  };
}

function readState(state) {
  return normalizeState(state || DEFAULT_STATE);
}

function acceptedConversationFacts(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.status === 'accepted' && typeof entry.text === 'string')
    .map((entry) => ({
      category: entry.kind || 'general',
      text: normalizeText(entry.text),
      confidence: Number(entry.confidence || 0),
      updatedAt: entry.updatedAt || null,
    }))
    .filter((fact) => fact.text);
}

function clearLearnedState(state) {
  const current = normalizeState(state);
  return {
    ...current,
    facts: [],
    activity: {
      ...current.activity,
      apps: {},
      routines: [],
      updatedAt: null,
    },
    updatedAt: null,
  };
}

module.exports = {
  DEFAULT_STATE,
  normalizeText,
  canonicalText,
  extractConversationFacts,
  ingestConversation,
  ingestWindowActivity,
  readState,
  mergeFacts,
  acceptedConversationFacts,
  clearLearnedState,
};
