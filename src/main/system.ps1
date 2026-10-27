# Her hands on the PC (Windows only), for what you ask her out loud or in her chat: the music
# (play, pause, next...) and the volume (the whole PC's, or one app's). Nothing else: no files,
# no settings, no window contents. (Apps and games: launch.js.)
#
# Started once by system.js and kept running (compiling the audio bits takes a second, every
# call after that is instant). Reads one JSON request per line on stdin, answers one JSON line
# on stdout with the same id:
#
#   {"id":1,"op":"media","action":"toggle"}           -> {"id":1,"ok":true,"playing":{...}}
#   {"id":2,"op":"playing"}                            -> {"id":2,"playing":{title,artist,app,status}}
#   {"id":3,"op":"volume","set":40}                    -> {"id":3,"level":40,"muted":false,"app":""}
#   {"id":4,"op":"volume","app":"spotify","delta":-10} -> one app's own slider in the mixer
#   {"id":5,"op":"sessions"}                           -> the apps making sound right now
#
#   powershell -File system.ps1 <capri pid>

param([int]$ParentPid = 0)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace CapriAudio {
  // Core Audio, the bits needed: the default speakers' volume, and the per-app sessions (the
  // sliders of Windows' volume mixer). Method order matters: it's the COM vtable.
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr notify);
    int UnregisterControlChangeNotify(IntPtr notify);
    int GetChannelCount(out uint count);
    int SetMasterVolumeLevel(float db, ref Guid ctx);
    int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int GetMasterVolumeLevel(out float db);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint channel, float db, ref Guid ctx);
    int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid ctx);
    int GetChannelVolumeLevel(uint channel, out float db);
    int GetChannelVolumeLevelScalar(uint channel, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
  }

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumerator { }

  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr session, int flags, out IntPtr control);
    int GetSimpleAudioVolume(IntPtr session, int flags, out IntPtr volume);
    int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  }

  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl2 session);
  }

  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int GetState(out int state);
    int GetDisplayName(out IntPtr name);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid ctx);
    int GetIconPath(out IntPtr path);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid ctx);
    int GetGroupingParam(out Guid group);
    int SetGroupingParam(ref Guid group, ref Guid ctx);
    int RegisterAudioSessionNotification(IntPtr notify);
    int UnregisterAudioSessionNotification(IntPtr notify);
    int GetSessionIdentifier(out IntPtr id);
    int GetSessionInstanceIdentifier(out IntPtr id);
    int GetProcessId(out uint pid);
    [PreserveSig] int IsSystemSoundsSession();
    int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
  }

  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid ctx);
    int GetMasterVolume(out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  public class Level {
    public int level;
    public bool muted;
    public string app = "";
  }

  public class Session {
    public string name;
    public int level;
    public bool muted;
    public bool active;
  }

  public static class Mixer {
    const int CLSCTX_ALL = 23;
    static Guid none = Guid.Empty;

    static object Activate(Guid iid) {
      var devices = (IMMDeviceEnumerator)new MMDeviceEnumerator();
      IMMDevice speakers;
      Marshal.ThrowExceptionForHR(devices.GetDefaultAudioEndpoint(0 /* render */, 1 /* multimedia */, out speakers));
      object iface;
      Marshal.ThrowExceptionForHR(speakers.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out iface));
      return iface;
    }

    static int Clamp(double v) { return (int)Math.Round(Math.Max(0, Math.Min(100, v))); }

    // set: 0-100 or -1, delta: added to it (or 0), mute: 1, 0, or -1 to leave it
    public static Level Master(int set, int delta, int mute) {
      var vol = (IAudioEndpointVolume)Activate(typeof(IAudioEndpointVolume).GUID);
      float now;
      vol.GetMasterVolumeLevelScalar(out now);
      int level = Clamp(now * 100);
      if (set >= 0) level = Clamp(set);
      if (delta != 0) level = Clamp(level + delta);
      if (set >= 0 || delta != 0) vol.SetMasterVolumeLevelScalar(level / 100f, ref none);
      // turning it up or setting it brings the sound back
      if (mute == 0 || (mute < 0 && (set > 0 || delta > 0))) vol.SetMute(false, ref none);
      if (mute == 1) vol.SetMute(true, ref none);
      bool muted;
      vol.GetMute(out muted);
      return new Level { level = level, muted = muted };
    }

    static IEnumerable<KeyValuePair<string, IAudioSessionControl2>> All() {
      var manager = (IAudioSessionManager2)Activate(typeof(IAudioSessionManager2).GUID);
      IAudioSessionEnumerator sessions;
      Marshal.ThrowExceptionForHR(manager.GetSessionEnumerator(out sessions));
      int count;
      sessions.GetCount(out count);
      for (int i = 0; i < count; i++) {
        IAudioSessionControl2 session;
        if (sessions.GetSession(i, out session) != 0 || session == null) continue;
        if (session.IsSystemSoundsSession() == 0) continue; // S_OK: Windows' own sounds
        uint pid;
        session.GetProcessId(out pid);
        string name = null;
        try { name = Process.GetProcessById((int)pid).ProcessName; } catch { }
        if (name != null) yield return new KeyValuePair<string, IAudioSessionControl2>(name, session);
      }
    }

    // The apps with a slider in the volume mixer; active: making sound right now.
    public static List<Session> Sessions() {
      var list = new List<Session>();
      foreach (var pair in All()) {
        var vol = (ISimpleAudioVolume)pair.Value;
        float level;
        bool muted;
        int state;
        vol.GetMasterVolume(out level);
        vol.GetMute(out muted);
        pair.Value.GetState(out state);
        list.Add(new Session { name = pair.Key, level = Clamp(level * 100), muted = muted, active = state == 1 });
      }
      return list;
    }

    // One app's own slider (all its sessions). Null when it isn't in the mixer.
    public static Level App(string name, int set, int delta, int mute) {
      Level result = null;
      foreach (var pair in All()) {
        if (!string.Equals(pair.Key, name, StringComparison.OrdinalIgnoreCase)) continue;
        var vol = (ISimpleAudioVolume)pair.Value;
        float now;
        vol.GetMasterVolume(out now);
        int level = Clamp(now * 100);
        if (set >= 0) level = Clamp(set);
        if (delta != 0) level = Clamp(level + delta);
        if (set >= 0 || delta != 0) vol.SetMasterVolume(level / 100f, ref none);
        if (mute == 0 || (mute < 0 && (set > 0 || delta > 0))) vol.SetMute(false, ref none);
        if (mute == 1) vol.SetMute(true, ref none);
        bool muted;
        vol.GetMute(out muted);
        result = new Level { level = level, muted = muted, app = pair.Key };
      }
      return result;
    }
  }

  // The keyboard's media keys, for when no app tells Windows what it's playing.
  public static class Keys {
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    public static void Press(byte vk) {
      keybd_event(vk, 0, 1 /* extended */, UIntPtr.Zero);
      keybd_event(vk, 0, 1 | 2 /* key up */, UIntPtr.Zero);
    }
  }
}
"@

# The media sessions Windows knows of (what its own media flyout shows), through WinRT.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  if (-not $task.Wait(3000)) { throw 'media session timed out' }
  $task.Result
}

$script:manager = $null
function MediaSession {
  if (-not $script:manager) {
    $script:manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  }
  $current = $script:manager.GetCurrentSession()
  if ($current) { return $current }
  # none is "current": one that's playing, else any
  $all = @($script:manager.GetSessions())
  $playing = $all | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' } | Select-Object -First 1
  if ($playing) { return $playing }
  $all | Select-Object -First 1
}

function Playing {
  $session = MediaSession
  if (-not $session) { return $null }
  $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  [ordered]@{
    title  = [string]$props.Title
    artist = [string]$props.Artist
    album  = [string]$props.AlbumTitle
    app    = [string]$session.SourceAppUserModelId
    status = [string]$session.GetPlaybackInfo().PlaybackStatus
  }
}

$VK = @{ toggle = 0xB3; play = 0xB3; pause = 0xB3; next = 0xB0; previous = 0xB1; stop = 0xB2 }

function Media([string]$action) {
  $session = MediaSession
  if (-not $session) {
    [CapriAudio.Keys]::Press($VK[$action])
    return [ordered]@{ ok = $true; keys = $true }
  }
  $op = switch ($action) {
    'play' { $session.TryPlayAsync() }
    'pause' { $session.TryPauseAsync() }
    'next' { $session.TrySkipNextAsync() }
    'previous' { $session.TrySkipPreviousAsync() }
    'stop' { $session.TryStopAsync() }
    default { $session.TryTogglePlayPauseAsync() }
  }
  $ok = Await $op ([bool])
  if (-not $ok) { [CapriAudio.Keys]::Press($VK[$action]) } # the app said no: the key, like you'd press it
  Start-Sleep -Milliseconds 350 # the app catching up, so what's playing is the new track
  [ordered]@{ ok = $true; playing = (Playing) }
}

function Handle($req) {
  switch ($req.op) {
    'media' { return Media $req.action }
    'playing' { return [ordered]@{ playing = (Playing) } }
    'volume' {
      $set = if ($null -ne $req.set) { [int]$req.set } else { -1 }
      $delta = if ($null -ne $req.delta) { [int]$req.delta } else { 0 }
      $mute = if ($null -eq $req.mute) { -1 } elseif ($req.mute) { 1 } else { 0 }
      if ($req.app) {
        $level = [CapriAudio.Mixer]::App([string]$req.app, $set, $delta, $mute)
        if (-not $level) { return [ordered]@{ missing = $true } }
        return $level
      }
      return [CapriAudio.Mixer]::Master($set, $delta, $mute)
    }
    'sessions' { return [ordered]@{ sessions = @([CapriAudio.Mixer]::Sessions()) } }
    default { throw "unknown op $($req.op)" }
  }
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break } # Capri closed our stdin: she's gone
  if ($ParentPid -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
  if (-not $line.Trim()) { continue }
  $id = $null
  try {
    $req = $line | ConvertFrom-Json
    $id = $req.id
    $res = Handle $req
    $out = [ordered]@{ id = $id }
    if ($res -is [System.Collections.IDictionary]) { foreach ($k in $res.Keys) { $out[$k] = $res[$k] } }
    elseif ($res) { foreach ($p in $res.PSObject.Properties) { $out[$p.Name] = $p.Value } } # a CapriAudio.Level
  } catch {
    $out = [ordered]@{ id = $id; error = $_.Exception.Message }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 5))
  [Console]::Out.Flush()
}
