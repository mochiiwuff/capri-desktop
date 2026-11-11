'use strict';

const SENSITIVE_APPS = new Set([
  '1password', '1password7', 'bitwarden', 'dashlane', 'enpass',
  'keepass', 'keepassxc', 'lastpass', 'nordpass', 'protonpass',
]);
const SENSITIVE_TITLE = /\b(?:password|passcode|passphrase|credential|credentials|sign[ -]?in|log[ -]?in|authentication|authenticator|verification code|one[- ]time code|2fa|mfa|bank(?:ing)?|credit card|payment|private browsing|incognito|direct messages?|private messages?|private conversation)\b/i;

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

function isAppAllowed(app, allowedApps = []) {
  if (!Array.isArray(allowedApps)) return false;
  if (!allowedApps.length) return true;
  const rules = normalizeRules(allowedApps);
  if (!rules.length) return false;
  const appName = String(app || '').replace(/\.exe$/i, '').trim().toLowerCase();
  return Boolean(appName) && rules.some((rule) => appName === rule.replace(/\.exe$/i, ''));
}

function isSensitiveWindow({ app, title } = {}) {
  const appName = String(app || '').replace(/\.exe$/i, '').trim().toLowerCase();
  return SENSITIVE_APPS.has(appName) || SENSITIVE_TITLE.test(String(title || ''));
}

module.exports = { normalizeRules, isExcluded, isAppAllowed, isSensitiveWindow };
