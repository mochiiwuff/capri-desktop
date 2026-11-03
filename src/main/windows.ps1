# Watches the top-level windows so Capri can sit on them.
# Prints one JSON line whenever something changes: the foreground window and the visible
# windows in z-order (front first), as physical-pixel frame bounds. No contents, and no titles:
# the title of the window in front is only checked against a short list of AI names (ChatGPT,
# Gemini...) for her jealousy, and all that goes out is which of them matched ("ai"), whether
# it's their own page in a browser ("pages") and whether it's a page to download one ("dl").
# Reads "close <hwnd> <key> <n>" lines on its input: she closes that page (see Close).
#
#   powershell -File windows.ps1 <capri hwnd> <capri pid>

param([long]$Self = 0, [int]$ParentPid = 0)
$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies System.Management -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

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
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT value, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOOLWINDOW = 0x80;
  const int WS_EX_NOACTIVATE = 0x08000000;
  const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
  const int DWMWA_CLOAKED = 14;

  // Other AIs: a key, what gives them away in the title of the window in front, the name of
  // their own app's program if they have one, and the name their own site gives its pages.
  static readonly string[][] AIS = {
    new[] { "chatgpt", @"\bChatGPT\b", "chatgpt", "ChatGPT" },
    new[] { "claude", @"\bClaude\b", "claude", "Claude" },
    new[] { "codex", @"\bCodex\b", "codex", "Codex" },
    new[] { "gemini", @"\bGemini\b", "", "(?:Google )?Gemini" },
    new[] { "copilot", @"\bCopilot\b", "copilot", "(?:Microsoft )?Copilot" },
    new[] { "perplexity", @"\bPerplexity\b", "perplexity", "Perplexity" },
    new[] { "deepseek", @"\bDeepSeek\b", "", "DeepSeek" },
    new[] { "grok", @"\bGrok\b", "", "Grok" },
    new[] { "lechat", @"\bLe Chat\b|\bMistral AI\b", "", "Le Chat|Mistral AI" },
    new[] { "characterai", @"character\.ai", "", @"character\.ai" },
    new[] { "metaai", @"\bMeta AI\b", "", "Meta AI" },
  };

  // Browsers, by their program's name: there, one of them is a page in a tab, closed with Ctrl+W.
  static readonly HashSet<string> BROWSERS = new HashSet<string> {
    "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "arc", "chromium", "librewolf", "waterfox", "floorp", "zen", "thorium",
  };

  // A browser's title is its tab's, then its own: "ChatGPT - Google Chrome", "Chat - Claude -
  // Personal - Microsoft Edge", "Gemini <em dash> Mozilla Firefox"; Edge adds "and 3 more pages" in
  // your language ("et 3", "e mais 3", "i eshche 3"). Their own pages have their name
  // as a whole part of it, not inside a sentence ("ChatGPT is down - YouTube" is no page of theirs).
  const string SEP = @"(?: [-|:\u2013\u2014] |: |(?: \p{L}{1,5}){1,2} \d+ (?=.*Edge$))";
  public static bool Site(string[] ai, string title) {
    return Regex.IsMatch(title, @"(?:^|" + SEP + @")(?:" + ai[3] + @")(?:" + SEP + @"|$)", RegexOptions.IgnoreCase);
  }

  // A page to download or install something, in her languages (download, install, setup,
  // telecharger, descargar / descargalo, baixar / baixe, transferir / transfira, and the Russian
  // skach-, zagruz-, ustanov-) and in German and Italian (herunterladen, scarica).
  static readonly Regex DL = new Regex(@"download|t.l.charg|desc.rg|baix(?:ar|e|a|ando)|transf(?:erir|ira|ere)|herunterlad|scaric|install|setup|\u0441\u043a\u0430\u0447|\u0437\u0430\u0433\u0440\u0443\u0437|\u0443\u0441\u0442\u0430\u043d\u043e\u0432", RegexOptions.IgnoreCase);

  // That AI's own page, or a page to download it: what she closes.
  public static bool Closable(string[] ai, string title) {
    return Site(ai, title) || (Regex.IsMatch(title, ai[1], RegexOptions.IgnoreCase) && DL.IsMatch(title));
  }

  static IntPtr procOf = IntPtr.Zero;
  static string proc = "";
  static string game = "";

  // A game: its program sits in a launcher's library (Steam, Epic, Riot, Xbox, GOG). The game is the
  // name of its folder there (the launchers themselves aren't games).
  static readonly Regex GAME = new Regex(@"\\(?:steamapps\\common|Epic Games|Riot Games|XboxGames|GOG Galaxy\\Games)\\([^\\]+)\\", RegexOptions.IgnoreCase);
  static readonly Regex NOT_GAME = new Regex(@"launcher|client|redistributable|steamworks", RegexOptions.IgnoreCase);

  static string ProcName(IntPtr hwnd) {
    uint pid;
    GetWindowThreadProcessId(hwnd, out pid);
    try { return System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { return ""; }
  }

  // The program behind the window in front, when it changes: its name, and the game it is, if one.
  static void Program(IntPtr fg) {
    if (fg == procOf) return;
    procOf = fg;
    proc = ProcName(fg);
    game = "";
    uint pid;
    GetWindowThreadProcessId(fg, out pid);
    IntPtr h = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (h == IntPtr.Zero) return;
    var path = new StringBuilder(1024);
    int size = path.Capacity;
    if (QueryFullProcessImageName(h, 0, path, ref size)) {
      var m = GAME.Match(path.ToString());
      if (m.Success && !NOT_GAME.IsMatch(m.Groups[1].Value)) game = m.Groups[1].Value;
    }
    CloseHandle(h);
  }

  static string Json(string s) {
    return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
  }

  // USB sticks (and SD cards) plugged in, by drive letter, looked at every couple of seconds.
  static string usb = "[]";
  static DateTime usbAt = DateTime.MinValue;
  static string Usb() {
    if ((DateTime.Now - usbAt).TotalMilliseconds < 2000) return usb;
    usbAt = DateTime.Now;
    var letters = new StringBuilder();
    try {
      foreach (var d in System.IO.DriveInfo.GetDrives()) {
        if (d.DriveType != System.IO.DriveType.Removable || !d.IsReady) continue;
        if (letters.Length > 0) letters.Append(',');
        letters.Append(Json(d.Name.Substring(0, 1)));
      }
    } catch {}
    usb = "[" + letters.ToString() + "]";
    return usb;
  }

  // Which of them the window in front is, as a JSON list of keys; in a browser, then "pages": the
  // ones whose own page it is, and "dl": whether it's a page to download one of them.
  static string Ai(IntPtr fg) {
    var title = new StringBuilder(512);
    GetWindowText(fg, title, 512);
    Program(fg);
    string t = title.ToString();
    bool browser = BROWSERS.Contains(proc);
    var keys = new StringBuilder();
    var pages = new StringBuilder();
    foreach (var ai in AIS) {
      if (!Regex.IsMatch(t, ai[1], RegexOptions.IgnoreCase) && (ai[2] == "" || proc != ai[2])) continue;
      if (keys.Length > 0) keys.Append(',');
      keys.Append('"').Append(ai[0]).Append('"');
      if (!browser || !Site(ai, t)) continue;
      if (pages.Length > 0) pages.Append(',');
      pages.Append('"').Append(ai[0]).Append('"');
    }
    bool dl = browser && keys.Length > 0 && DL.IsMatch(t);
    return "[" + keys.ToString() + "],\"pages\":[" + pages.ToString() + "],\"dl\":" + (dl ? "true" : "false");
  }

  // She closes that AI's page in window `id` with the browser's own shortcut for its tab (Ctrl+W),
  // if it still is that page, in that window, in front, in a browser, and no Shift, Alt or Windows
  // key is held (Ctrl+Shift+W would close the whole window). "" once done, else why not.
  public static string Close(long id, string key) {
    IntPtr fg = GetForegroundWindow();
    if (fg.ToInt64() != id) return "front";
    if (!BROWSERS.Contains(ProcName(fg))) return "browser";
    var title = new StringBuilder(512);
    GetWindowText(fg, title, 512);
    string[] ai = Array.Find(AIS, a => a[0] == key);
    if (ai == null || !Closable(ai, title.ToString())) return "page";
    foreach (int held in new[] { 0x10, 0x12, 0x5B, 0x5C }) {
      if ((GetAsyncKeyState(held) & 0x8000) != 0) return "keys";
    }
    keybd_event(0x11, 0, 0, UIntPtr.Zero); // Ctrl
    keybd_event(0x57, 0, 0, UIntPtr.Zero); // W
    keybd_event(0x57, 0, 2, UIntPtr.Zero); // KEYEVENTF_KEYUP
    keybd_event(0x11, 0, 2, UIntPtr.Zero);
    return "";
  }

  // What Capri asks, one line at a time on our input, each answered with a line of its own.
  public static void Listen() {
    var reader = new System.Threading.Thread(() => {
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        var ask = line.Split(' ');
        if (ask.Length != 4 || ask[0] != "close") continue;
        string why;
        long id;
        int n;
        if (!long.TryParse(ask[1], out id) || !int.TryParse(ask[3], out n)) continue;
        try { why = Close(id, ask[2]); } catch { why = "error"; }
        Console.Out.WriteLine("{\"closed\":" + n + ",\"why\":" + Json(why) + "}");
        Console.Out.Flush();
      }
    });
    reader.IsBackground = true;
    reader.Start();
  }

  public static void Init() {
    SetProcessDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: real pixels everywhere
    try { WatchDevices(); } catch {}
  }

  // Devices plugged in or out (a phone, a controller, a headset...). Windows says something
  // changed; we list the devices again and see what's new or gone.
  static Dictionary<string, string[]> devices;
  static int plugs = 0;
  static string plug = "null";
  static readonly object gate = new object();

  static Dictionary<string, string[]> Devices() {
    var all = new Dictionary<string, string[]>();
    using (var q = new ManagementObjectSearcher("SELECT DeviceID, Name, PNPClass FROM Win32_PnPEntity")) {
      foreach (ManagementBaseObject d in q.Get()) {
        var id = d["DeviceID"] as string;
        if (id != null) all[id] = new[] { (d["Name"] as string) ?? "", (d["PNPClass"] as string) ?? "" };
      }
    }
    return all;
  }

  static void WatchDevices() {
    devices = Devices();
    var watcher = new ManagementEventWatcher(new WqlEventQuery("SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 2 OR EventType = 3"));
    watcher.EventArrived += (s, e) => {
      try { Changed(); } catch {} // never take the whole helper down over a device
    };
    watcher.Start();
  }

  static void Changed() {
    System.Threading.Thread.Sleep(1200); // a phone shows up as several devices, one after the other
    lock (gate) {
      var now = Devices();
      var added = new List<string[]>();
      var removed = new List<string[]>();
      foreach (var d in now) if (!devices.ContainsKey(d.Key)) added.Add(d.Value);
      foreach (var d in devices) if (!now.ContainsKey(d.Key)) removed.Add(d.Value);
      devices = now;
      bool plugged = added.Count > 0;
      var best = Best(plugged ? added : removed);
      if (best == null) return;
      plugs++;
      plug = "{\"n\":" + plugs + ",\"in\":" + (plugged ? "true" : "false") + ",\"name\":" + Json(best[0]) + ",\"class\":" + Json(best[1]) + "}";
    }
  }

  // The device that says the most about what was plugged: "Galaxy S21" rather than "USB Composite Device".
  static readonly Regex VAGUE = new Regex(@"composite|hub|concentrateur|input device|hid|mass storage|stockage|g.n.ri|virtu|num.rat|interface|host|h.te|bus|port|endpoint|service|profil|protocol|p.riph.rique|dispositivo", RegexOptions.IgnoreCase); // ASCII only: PowerShell reads this file as ANSI
  public static string[] Best(List<string[]> list) {
    string[] best = null;
    int top = int.MinValue;
    foreach (var d in list) {
      if (d[0] == "") continue;
      int score = d[1] == "WPD" ? 6 : d[1] == "AudioEndpoint" ? 5 : d[1] == "Camera" || d[1] == "Image" ? 4 : d[1] == "HIDClass" || d[1] == "Keyboard" || d[1] == "Mouse" ? 3 : d[1] == "Bluetooth" ? 2 : 1;
      if (VAGUE.IsMatch(d[0])) score -= 4;
      if (score > top) { top = score; best = d; }
    }
    return best;
  }

  public static string Snapshot(long self) {
    var sb = new StringBuilder();
    IntPtr fg = GetForegroundWindow();
    var fgClass = new StringBuilder(64);
    GetClassName(fg, fgClass, 64);
    // the taskbar clicked: it comes up over her (Windows has no levels among windows on top)
    bool taskbar = fgClass.ToString() == "Shell_TrayWnd" || fgClass.ToString() == "Shell_SecondaryTrayWnd";
    sb.Append("{\"fg\":").Append(fg.ToInt64()).Append(",\"taskbar\":").Append(taskbar ? "true" : "false")
      .Append(",\"ai\":").Append(Ai(fg))
      .Append(",\"game\":").Append(game == "" ? "null" : Json(game))
      .Append(",\"usb\":").Append(Usb());
    lock (gate) sb.Append(",\"plug\":").Append(plug);
    sb.Append(",\"wins\":[");
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
[CapriWindows]::Listen()
$last = ''
$tick = 0
while ($true) {
  $snap = [CapriWindows]::Snapshot($Self)
  if ($snap -ne $last) {
    [Console]::Out.WriteLine($snap)
    [Console]::Out.Flush()
    $last = $snap
  }
  # stop with Capri, even if she crashed without telling us
  $tick++
  if ($ParentPid -and ($tick % 20 -eq 0) -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 150
}
