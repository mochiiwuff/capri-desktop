# Watches the top-level windows so Capri can sit on them.
# Prints one JSON line whenever something changes: the foreground window and the visible
# windows in z-order (front first), as physical-pixel frame bounds. No titles, no contents.
#
#   powershell -File windows.ps1 <capri hwnd> <capri pid>

param([long]$Self = 0, [int]$ParentPid = 0)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class CapriWindows {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT value, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);

  // Music detection: players we know about and how to strip their window chrome from the track title
  // Returns "source:Artist - Track" or "" when nothing is playing
  public static string GetCurrentTrack() {
    string result = "";
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var titleSb = new StringBuilder(512);
      if (GetWindowText(h, titleSb, 512) == 0) return true;
      string title = titleSb.ToString().Trim();
      if (string.IsNullOrEmpty(title)) return true;

      uint pid = 0;
      GetWindowThreadProcessId(h, out pid);
      string proc = "";
      try { if (pid > 0) proc = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch {}

      // Spotify desktop app: title is "Artist - Song" when playing, "Spotify" when paused/idle
      if (proc == "spotify" && title.Contains(" - ") && title != "Spotify") {
        result = "spotify:" + title;
        return false;
      }

      // YouTube Music in Brave/Chrome/Edge: "Song - Artist - YouTube Music - Brave"
      if ((proc == "brave" || proc == "chrome" || proc == "msedge" || proc == "firefox") && title.Length > 0) {
        // YouTube Music pattern
        int ytmIdx = title.IndexOf("- YouTube Music", System.StringComparison.OrdinalIgnoreCase);
        if (ytmIdx > 0) {
          string track = title.Substring(0, ytmIdx).Trim().TrimEnd('-').Trim();
          if (!string.IsNullOrEmpty(track)) { result = "youtube-music:" + track; return false; }
        }
        // Plain YouTube: "Song Title - YouTube - Brave"
        int ytIdx = title.IndexOf("- YouTube", System.StringComparison.OrdinalIgnoreCase);
        if (ytIdx > 0) {
          string track = title.Substring(0, ytIdx).Trim().TrimEnd('-').Trim();
          if (!string.IsNullOrEmpty(track) && track != "YouTube") { result = "youtube:" + track; return false; }
        }
      }

      // VLC: "Artist - Song - VLC media player"
      if (proc == "vlc" && title.EndsWith("- VLC media player", System.StringComparison.OrdinalIgnoreCase)) {
        string track = title.Substring(0, title.Length - "- VLC media player".Length).Trim().TrimEnd('-').Trim();
        if (!string.IsNullOrEmpty(track) && track != "VLC media player") { result = "vlc:" + track; return false; }
      }

      // AIMP: "Artist - Song - AIMP"
      if (proc == "aimp" && title.Contains(" - ")) {
        string track = title.Replace(" - AIMP", "").Trim();
        if (!string.IsNullOrEmpty(track)) { result = "aimp:" + track; return false; }
      }

      return true;
    }, IntPtr.Zero);
    return result;
  }

  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOOLWINDOW = 0x80;
  const int WS_EX_NOACTIVATE = 0x08000000;
  const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
  const int DWMWA_CLOAKED = 14;

  public static void Init() {
    SetProcessDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: real pixels everywhere
  }

  public static string Snapshot(long self) {
    var sb = new StringBuilder();
    IntPtr fg = GetForegroundWindow();
    var fgClass = new StringBuilder(64);
    GetClassName(fg, fgClass, 64);
    // the taskbar clicked: it comes up over her (Windows has no levels among windows on top)
    bool taskbar = fgClass.ToString() == "Shell_TrayWnd" || fgClass.ToString() == "Shell_SecondaryTrayWnd";

    uint fgPid = 0;
    GetWindowThreadProcessId(fg, out fgPid);
    var fgTitle = new StringBuilder(256);
    GetWindowText(fg, fgTitle, 256);
    string procName = "";
    try {
      if (fgPid > 0) procName = System.Diagnostics.Process.GetProcessById((int)fgPid).ProcessName;
    } catch {}
    string cleanTitle = fgTitle.ToString().Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");

    sb.Append("{\"fg\":").Append(fg.ToInt64())
      .Append(",\"fgProc\":\"").Append(procName.ToLowerInvariant()).Append("\"")
      .Append(",\"fgTitle\":\"").Append(cleanTitle).Append("\"")
      .Append(",\"taskbar\":").Append(taskbar ? "true" : "false").Append(",\"wins\":[");
    int count = 0;
    EnumWindows((h, l) => {
      if (count >= 40) return false;
      if (h.ToInt64() == self || !IsWindowVisible(h) || IsIconic(h)) return true;
      int ex = GetWindowLong(h, GWL_EXSTYLE);
      if ((ex & WS_EX_TOOLWINDOW) != 0 || (ex & WS_EX_NOACTIVATE) != 0) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;
      var cls = new StringBuilder(64);
      GetClassName(h, cls, 64);
      string c = cls.ToString();
      if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return true;
      RECT r;
      if (DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, out r, 16) != 0) return true;
      if (r.Right - r.Left < 200 || r.Bottom - r.Top < 120) return true;
      if (count > 0) sb.Append(',');
      count++;
      sb.Append("{\"id\":").Append(h.ToInt64())
        .Append(",\"x\":").Append(r.Left).Append(",\"y\":").Append(r.Top)
        .Append(",\"w\":").Append(r.Right - r.Left).Append(",\"h\":").Append(r.Bottom - r.Top)
        .Append(",\"max\":").Append(IsZoomed(h) ? "true" : "false").Append('}');
      return true;
    }, IntPtr.Zero);
    sb.Append("]}");
    return sb.ToString();
  }
}
"@

[CapriWindows]::Init()
$last = ''
$lastTrack = ''
$tick = 0
while ($true) {
  $snap = [CapriWindows]::Snapshot($Self)
  if ($snap -ne $last) {
    [Console]::Out.WriteLine($snap)
    [Console]::Out.Flush()
    $last = $snap
  }
  # check for track change every ~5 ticks (750ms)
  if ($tick % 5 -eq 0) {
    $track = [CapriWindows]::GetCurrentTrack()
    if ($track -ne $lastTrack) {
      $safeTrack = $track.Replace('\', '\\').Replace('"', '\"').Replace("`r", '').Replace("`n", ' ')
      [Console]::Out.WriteLine("{""track"":""$safeTrack""}")
      [Console]::Out.Flush()
      $lastTrack = $track
    }
  }
  # stop with Capri, even if she crashed without telling us
  $tick++
  if ($ParentPid -and ($tick % 20 -eq 0) -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 150
}
