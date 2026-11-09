'use strict';

// Her chat on your PC's sound and devices (system.js): where the sound comes out (your headset or
// your speakers), your microphone off and on, Wi-Fi and Bluetooth really on or off (not just their
// settings page), a USB stick ejected safely, the screen's brightness (a laptop's own screen), and
// the Xbox Game Bar's clip of the last 30 seconds or its recording, through its own shortcuts.

const apps = require('./apps');

const ps = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Windows' audio devices through its Core Audio interfaces (and the one it uses itself to pick
// the default device, as its sound settings do).
const SOUND = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
[StructLayout(LayoutKind.Sequential)] public struct CapriKey { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Sequential)] public struct CapriValue { public ushort vt, r1, r2, r3; public IntPtr p, p2; }
[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICapriStore { int GetCount(out int n); int GetAt(int i, out CapriKey k); int GetValue(ref CapriKey k, out CapriValue v); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICapriDevice {
  int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object face);
  int OpenPropertyStore(int access, out ICapriStore store);
  int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICapriDevices { int GetCount(out int n); int Item(int i, out ICapriDevice d); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICapriEnumerator { int EnumAudioEndpoints(int flow, int mask, out ICapriDevices list); int GetDefaultAudioEndpoint(int flow, int role, out ICapriDevice d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class CapriEnumerator { }
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICapriVolume {
  int f(); int g(); int h(); int i(); int j(); int k(); int l(); int m(); int n(); int o(); int p();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid context);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICapriPolicy { int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h(); int i(); int j(); int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role); }
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class CapriPolicy { }
public static class CapriSound {
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref CapriValue v);
  static ICapriEnumerator Devices() { return (ICapriEnumerator)new CapriEnumerator(); }
  static string Id(ICapriDevice d) { string id; Marshal.ThrowExceptionForHR(d.GetId(out id)); return id; }
  static string Name(ICapriDevice d) {
    ICapriStore store;
    if (d.OpenPropertyStore(0, out store) != 0) return "";
    var key = new CapriKey { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
    CapriValue v;
    if (store.GetValue(ref key, out v) != 0) return "";
    string name = v.vt == 31 ? Marshal.PtrToStringUni(v.p) : "";
    PropVariantClear(ref v);
    return name;
  }
  public static string Outputs() {
    var all = Devices(); ICapriDevice def; ICapriDevices list; int n;
    string now = all.GetDefaultAudioEndpoint(0, 1, out def) == 0 ? Id(def) : "";
    Marshal.ThrowExceptionForHR(all.EnumAudioEndpoints(0, 1, out list));
    list.GetCount(out n);
    var lines = new StringBuilder();
    for (int i = 0; i < n; i++) { ICapriDevice d; list.Item(i, out d); string id = Id(d); lines.Append(id + "\\t" + Name(d) + "\\t" + (id == now ? 1 : 0) + "\\n"); }
    return lines.ToString();
  }
  public static void Use(string id) { var policy = (ICapriPolicy)new CapriPolicy(); for (int role = 0; role < 3; role++) Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(id, role)); }
  public static int Mic(int mute) {
    ICapriDevice d;
    if (Devices().GetDefaultAudioEndpoint(1, 0, out d) != 0 || d == null) return -1;
    var iid = typeof(ICapriVolume).GUID; object face;
    Marshal.ThrowExceptionForHR(d.Activate(ref iid, 23, IntPtr.Zero, out face));
    var volume = (ICapriVolume)face;
    if (mute >= 0) Marshal.ThrowExceptionForHR(volume.SetMute(mute == 1, Guid.Empty));
    bool muted; Marshal.ThrowExceptionForHR(volume.GetMute(out muted));
    return muted ? 1 : 0;
  }
}
"@; `;

// Its outputs: [{ id, name, on (the one in use) }]
async function outputs() {
  const out = await apps.powershell(`${SOUND}[CapriSound]::Outputs()`, 20000).catch(() => '');
  return out.split('\n').map((line) => line.split('\t')).filter((cells) => cells.length >= 3 && cells[0])
    .map(([id, name, on]) => ({ id: id.trim(), name: name.trim(), on: on.trim() === '1' }));
}

// The sound out of output `id` (for everything: games, music, calls), as its sound settings do it
async function useOutput(id) {
  if (!(await outputs()).some((o) => o.id === id)) return false;
  return apps.powershell(`${SOUND}[CapriSound]::Use(${ps(id)}); "ok"`, 20000).then((out) => out.trim() === 'ok', () => false);
}

// The default microphone muted (true), back on (false), or as it is (null): { muted } or { none }
async function mic(mute = null) {
  const out = await apps.powershell(`${SOUND}[CapriSound]::Mic(${mute === true ? 1 : mute === false ? 0 : -1})`, 20000).catch(() => '');
  const now = Number.parseInt(out, 10);
  if (now === -1) return { none: true };
  return Number.isFinite(now) ? { muted: now === 1 } : null;
}

// Wi-Fi or Bluetooth (Windows' radios API): on (true), off (false), or as it is (null).
// { state: 'On' | 'Off' | 'Disabled' } or { none } (no such radio), { denied } (Windows said no)
async function radio(kind, on = null) {
  const winrt = 'Add-Type -AssemblyName System.Runtime.WindowsRuntime; '
    + "$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 "
    + "-and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]; "
    + 'function Wait($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(-1); $t.Result }; '
    + '[void][Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]; '
    + '[void][Windows.Devices.Radios.RadioState, Windows.System.Devices, ContentType = WindowsRuntime]; '
    + '[void](Wait ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])); '
    + '$all = Wait ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]); '
    + `$r = $all | Where-Object { "$($_.Kind)" -eq '${kind === 'wifi' ? 'WiFi' : 'Bluetooth'}' } | Select-Object -First 1; `
    + 'if (-not $r) { "none"; exit }; ';
  const set = on == null ? '' : `$s = Wait ($r.SetStateAsync('${on ? 'On' : 'Off'}')) ([Windows.Devices.Radios.RadioAccessStatus]); if ("$s" -ne 'Allowed') { "denied"; exit }; Start-Sleep -Milliseconds 300; `;
  const out = (await apps.powershell(`${winrt}${set}"$($r.State)"`, 25000).catch(() => '')).trim();
  if (out === 'none') return { none: true };
  if (out === 'denied' || !out) return { denied: true };
  return { state: out };
}

// The USB drives plugged in (sticks and USB disks): [{ letter, label }]
async function usbDrives() {
  const out = await apps.powershell(
    '$l = @(Get-Disk | Where-Object { $_.BusType -in "USB", "SD", "MMC" } | Get-Partition | Where-Object DriveLetter | ForEach-Object { [string]$_.DriveLetter }); '
    + '$l += @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2" | ForEach-Object { $_.DeviceID.Substring(0, 1) }); '
    + '@($l | Sort-Object -Unique | ForEach-Object { [pscustomobject]@{ letter = $_; label = [string](Get-Volume -DriveLetter $_ -ErrorAction SilentlyContinue).FileSystemLabel } }) | ConvertTo-Json -Compress',
    20000,
  ).catch(() => '');
  return [].concat(out ? JSON.parse(out) : []);
}

// One of them ejected as Explorer's "Eject" does (its name in your language): { ok } or { busy }
// (still there: something has a file open on it)
async function eject(letter) {
  const l = String(letter).toUpperCase().slice(0, 1);
  if (!(await usbDrives()).some((d) => d.letter === l)) return { ok: false };
  const out = await apps.powershell(
    `$item = (New-Object -ComObject Shell.Application).Namespace(17).ParseName('${l}:\\'); if (-not $item) { "gone"; exit }; `
    + '$verb = $item.Verbs() | Where-Object { $_.Name -replace "&", "" -match "eject|jecter|expulsar|ejetar|извлечь" } | Select-Object -First 1; '
    + 'if (-not $verb) { "noverb"; exit }; $verb.DoIt(); '
    + `foreach ($i in 1..12) { Start-Sleep -Milliseconds 500; if (-not (Test-Path '${l}:\\')) { "gone"; exit } }; "busy"`,
    20000,
  ).catch(() => '');
  return out.trim() === 'gone' ? { ok: true } : { ok: false, busy: out.trim() === 'busy' };
}

// The screen's brightness (a laptop's own screen; an external one has its own buttons): set to
// `level` %, moved by `by`, or as it is. { level } or { none }
async function brightness({ level = null, by = null } = {}) {
  const read = '$b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1; '
    + 'if (-not $b) { "none"; exit }; ';
  let set = '';
  if (Number.isFinite(level) || Number.isFinite(by)) {
    const target = Number.isFinite(level) ? `${Math.round(level)}` : `$b.CurrentBrightness + (${Math.round(by)})`;
    set = `$to = [math]::Max(5, [math]::Min(100, ${target})); `
      + 'Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Select-Object -First 1 | '
      + 'Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]$to } | Out-Null; $to; exit; ';
  }
  const out = (await apps.powershell(`${read}${set}$b.CurrentBrightness`, 20000).catch(() => '')).trim();
  if (out === 'none' || !out) return { none: true };
  const now = Number.parseInt(out, 10);
  return Number.isFinite(now) ? { level: now } : { none: true };
}

// The Xbox Game Bar: 'clip' (the last 30 seconds, Win+Alt+G) or 'record' (start or stop, Win+Alt+R),
// for the game in front. { ok } or { off } (its captures turned off), { noHistory } (clipping needs
// "Record what happened" on)
async function gameBar(what) {
  const keys = { clip: 0x47, record: 0x52 }[what];
  if (!keys) return { ok: false };
  const out = await apps.powershell(
    '$k = Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -ErrorAction SilentlyContinue; '
    + 'if ($k.AppCaptureEnabled -eq 0) { "off"; exit }; '
    + (what === 'clip' ? 'if ($k.HistoricalCaptureEnabled -ne 1) { "nohistory"; exit }; ' : '')
    + 'Add-Type -Namespace Capri -Name Keys -MemberDefinition \'[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);\'; '
    + `foreach ($v in 0x5B, 0x12, ${keys}) { [Capri.Keys]::keybd_event($v, 0, 0, [UIntPtr]::Zero) }; Start-Sleep -Milliseconds 80; `
    + `foreach ($v in ${keys}, 0x12, 0x5B) { [Capri.Keys]::keybd_event($v, 0, 2, [UIntPtr]::Zero) }; "ok"`,
  ).catch(() => '');
  const r = out.trim();
  return { ok: r === 'ok', off: r === 'off', noHistory: r === 'nohistory' };
}

module.exports = { outputs, useOutput, mic, radio, usbDrives, eject, brightness, gameBar };
