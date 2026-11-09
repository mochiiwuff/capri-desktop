'use strict';

// What her chat can do to your PC itself (Windows): open one of its settings, say what's left of
// its battery's charge, disk and memory and what its IP is, set its sound, start a snip, get its
// windows out of the way or side by side, switch it dark or light, and lock it, put it to sleep,
// shut it down or restart it (those only after your click in her chat). Keeping it in shape is in
// upkeep.js, its sound and devices in devices.js, your windows' routines in setups.js.

const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { shell, screen } = require('electron');
const apps = require('./apps');
const upkeep = require('./upkeep');
const devices = require('./devices');
const setups = require('./setups');

const WIN = process.platform === 'win32';

// her words for them -> Windows' own settings pages (ms-settings:)
const SETTINGS = {
  bluetooth: 'bluetooth', sound: 'sound', wifi: 'network-wifi', network: 'network-status', update: 'windowsupdate',
  display: 'display', notifications: 'notifications', mouse: 'mousetouchpad', power: 'powersleep',
  battery: 'batterysaver', background: 'personalization-background', storage: 'storagesense',
  gaming: 'gaming-gamedvr',
};

const run = (file, args) => new Promise((resolve) => {
  execFile(file, args, { windowsHide: true, timeout: 15000 }, (err) => resolve(!err));
});

async function settings(page) {
  if (!WIN || !SETTINGS[page]) return false;
  await shell.openExternal(`ms-settings:${SETTINGS[page]}`);
  return true;
}

// Its battery (none on a desktop), the disk Windows is on, the memory, and the PC's address on
// your network (not the internet's idea of it: that would mean asking a website).
async function info(what) {
  if (what === 'battery') {
    const out = WIN && await apps.powershell('Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress').catch(() => '');
    if (!out) return { none: true };
    const b = JSON.parse(out);
    // BatteryStatus: 1 on battery; 2 on the charger; 3 full; 6 to 9 charging
    return { percent: b.EstimatedChargeRemaining, charging: [2, 3, 6, 7, 8, 9].includes(b.BatteryStatus) };
  }
  if (what === 'disk') {
    const drive = `${process.env.SystemDrive || 'C:'}\\`;
    try {
      const s = fs.statfsSync(drive);
      return { drive: drive.slice(0, 2), free: s.bavail * s.bsize, total: s.blocks * s.bsize };
    } catch {
      return null;
    }
  }
  if (what === 'ram') return { total: os.totalmem(), used: os.totalmem() - os.freemem() };
  if (what === 'ip') {
    const local = Object.entries(os.networkInterfaces())
      .filter(([name]) => !/virtual|vethernet|vmware|loopback|vbox|wsl|hyper-v/i.test(name))
      .flatMap(([, list]) => list || [])
      .find((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
    return { ip: local?.address || null };
  }
  return null;
}

// Windows' own volume (the default speakers), through its Core Audio interfaces.
const AUDIO = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float level, Guid context);
  int j();
  int GetMasterVolumeLevelScalar(out float level);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid context);
  int GetMute(out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int ctx, int p, out IAudioEndpointVolume volume); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator { }
public static class CapriAudio {
  static IAudioEndpointVolume Volume() {
    IMMDevice device;
    Marshal.ThrowExceptionForHR(((IMMDeviceEnumerator)new DeviceEnumerator()).GetDefaultAudioEndpoint(0, 1, out device));
    IAudioEndpointVolume volume;
    var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(device.Activate(ref id, 23, 0, out volume));
    return volume;
  }
  public static int Level { get { float v; Marshal.ThrowExceptionForHR(Volume().GetMasterVolumeLevelScalar(out v)); return (int)Math.Round(v * 100); } }
  public static void Set(int level) { Marshal.ThrowExceptionForHR(Volume().SetMasterVolumeLevelScalar(level / 100f, Guid.Empty)); }
  public static void Mute(bool mute) { Marshal.ThrowExceptionForHR(Volume().SetMute(mute, Guid.Empty)); }
}
"@
`;

// { level } (0 to 100, unmuted too), { mute: true | false }, or neither: the level now
async function volume({ level = null, mute = null } = {}) {
  if (!WIN) return null;
  let line = '';
  if (Number.isFinite(level)) line = `[CapriAudio]::Set(${Math.round(Math.min(100, Math.max(0, level)))}); [CapriAudio]::Mute($false); `;
  else if (typeof mute === 'boolean') line = `[CapriAudio]::Mute($${mute}); `;
  const out = await apps.powershell(`${AUDIO}${line}[CapriAudio]::Level`).catch(() => null);
  const now = Number.parseInt(out, 10);
  return Number.isFinite(now) ? { level: now } : null;
}

// Windows' own snip: you pick the area, it lands in your clipboard.
async function snip() {
  if (!WIN) return false;
  await shell.openExternal('ms-screenclip:');
  return true;
}

// Every window down to the taskbar (your desktop shows), or back up.
async function tidy(back = false) {
  if (!WIN) return false;
  return apps.powershell(`(New-Object -ComObject Shell.Application).${back ? 'UndoMinimizeALL' : 'MinimizeAll'}()`).then(() => true, () => false);
}

// The window of app `name` on the left or right half of the screen she's on (its frame's
// invisible edges taken into account, so it fills it).
async function arrange(name, side, display) {
  if (!WIN || !['left', 'right'].includes(side)) return null;
  const app = await apps.find(name).catch(() => null);
  if (!app?.ids?.length) return { found: false };
  const work = screen.dipToScreenRect(null, display.workArea);
  const edge = Math.round(7 * display.scaleFactor);
  const half = Math.floor(work.width / 2);
  const x = (side === 'left' ? work.x : work.x + half) - edge;
  const out = await apps.powershell(
    'Add-Type -Namespace Capri -Name Place -MemberDefinition \''
    + '[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v); '
    + '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd); '
    + '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);\'; '
    + '[void][Capri.Place]::SetProcessDpiAwarenessContext([IntPtr](-4)); '
    + `$h = (Get-Process -Id ${app.ids.join(',')} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle; `
    + 'if (-not $h) { "none"; exit }; '
    + '[void][Capri.Place]::ShowWindow($h, 9); '
    + `[void][Capri.Place]::SetWindowPos($h, [IntPtr]::Zero, ${x}, ${work.y}, ${half + edge * 2}, ${work.height + edge}, 0x0040); "ok"`,
  ).catch(() => '');
  return { found: out.trim() === 'ok', name: app.name };
}

// Windows and its apps dark or light, told to everything open so it changes right away.
async function theme(dark) {
  if (!WIN) return false;
  const v = dark ? 0 : 1;
  return apps.powershell(
    '$k = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"; '
    + `Set-ItemProperty -Path $k -Name AppsUseLightTheme -Value ${v} -Type DWord; `
    + `Set-ItemProperty -Path $k -Name SystemUsesLightTheme -Value ${v} -Type DWord; `
    + 'Add-Type -Namespace Capri -Name Msg -MemberDefinition \'[DllImport("user32.dll", CharSet = CharSet.Unicode)] '
    + 'public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr w, string l, uint f, uint t, out UIntPtr r);\'; '
    + '$r = [UIntPtr]::Zero; [void][Capri.Msg]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, "ImmersiveColorSet", 2, 3000, [ref]$r)',
  ).then(() => true, () => false);
}

// Lock, sleep, or shut down / restart in `seconds` (Windows' own countdown: 'cancel' stops it).
async function power(action, seconds = 60) {
  if (!WIN) return false;
  const s = String(Math.round(Math.min(315360000, Math.max(0, seconds))));
  if (action === 'lock') return run('rundll32.exe', ['user32.dll,LockWorkStation']);
  if (action === 'sleep') {
    return apps.powershell('Add-Type -AssemblyName System.Windows.Forms; '
      + '[void][System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)').then(() => true, () => false);
  }
  if (action === 'shutdown') return run('shutdown.exe', ['/s', '/t', s]);
  if (action === 'restart') return run('shutdown.exe', ['/r', '/t', s]);
  if (action === 'cancel') return run('shutdown.exe', ['/a']);
  return false;
}

// The same file twice, in short for her chat: { copies, wasted (bytes), first (a copy, to show) }
const shortly = (groups) => ({
  copies: groups.reduce((n, g) => n + g.files.length - 1, 0),
  wasted: groups.reduce((n, g) => n + g.size * (g.files.length - 1), 0),
  first: groups[0]?.files[1] || null,
});

const num = (v) => (Number.isFinite(v) ? v : null);
const WHERE = new Set(['pictures', 'videos', 'downloads', 'documents', 'desktop']);

// One way in, from her chat (main.js): only these, with only what each takes. `progress(p)` for
// what takes a while (her ticker).
function act(req = {}, { display, progress = () => {} } = {}) {
  const where = WHERE.has(req.where) ? req.where : 'pictures';
  switch (req.action) {
    // keeping it in shape (upkeep.js)
    case 'heavy': return upkeep.heavy();
    case 'space': return upkeep.space();
    case 'clean': return upkeep.clean();
    case 'trash': return upkeep.trash(String(req.path || ''));
    case 'startup': return upkeep.startup();
    case 'setStartup': return upkeep.setStartup(String(req.name || ''), Boolean(req.on));
    case 'updates': return upkeep.updates();
    case 'updateAll': return upkeep.updateAll((p) => progress({ kind: 'update', ...p }));
    case 'duplicates': return upkeep.duplicates(where, (p) => progress({ kind: 'duplicates', ...p })).then(shortly);
    case 'trashDuplicates': return upkeep.trashDuplicates(where);
    case 'internet': return upkeep.internet();
    // its sound and devices (devices.js)
    case 'outputs': return devices.outputs();
    case 'useOutput': return devices.useOutput(String(req.id || ''));
    case 'mic': return devices.mic(typeof req.mute === 'boolean' ? req.mute : null);
    case 'radio': return devices.radio(req.kind === 'wifi' ? 'wifi' : 'bluetooth', typeof req.on === 'boolean' ? req.on : null);
    case 'usb': return devices.usbDrives();
    case 'eject': return devices.eject(String(req.letter || ''));
    case 'brightness': return devices.brightness({ level: num(req.level), by: num(req.by) });
    case 'gameBar': return devices.gameBar(req.what === 'record' ? 'record' : 'clip');
    // its windows and your routines (setups.js)
    case 'rescue': return setups.rescue(display);
    case 'toScreen': return setups.toScreen(String(req.name || '').slice(0, 80), Number.isInteger(req.index) ? req.index : null);
    case 'remember': return volume().then((v) => setups.remember(String(req.name || ''), v?.level ?? null));
    case 'launchSetup': return setups.launchSetup(String(req.name || '')).then(async (r) => {
      if (Number.isFinite(r.volume)) await volume({ level: r.volume });
      return r;
    });
    case 'setups': return { names: setups.setupNames() };
    case 'gameMode': return setups.gameMode(Boolean(req.on));
    case 'gameClose': return setups.setGameClose(Array.isArray(req.apps) ? req.apps : []);
    case 'settings': return settings(String(req.page));
    case 'info': return info(String(req.what));
    case 'volume': return volume({ level: Number.isFinite(req.level) ? req.level : null, mute: typeof req.mute === 'boolean' ? req.mute : null });
    case 'snip': return snip();
    case 'tidy': return tidy(Boolean(req.back));
    case 'arrange': return arrange(String(req.name || '').slice(0, 80), req.side, display);
    case 'theme': return theme(Boolean(req.dark));
    case 'power': return power(String(req.what), Number(req.seconds) || 0);
    default: return null;
  }
}

module.exports = { act, SETTINGS };
