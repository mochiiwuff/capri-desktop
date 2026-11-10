'use strict';

function normalizeRules(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((rule) => typeof rule === 'string')
    .map((rule) => rule.trim().slice(0, 80).toLowerCase())
    .filter(Boolean))].slice(0, 40);
}

function isExcluded({ app, title }, apps = [], terms = []) {
  const appName = String(app || '').replace(/\.exe$/i, '').trim().toLowerCase();
  const windowTitle = String(title || '').toLowerCase();
  return normalizeRules(apps).some((rule) => appName === rule.replace(/\.exe$/i, ''))
    || normalizeRules(terms).some((term) => windowTitle.includes(term));
}

module.exports = { normalizeRules, isExcluded };
