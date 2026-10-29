// Small macOS adapter. Window metadata only: no screenshots, titles, or window contents.
import AppKit
import ApplicationServices

func emitJSON(_ data: Data) {
    guard let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

func emit(_ value: Any) {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
    emitJSON(data)
}

let protectedNames: Set<String> = [
    "finder", "dock", "systemuiserver", "windowmanager", "loginwindow",
    "capri", "electron", "claude", "codex", "ollama", "ollama app"
]
func closable(_ app: NSRunningApplication) -> Bool {
    app.activationPolicy == .regular && !app.isTerminated
        && !protectedNames.contains((app.localizedName ?? "").lowercased())
        && app.bundleIdentifier != nil
}

func runningApps() -> [[String: Any]] {
    var grouped: [String: [NSRunningApplication]] = [:]
    for app in NSWorkspace.shared.runningApplications where closable(app) {
        grouped[app.bundleIdentifier!, default: []].append(app)
    }
    return grouped.keys.sorted().map { id in
        let apps = grouped[id]!
        let name = apps[0].localizedName ?? id
        return ["name": name, "label": name, "process": id, "ids": apps.map { $0.processIdentifier }]
    }
}

func installedApps() -> [[String: String]] {
    let fm = FileManager.default
    let roots = ["/Applications", "/System/Applications", NSHomeDirectory() + "/Applications"]
    var result: [[String: String]] = []
    for root in roots {
        guard let files = fm.enumerator(at: URL(fileURLWithPath: root),
            includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { continue }
        for case let url as URL in files {
            // Applications and their category folders; never traverse arbitrary deep trees.
            if files.level > 3 { files.skipDescendants(); continue }
            guard url.pathExtension == "app", let bundle = Bundle(url: url) else { continue }
            let name = bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
                ?? bundle.object(forInfoDictionaryKey: "CFBundleName") as? String
                ?? url.deletingPathExtension().lastPathComponent
            result.append(["name": name, "kind": "app", "id": url.path])
        }
    }
    return result
}

func snapshot(excluding windowID: Int) -> [String: Any] {
    let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
        as? [[String: Any]] ?? []
    let frontPID = NSWorkspace.shared.frontmostApplication?.processIdentifier
    // Display geometry is shared by every window in this snapshot.
    let displays = NSScreen.screens.map { screen -> (bounds: CGRect, workHeight: CGFloat) in
        let id = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID ?? 0
        return (CGDisplayBounds(id), screen.visibleFrame.height)
    }
    var foreground = 0
    var windows: [[String: Any]] = []
    for row in rows {
        guard let id = row[kCGWindowNumber as String] as? Int, id != windowID,
              let layer = row[kCGWindowLayer as String] as? Int, layer == 0,
              let alpha = row[kCGWindowAlpha as String] as? Double, alpha > 0,
              let bounds = row[kCGWindowBounds as String] as? NSDictionary,
              let rect = CGRect(dictionaryRepresentation: bounds), rect.width >= 200, rect.height >= 120 else { continue }
        if foreground == 0, row[kCGWindowOwnerPID as String] as? Int32 == frontPID { foreground = id }
        // Quartz and Electron both use logical points with a top-left primary-display origin.
        let maximized = displays.contains { display in
            let full = display.bounds
            return abs(rect.minX - full.minX) < 2 && abs(rect.width - full.width) < 2
                && rect.height >= display.workHeight - 2
        }
        windows.append(["id": id, "x": rect.minX, "y": rect.minY,
                        "w": rect.width, "h": rect.height, "max": maximized])
        if windows.count >= 40 { break }
    }
    return ["fg": foreground, "frontPid": frontPID ?? 0, "wins": windows]
}

func restoreFocus(owner: Int32, previous: Int32) {
    // A dismissed text panel returns to the previous app, unless the user already switched.
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == owner,
          previous != owner, let target = NSRunningApplication(processIdentifier: previous),
          target.activationPolicy == .regular, !target.isTerminated else {
        emit(["ok": false]); return
    }
    emit(["ok": target.activate(options: [.activateIgnoringOtherApps])])
}

func watch(windowID: Int, parent: Int32) {
    var previous = Data()
    while kill(parent, 0) == 0 {
        autoreleasepool {
            let value = snapshot(excluding: windowID)
            if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), data != previous {
                emitJSON(data)
                previous = data
            }
        }
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.15))
    }
}

func closeApp(_ id: String, force: Bool) {
    let apps = NSRunningApplication.runningApplications(withBundleIdentifier: id).filter(closable)
    for app in apps {
        if force { app.forceTerminate() } else { app.terminate() }
    }
    // Normal termination lets the target app ask to save unsaved work.
    RunLoop.current.run(until: Date(timeIntervalSinceNow: force ? 0.6 : 2.5))
    emit(["running": !NSRunningApplication.runningApplications(withBundleIdentifier: id).isEmpty])
}

func media(_ action: String) {
    let keys: [String: Int] = ["play": 16, "pause": 16, "next": 17, "previous": 18,
                               "volup": 0, "voldown": 1, "mute": 7]
    guard let key = keys[action] else { emit(["ok": false]); return }
    // Request access only when the user actually asks to control media.
    let prompt = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    guard AXIsProcessTrustedWithOptions(prompt) else {
        emit(["ok": false, "error": "accessibility"]); return
    }
    for _ in 0..<(action == "volup" || action == "voldown" ? 5 : 1) {
        for state in [0xA, 0xB] {
            let event = NSEvent.otherEvent(with: .systemDefined, location: .zero,
                modifierFlags: NSEvent.ModifierFlags(rawValue: UInt(state << 8)),
                timestamp: 0, windowNumber: 0, context: nil, subtype: 8,
                data1: (key << 16) | (state << 8), data2: -1)
            event?.cgEvent?.post(tap: .cghidEventTap)
        }
    }
    emit(["ok": true])
}

let args = Array(CommandLine.arguments.dropFirst())
switch args.first {
case "watch" where args.count == 3:
    if let id = Int(args[1]), let parent = Int32(args[2]), parent > 0 { watch(windowID: id, parent: parent) }
case "snapshot": emit(snapshot(excluding: Int(args.dropFirst().first ?? "0") ?? 0))
case "apps": emit(runningApps())
case "installed": emit(installedApps())
case "restore-focus" where args.count == 3:
    if let owner = Int32(args[1]), let previous = Int32(args[2]), owner > 0, previous > 0 {
        restoreFocus(owner: owner, previous: previous)
    }
case "close" where args.count == 3: closeApp(args[1], force: args[2] == "force")
case "media" where args.count == 2: media(args[1])
default:
    fputs("Unknown Capri helper command\n", stderr)
    exit(1)
}
