'use strict';

const RELEASES_API = 'https://api.github.com/repos/mochiiwuff/capri-desktop/releases/latest';
const RELEASES_PAGE = 'https://github.com/mochiiwuff/capri-desktop/releases';

function versionParts(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return null;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

async function checkForUpdate({ currentVersion, fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  if (!versionParts(currentVersion)) throw new TypeError('Current Capri version must be a stable semantic version');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new RangeError('Update check timeout must be between 1 and 30 seconds');
  }

  const response = await fetchImpl(RELEASES_API, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'Capri-Desktop-Update-Check' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`GitHub release check failed (${response.status})`);
  const release = await response.json();
  const latestVersion = String(release?.tag_name || '').replace(/^v/, '');
  const comparison = compareVersions(latestVersion, currentVersion);
  if (comparison === null) throw new Error('GitHub returned an invalid Capri release version');
  return {
    currentVersion,
    latestVersion,
    updateAvailable: comparison > 0,
    releaseUrl: RELEASES_PAGE,
  };
}

module.exports = { checkForUpdate, compareVersions, RELEASES_API, RELEASES_PAGE };
