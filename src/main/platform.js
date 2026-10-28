'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

function commandExists(name) {
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  return (process.env.PATH || '').split(path.delimiter).some((dir) => dir && suffixes.some((suffix) => {
    try { fs.accessSync(path.join(dir, name + suffix), fs.constants.X_OK); return true; } catch { return false; }
  }));
}

function run(command, args) {
  return new Promise((resolve, reject) => execFile(command, args,
    { timeout: 2000, maxBuffer: 1024 * 1024, windowsHide: true },
    (error, output) => error ? reject(error) : resolve(output)));
}

const feature = (status, reason = '') => ({ status, reason });
const supported = () => feature('supported');
const unavailable = (reason) => feature('unavailable', reason);
const conditional = (reason) => feature('conditional', reason);

// Return only enumerated, non-personal observations. Never include environment
// values, executable paths, command output, window titles or configuration files.
async function inspectPlatform({ platform = process.platform, env = process.env, backend = 'x11',
  exists = commandExists, execute = run, readRelease = () => fs.readFileSync('/etc/os-release', 'utf8') } = {}) {
  const linux = platform === 'linux';
  backend = ['x11', 'wayland'].includes(backend) ? backend : 'unknown';
  const windows = platform === 'win32';
  const wayland = linux && Boolean(env.WAYLAND_DISPLAY || env.XDG_SESSION_TYPE === 'wayland' || env.HYPRLAND_INSTANCE_SIGNATURE);
  const hyprland = linux && Boolean(env.HYPRLAND_INSTANCE_SIGNATURE);
  const session = linux ? hyprland ? 'hyprland' : wayland ? 'wayland' : env.DISPLAY ? 'x11' : 'headless' : platform;
  let distribution = linux ? 'Linux' : windows ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Unknown';
  if (linux) {
    try {
      const id = /^ID=["']?([a-z0-9_-]+)["']?\s*$/m.exec(readRelease())?.[1];
      distribution = { cachyos: 'CachyOS', arch: 'Arch Linux', ubuntu: 'Ubuntu', debian: 'Debian',
        fedora: 'Fedora', opensuse: 'openSUSE', 'opensuse-tumbleweed': 'openSUSE' }[id] || 'Linux';
    } catch { /* identifying a distribution is optional */ }
  }
  const checks = {
    display: linux ? env.DISPLAY ? 'present' : 'missing' : 'not-applicable',
    hyprctl: 'not-applicable', portal: 'not-applicable',
    pipewireTool: linux && wayland ? exists('pw-cli') ? 'present' : 'missing' : 'not-applicable',
    tray: 'unknown', // a Tray object does not establish that a desktop panel displays it
  };
  await Promise.all([
    (async () => {
      if (!hyprland) return;
      checks.hyprctl = 'missing';
      if (!exists('hyprctl')) return;
      try {
        const monitors = JSON.parse(await execute('hyprctl', ['-j', 'monitors']));
        checks.hyprctl = Array.isArray(monitors) && monitors.length > 0
          && monitors.every((m) => m && Number.isInteger(m.id)) ? 'responding' : 'unreachable';
      } catch { checks.hyprctl = 'unreachable'; }
    })(),
    (async () => {
      if (!wayland) return;
      checks.portal = 'unknown';
      if (!exists('gdbus')) return;
      try {
        const output = await execute('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus',
          '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner',
          'org.freedesktop.portal.Desktop']);
        checks.portal = /^\(true,\)\s*$/.test(output.trim()) ? 'running'
          : /^\(false,\)\s*$/.test(output.trim()) ? 'not-running' : 'unknown';
      } catch { /* no session bus, or no permission: leave readiness unknown */ }
    })(),
  ]);

  const overlay = linux && backend !== 'x11' ? unavailable('nativeWayland')
    : linux && !env.DISPLAY ? unavailable('noDisplay') : supported();
  const tracking = windows ? supported() : !linux || !hyprland ? unavailable('noTracking')
    : overlay.status === 'unavailable' ? overlay
      : checks.hyprctl === 'missing' ? unavailable('noHyprctl')
        : checks.hyprctl !== 'responding' ? unavailable('hyprctlOffline') : supported();
  const capture = hyprland && exists('grim') ? supported() : linux && wayland ? conditional(checks.portal === 'running' ? 'portalPermission' : 'portalUnknown')
    : overlay.status === 'unavailable' ? overlay : supported();
  return {
    schemaVersion: 1, platform, distribution, session, backend: linux ? backend : 'native', checks,
    features: {
      overlay, windowTracking: tracking, screenCapture: capture,
      appCatalog: windows ? supported() : unavailable('windowsOnly'),
      closeApps: windows ? supported() : unavailable('windowsOnly'),
      media: windows || (linux && exists('playerctl') && exists('wpctl')) ? supported() : unavailable('windowsOnly'),
      aiDetection: windows ? supported() : unavailable('windowsOnly'),
      taskbarRest: windows ? supported() : unavailable('windowsOnly'),
      autoStart: windows || platform === 'darwin' ? supported() : unavailable('noAutoStart'),
      ollamaInstall: windows && exists('winget') ? supported() : unavailable('manualOllama'),
      ollamaLaunch: windows ? supported() : unavailable('manualLaunch'),
    },
  };
}

module.exports = { inspectPlatform };
