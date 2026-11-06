// Capri's helper on macOS: what windows.ps1 and the PowerShell one-liners do on Windows.
//
//   capri-helper watch <capri pid> <overlay window id>
//       One JSON line whenever something changes: the window in front and the visible windows in
//       z-order (front first), as frame bounds in screen points. No contents, and no titles: the
//       title of the window in front is only checked against a short list of AI names for her
//       jealousy, and all that goes out is which of them matched ("ai"), whether it's their own page
//       in a browser ("pages") and whether it's a page to download one ("dl"). Also the game in front
//       ("game"), the USB sticks plugged in ("usb", by volume name) and the last USB device plugged in
//       or out ("plug"). Reads "close <id> <key> <n>" lines on its input: she closes that page.
//   capri-helper apps <capri pid>            the apps open, as JSON
//   capri-helper quit|kill <pid>...          closes them (like ⌘Q), or forces them; prints how many are left
//   capri-helper hide <capri pid> | unhide   every app out of the way, or back
//   capri-helper place <pid> <x> <y> <w> <h> that app's window there (Accessibility)
//   capri-helper activate <pid>              that app in front
//   capri-helper media play|next|previous    the media keys
//   capri-helper lock                        locks the screen
//   capri-helper trusted [prompt]            whether Capri may use Accessibility (and asks if `prompt`)
//
// Built by scripts/build-mac-helper.sh (universal: Apple silicon and Intel).

import Cocoa
import ApplicationServices
import Carbon
import DiskArbitration
import IOKit

setvbuf(stdout, nil, _IOLBF, 0)

// MARK: - output

func json(_ value: Any) -> String {
  guard JSONSerialization.isValidJSONObject(value),
        let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
        let text = String(data: data, encoding: .utf8) else { return "null" }
  return text
}

func emit(_ line: String) {
  FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

func regex(_ pattern: String) -> NSRegularExpression {
  return try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
}

func matches(_ re: NSRegularExpression, _ text: String) -> Bool {
  return re.firstMatch(in: text, options: [], range: NSRange(text.startIndex..., in: text)) != nil
}

// MARK: - other AIs, browsers, games

// A key, what gives them away in the title of the window in front, the name of their own app if
// they have one, and the name their own site gives its pages.
typealias AI = (key: String, title: NSRegularExpression, app: String, site: String)

let AIS: [AI] = [
  ("chatgpt", regex(#"\bChatGPT\b"#), "chatgpt", "ChatGPT"),
  ("claude", regex(#"\bClaude\b"#), "claude", "Claude"),
  ("codex", regex(#"\bCodex\b"#), "codex", "Codex"),
  ("gemini", regex(#"\bGemini\b"#), "gemini", "(?:Google )?Gemini"),
  ("copilot", regex(#"\bCopilot\b"#), "copilot", "(?:Microsoft )?Copilot"),
  ("perplexity", regex(#"\bPerplexity\b"#), "perplexity", "Perplexity"),
  ("deepseek", regex(#"\bDeepSeek\b"#), "", "DeepSeek"),
  ("grok", regex(#"\bGrok\b"#), "grok", "Grok"),
  ("lechat", regex(#"\bLe Chat\b|\bMistral AI\b"#), "le chat", "Le Chat|Mistral AI"),
  ("characterai", regex(#"character\.ai"#), "", #"character\.ai"#),
  ("metaai", regex(#"\bMeta AI\b"#), "", "Meta AI"),
]

// A browser's window title is its tab's ("ChatGPT"), sometimes with its own name after it
// ("ChatGPT — Mozilla Firefox"). Their own pages have their name as a whole part of it, not inside
// a sentence ("ChatGPT is down - YouTube" is no page of theirs).
let SEP = #"(?: [-|:–—·] |: )"#
var siteCache: [String: NSRegularExpression] = [:]
func site(_ ai: AI, _ title: String) -> Bool {
  let re = siteCache[ai.key] ?? regex("(?:^|" + SEP + ")(?:" + ai.site + ")(?:" + SEP + "|$)")
  siteCache[ai.key] = re
  return matches(re, title)
}

// A page to download or install something, in her languages and a few more.
let DL = regex(#"download|t.l.charg|desc.rg|baix(?:ar|e|a|ando)|transf(?:erir|ira|ere)|herunterlad|scaric|install|setup|скач|загруз|установ"#)

func closable(_ ai: AI, _ title: String) -> Bool {
  return site(ai, title) || (matches(ai.title, title) && matches(DL, title))
}

let BROWSER_IDS: [String] = [
  "com.google.Chrome", "com.microsoft.edgemac", "org.mozilla.firefox", "org.mozilla.nightly", "com.brave.Browser",
  "com.operasoftware.Opera", "com.vivaldi.Vivaldi", "company.thebrowser.", "org.chromium.Chromium", "com.apple.Safari",
  "io.gitlab.librewolf", "net.waterfox", "one.ablaze.floorp", "app.zen-browser", "com.kagi.kagimacOS", "org.thorium",
]
let BROWSER_NAMES: Set<String> = [
  "google chrome", "microsoft edge", "firefox", "brave browser", "opera", "opera gx", "vivaldi", "arc", "dia", "chromium",
  "safari", "librewolf", "waterfox", "floorp", "zen", "zen browser", "orion", "thorium",
]

func isBrowser(_ app: NSRunningApplication?) -> Bool {
  guard let app = app else { return false }
  if let id = app.bundleIdentifier, BROWSER_IDS.contains(where: { id.hasPrefix($0) }) { return true }
  return BROWSER_NAMES.contains((app.localizedName ?? "").lowercased())
}

// A game: its program sits in a launcher's library (Steam, Epic, GOG). The game is the name of its
// folder there (the launchers themselves aren't games).
let GAME = regex(#"/(?:steamapps/common|Epic Games|GOG Games|GOG Galaxy/Games)/([^/]+)/"#)
let NOT_GAME = regex(#"launcher|client|redistributable|steamworks"#)

func gameOf(_ app: NSRunningApplication?) -> String? {
  guard let path = (app?.bundleURL ?? app?.executableURL)?.path else { return nil }
  let range = NSRange(path.startIndex..., in: path)
  guard let m = GAME.firstMatch(in: path, options: [], range: range), let r = Range(m.range(at: 1), in: path) else { return nil }
  let name = String(path[r])
  return matches(NOT_GAME, name) ? nil : name
}

// MARK: - windows

struct Win {
  let id: Int
  let pid: pid_t
  let rect: CGRect
  let name: String?
}

// what's never a window to sit on: the system's own pieces
let SYSTEM_OWNERS: Set<String> = [
  "Window Server", "Dock", "SystemUIServer", "Control Center", "Notification Center", "Spotlight",
  "WindowManager", "Screenshot", "screencaptureui", "loginwindow", "TextInputMenuAgent",
]

func windowList(skip overlay: Int) -> [Win] {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
    return []
  }
  var wins: [Win] = []
  for w in list {
    // normal windows, floating ones (always on top) and modal panels; not the Dock, the menu bar, Capri
    let layer = (w[kCGWindowLayer as String] as? Int) ?? 0
    guard layer >= 0 && layer <= 8 else { continue }
    guard let id = w[kCGWindowNumber as String] as? Int, id != overlay,
          let pid = w[kCGWindowOwnerPID as String] as? Int else { continue }
    if let owner = w[kCGWindowOwnerName as String] as? String, SYSTEM_OWNERS.contains(owner) { continue }
    if let alpha = w[kCGWindowAlpha as String] as? Double, alpha < 0.05 { continue }
    guard let b = w[kCGWindowBounds as String] as? [String: Any],
          let rect = CGRect(dictionaryRepresentation: b as CFDictionary) else { continue }
    wins.append(Win(id: id, pid: pid_t(pid), rect: rect, name: w[kCGWindowName as String] as? String))
  }
  return wins
}

// The title of the focused window of app `pid`, through Accessibility (only if Capri may use it).
func axTitle(_ pid: pid_t) -> String? {
  guard AXIsProcessTrusted() else { return nil }
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 0.25)
  var win: CFTypeRef?
  guard AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &win) == .success, let w = win else { return nil }
  var title: CFTypeRef?
  guard AXUIElementCopyAttributeValue(w as! AXUIElement, kAXTitleAttribute as CFString, &title) == .success else { return nil }
  return title as? String
}

// MARK: - USB sticks and devices

let daSession = DASessionCreate(kCFAllocatorDefault)

// USB sticks and SD cards mounted, by volume name (not disk images, not the Mac's own disks).
func usbVolumes() -> [String] {
  guard let session = daSession else { return [] }
  let keys: [URLResourceKey] = [.volumeNameKey]
  let urls = FileManager.default.mountedVolumeURLs(includingResourceValuesForKeys: keys, options: [.skipHiddenVolumes]) ?? []
  var names: [String] = []
  for url in urls {
    guard let disk = DADiskCreateFromVolumePath(kCFAllocatorDefault, session, url as CFURL),
          let desc = DADiskCopyDescription(disk) as? [String: Any] else { continue }
    let proto = (desc[kDADiskDescriptionDeviceProtocolKey as String] as? String) ?? ""
    let isInternal = (desc[kDADiskDescriptionDeviceInternalKey as String] as? Bool) ?? true
    guard (proto == "USB" && !isInternal) || proto.contains("Secure Digital") else { continue }
    let name = (try? url.resourceValues(forKeys: [.volumeNameKey]))?.volumeName
    names.append(name ?? url.lastPathComponent)
  }
  return names.sorted()
}

var usbNow: [String] = []
var usbAt = Date.distantPast

func usb() -> [String] {
  if Date().timeIntervalSince(usbAt) >= 2 {
    usbAt = Date()
    usbNow = usbVolumes()
  }
  return usbNow
}

// Devices plugged in or out (a phone, a controller, a headset...): IOKit tells us; we keep what each
// one is called and what kind of device it is, as Windows would name its class.
struct Device {
  let name: String
  let cls: String
}

var devices: [UInt64: Device] = [:]
var pendingIn: [io_object_t] = []
var pendingOut: [Device] = []
var plugs = 0
var plug: Any = NSNull()
var plugTimer: Timer?

func property(_ service: io_object_t, _ key: String) -> Any? {
  return IORegistryEntryCreateCFProperty(service, key as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue()
}

func describe(_ service: io_object_t) -> Device {
  var name = (property(service, "USB Product Name") as? String) ?? (property(service, "kUSBProductString") as? String) ?? ""
  if name.isEmpty {
    var buf = [CChar](repeating: 0, count: 128)
    if IORegistryEntryGetName(service, &buf) == KERN_SUCCESS { name = String(cString: buf) }
  }
  var interfaces = Set<Int>()
  var iterator: io_iterator_t = 0
  if IORegistryEntryCreateIterator(service, kIOServicePlane, IOOptionBits(kIORegistryIterateRecursively), &iterator) == KERN_SUCCESS {
    var child = IOIteratorNext(iterator)
    while child != 0 {
      if let c = property(child, "bInterfaceClass") as? Int { interfaces.insert(c) }
      IOObjectRelease(child)
      child = IOIteratorNext(iterator)
    }
    IOObjectRelease(iterator)
  }
  let deviceClass = (property(service, "bDeviceClass") as? Int) ?? 0
  var cls = "USB"
  if matches(regex(#"iphone|ipad|android|phone|pixel|galaxy"#), name) { cls = "WPD" }
  else if deviceClass == 9 { cls = "Hub" }
  else if interfaces.contains(1) { cls = "AudioEndpoint" }
  else if interfaces.contains(14) { cls = "Camera" }
  else if interfaces.contains(6) { cls = "Image" }
  else if interfaces.contains(8) { cls = "DiskDrive" }
  else if interfaces.contains(3) { cls = "HIDClass" }
  else if interfaces.contains(0xE0) || deviceClass == 0xE0 { cls = "Bluetooth" }
  return Device(name: name, cls: cls)
}

func entryID(_ service: io_object_t) -> UInt64 {
  var id: UInt64 = 0
  IORegistryEntryGetRegistryEntryID(service, &id)
  return id
}

// The device that says the most about what was plugged: "Galaxy S21" rather than "USB2.0 Hub".
let VAGUE = regex(#"composite|hub|input device|hid|mass storage|generic|virtu|interface|host|bus|port|endpoint|service|receiver|billboard|controller$"#)
func best(_ list: [Device]) -> Device? {
  var top = Int.min
  var found: Device?
  for d in list where !d.name.isEmpty && d.cls != "Hub" {
    var score: Int
    switch d.cls {
    case "WPD": score = 6
    case "AudioEndpoint": score = 5
    case "Camera", "Image": score = 4
    case "HIDClass": score = 3
    case "Bluetooth": score = 2
    default: score = 1
    }
    if matches(VAGUE, d.name) { score -= 4 }
    if score > top { top = score; found = d }
  }
  return found
}

// a phone shows up as several devices, one after the other: once things settle, the best of them
func settle() {
  plugTimer?.invalidate()
  plugTimer = Timer.scheduledTimer(withTimeInterval: 1.2, repeats: false) { _ in
    let added = pendingIn.map { service -> Device in
      let d = describe(service)
      devices[entryID(service)] = d
      IOObjectRelease(service)
      return d
    }
    let removed = pendingOut
    pendingIn = []
    pendingOut = []
    let plugged = !added.isEmpty
    guard let d = best(plugged ? added : removed) else { return }
    plugs += 1
    plug = ["n": plugs, "in": plugged, "name": d.name, "class": d.cls]
  }
}

let deviceAdded: IOServiceMatchingCallback = { _, iterator in
  var service = IOIteratorNext(iterator)
  while service != 0 {
    pendingIn.append(service) // released once looked at
    service = IOIteratorNext(iterator)
  }
  settle()
}

let deviceRemoved: IOServiceMatchingCallback = { _, iterator in
  var service = IOIteratorNext(iterator)
  while service != 0 {
    if let d = devices.removeValue(forKey: entryID(service)) { pendingOut.append(d) }
    IOObjectRelease(service)
    service = IOIteratorNext(iterator)
  }
  if !pendingOut.isEmpty { settle() }
}

func watchDevices() {
  guard let port = IONotificationPortCreate(kIOMainPortDefault) else { return }
  IONotificationPortSetDispatchQueue(port, DispatchQueue.main)
  var added: io_iterator_t = 0
  if IOServiceAddMatchingNotification(port, kIOFirstMatchNotification, IOServiceMatching("IOUSBHostDevice"), deviceAdded, nil, &added) == KERN_SUCCESS {
    // what's already plugged in: known, not news
    var service = IOIteratorNext(added)
    while service != 0 {
      devices[entryID(service)] = describe(service)
      IOObjectRelease(service)
      service = IOIteratorNext(added)
    }
  }
  var removed: io_iterator_t = 0
  if IOServiceAddMatchingNotification(port, kIOTerminatedNotification, IOServiceMatching("IOUSBHostDevice"), deviceRemoved, nil, &removed) == KERN_SUCCESS {
    var service = IOIteratorNext(removed)
    while service != 0 {
      IOObjectRelease(service)
      service = IOIteratorNext(removed)
    }
  }
}

// MARK: - keys

// The key that types `char` on the keyboard layout in use (⌘W is not on the same key in AZERTY),
// else its place on a US keyboard (layouts with no Latin letters use that one for shortcuts).
func keyCode(_ char: String, fallback: CGKeyCode) -> CGKeyCode {
  guard let source = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
        let ptr = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) else { return fallback }
  let data = Unmanaged<CFData>.fromOpaque(ptr).takeUnretainedValue()
  guard let bytes = CFDataGetBytePtr(data) else { return fallback }
  let layout = UnsafeRawPointer(bytes).assumingMemoryBound(to: UCKeyboardLayout.self)
  for modifiers in [UInt32((cmdKey >> 8) & 0xFF), 0] {
    for code in 0..<128 {
      var dead: UInt32 = 0
      var length = 0
      var chars = [UniChar](repeating: 0, count: 4)
      let status = UCKeyTranslate(layout, UInt16(code), UInt16(kUCKeyActionDown), modifiers, UInt32(LMGetKbdType()),
                                  OptionBits(kUCKeyTranslateNoDeadKeysMask), &dead, 4, &length, &chars)
      if status == noErr && length > 0 && String(utf16CodeUnits: chars, count: length).lowercased() == char {
        return CGKeyCode(code)
      }
    }
  }
  return fallback
}

func press(_ code: CGKeyCode, flags: CGEventFlags) {
  let source = CGEventSource(stateID: .hidSystemState)
  for down in [true, false] {
    let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down)
    event?.flags = flags
    event?.post(tap: .cghidEventTap)
  }
}

// The media keys, as if pressed on the keyboard: whatever plays music reacts.
func mediaKey(_ key: Int) -> Bool {
  guard AXIsProcessTrusted() else { return false }
  for down in [true, false] {
    let flags = NSEvent.ModifierFlags(rawValue: down ? 0xa00 : 0xb00)
    let data1 = (key << 16) | ((down ? 0xa : 0xb) << 8)
    let event = NSEvent.otherEvent(with: .systemDefined, location: .zero, modifierFlags: flags, timestamp: 0,
                                   windowNumber: 0, context: nil, subtype: 8, data1: data1, data2: -1)
    event?.cgEvent?.post(tap: .cghidEventTap)
  }
  return true
}

// MARK: - the watch

var capriPid: pid_t = 0
var overlayId = 0
var frontPid: pid_t = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
var lastFg = 0
var lastSnap = ""
var title: String?
var titleOf = 0
var titleAt = Date.distantPast

func front() -> NSRunningApplication? {
  return NSRunningApplication(processIdentifier: frontPid)
}

// The title of the window in front: its name in the window list when macOS gives it (Screen
// Recording allowed), else through Accessibility, looked at twice a second at most.
func frontTitle(_ fg: Win?) -> String {
  guard let fg = fg else { return "" }
  if let name = fg.name, !name.isEmpty { return name }
  if fg.id != titleOf || Date().timeIntervalSince(titleAt) > 0.5 {
    titleOf = fg.id
    titleAt = Date()
    title = axTitle(fg.pid)
  }
  return title ?? ""
}

func snapshot() -> (String, Win?) {
  let wins = windowList(skip: overlayId)
  let app = front()
  // the window in front: the frontmost app's first window (Capri's own overlay when it's her)
  let fg = wins.first { $0.pid == frontPid }
  var fgId = fg?.id ?? 0
  if fg == nil && frontPid == capriPid { fgId = overlayId }
  let t = frontTitle(fg)
  let name = (app?.localizedName ?? "").lowercased()
  let browser = isBrowser(app)
  var keys: [String] = []
  var pages: [String] = []
  for ai in AIS {
    guard matches(ai.title, t) || (!ai.app.isEmpty && name == ai.app) else { continue }
    keys.append(ai.key)
    if browser && site(ai, t) { pages.append(ai.key) }
  }
  let dl = browser && !keys.isEmpty && matches(DL, t)
  var list: [[String: Any]] = []
  for w in wins.prefix(40) {
    if w.rect.width < 200 || w.rect.height < 120 { continue }
    list.append(["id": w.id, "x": Int(w.rect.origin.x), "y": Int(w.rect.origin.y), "w": Int(w.rect.width), "h": Int(w.rect.height), "pid": Int(w.pid)])
  }
  let snap: [String: Any] = [
    "fg": fgId, "fgPid": Int(frontPid), "taskbar": false, "ai": keys, "pages": pages, "dl": dl,
    "game": gameOf(app).map { $0 as Any } ?? NSNull(), "usb": usb(), "plug": plug, "wins": list,
  ]
  return (json(snap), fg)
}

func tick() {
  let (snap, _) = snapshot()
  if snap != lastSnap {
    lastSnap = snap
    emit(snap)
  }
  // stop with Capri, even if she crashed without telling us
  if capriPid > 0 && kill(capriPid, 0) != 0 && errno == ESRCH { exit(0) }
}

// She closes that AI's page in window `id` with the browser's own shortcut for its tab (⌘W), if it
// still is that page, in that window, in front, in a browser, and no Shift, Option or Control is held
// (⌘⇧W would close the whole window). "" once done, else why not.
func closePage(_ id: Int, _ key: String) -> String {
  let wins = windowList(skip: overlayId)
  guard let fg = wins.first(where: { $0.pid == frontPid }), fg.id == id else { return "front" }
  guard isBrowser(front()) else { return "browser" }
  titleAt = Date.distantPast
  guard let ai = AIS.first(where: { $0.key == key }), closable(ai, frontTitle(fg)) else { return "page" }
  let held = CGEventSource.flagsState(.combinedSessionState)
  if !held.intersection([.maskShift, .maskAlternate, .maskControl, .maskCommand]).isEmpty { return "keys" }
  guard AXIsProcessTrusted() else { return "access" }
  press(keyCode("w", fallback: 13), flags: .maskCommand)
  return ""
}

func listenForAsks() {
  Thread.detachNewThread {
    while let line = readLine() {
      let ask = line.split(separator: " ").map(String.init)
      guard ask.count == 4, ask[0] == "close", let id = Int(ask[1]), let n = Int(ask[3]) else { continue }
      DispatchQueue.main.async {
        emit(json(["closed": n, "why": closePage(id, ask[2])]))
      }
    }
    exit(0) // our input closed: Capri is gone
  }
}

func watch() {
  _ = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { note in
    if let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication {
      frontPid = app.processIdentifier
    }
  }
  watchDevices()
  listenForAsks()
  tick()
  Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { _ in
    // the activation notice can be late or missed: the frontmost app as macOS has it now
    if let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier { frontPid = pid }
    tick()
  }
  RunLoop.main.run()
}

// MARK: - one-off commands

// never these: Finder, her (Capri), the AIs she watches and talks through
let KEEP: Set<String> = ["finder", "capri", "electron", "claude", "codex", "ollama", "loginwindow", "dock", "systemuiserver"]

func regularApps(except pid: pid_t) -> [NSRunningApplication] {
  return NSWorkspace.shared.runningApplications.filter {
    $0.activationPolicy == .regular && $0.processIdentifier != pid && $0.processIdentifier != getpid() && !$0.isTerminated
  }
}

func apps(_ skip: pid_t) {
  var out: [[String: Any]] = []
  for app in regularApps(except: skip) {
    let name = app.localizedName ?? app.bundleURL?.deletingPathExtension().lastPathComponent ?? ""
    if name.isEmpty || KEEP.contains(name.lowercased()) { continue }
    out.append(["id": Int(app.processIdentifier), "name": name, "label": name, "bundle": app.bundleIdentifier ?? ""])
  }
  emit(json(out))
}

func spin(_ seconds: Double) {
  RunLoop.main.run(until: Date().addingTimeInterval(seconds))
}

func quit(_ pids: [pid_t], force: Bool) {
  let targets = pids.compactMap { NSRunningApplication(processIdentifier: $0) }
  for app in targets {
    if force { app.forceTerminate() } else { app.terminate() }
  }
  spin(force ? 0.6 : 2.5)
  emit(String(targets.filter { !$0.isTerminated }.count))
}

func place(_ pid: pid_t, _ frame: CGRect) {
  guard AXIsProcessTrusted() else { return emit("access") }
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 1)
  var value: CFTypeRef?
  var win: AXUIElement?
  if AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &value) == .success, let v = value {
    win = (v as! AXUIElement)
  } else if AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value) == .success,
            let list = value as? [AXUIElement], let first = list.first {
    win = first
  }
  guard let w = win else { return emit("none") }
  AXUIElementSetAttributeValue(w, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
  var origin = frame.origin
  var size = frame.size
  if let p = AXValueCreate(.cgPoint, &origin), let s = AXValueCreate(.cgSize, &size) {
    AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, p)
    AXUIElementSetAttributeValue(w, kAXSizeAttribute as CFString, s)
    AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, p) // again, once its size let it get there
  }
  _ = NSRunningApplication(processIdentifier: pid)?.activate(options: [])
  emit("ok")
}

func lockScreen() {
  // what the Apple menu's Lock Screen does
  if let handle = dlopen("/System/Library/PrivateFrameworks/login.framework/Versions/Current/login", RTLD_LAZY),
     let symbol = dlsym(handle, "SACLockScreenImmediate") {
    typealias Lock = @convention(c) () -> Int32
    _ = unsafeBitCast(symbol, to: Lock.self)()
    return emit("ok")
  }
  emit("none")
}

// MARK: - main

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : ""
let number = { (i: Int) -> Int in args.count > i ? (Int(args[i]) ?? 0) : 0 }

switch command {
case "watch":
  capriPid = pid_t(number(2))
  overlayId = number(3)
  watch()
case "apps":
  apps(pid_t(number(2)))
case "quit", "kill":
  quit(args.dropFirst(2).compactMap { Int32($0) }, force: command == "kill")
case "hide":
  for app in regularApps(except: pid_t(number(2))) { _ = app.hide() }
  emit("ok")
case "unhide":
  for app in regularApps(except: 0) { _ = app.unhide() }
  emit("ok")
case "place":
  place(pid_t(number(2)), CGRect(x: number(3), y: number(4), width: number(5), height: number(6)))
case "activate":
  let ok = NSRunningApplication(processIdentifier: pid_t(number(2)))?.activate(options: []) ?? false
  emit(ok ? "ok" : "none")
case "media":
  let keys = ["play": 16, "pause": 16, "next": 17, "previous": 18]
  emit(keys[args.count > 2 ? args[2] : ""].map { mediaKey($0) ? "ok" : "access" } ?? "none")
case "lock":
  lockScreen()
case "trusted":
  let prompt = args.count > 2 && args[2] == "prompt"
  let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary
  emit(json(["trusted": AXIsProcessTrustedWithOptions(options)]))
default:
  FileHandle.standardError.write("usage: capri-helper watch|apps|quit|kill|hide|unhide|place|activate|media|lock|trusted\n".data(using: .utf8)!)
  exit(2)
}
