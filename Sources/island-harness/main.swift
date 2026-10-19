import AVFoundation
import AppKit
import ApplicationServices
import ScreenCaptureKit

// The acceptance harness's helper. It reads what macOS itself knows (the
// Accessibility tree of the island and of other apps, the screens, the
// frontmost app) and drives the real pointer. Every coordinate it prints or
// takes is global, top-left based (the Accessibility and CGEvent space).
// Output is one JSON document on stdout.

setvbuf(stdout, nil, _IOFBF, 1 << 20)

func emit(_ value: Any) {
  let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func fail(_ message: String, code: Int32 = 2) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(code)
}

let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else { fail("usage: island-harness <command> ...") }

func arg(_ i: Int) -> String {
  guard args.count > i else { fail("\(command): missing argument \(i)") }
  return args[i]
}
func num(_ i: Int) -> Double {
  guard let v = Double(arg(i)) else { fail("\(command): argument \(i) is not a number") }
  return v
}

// MARK: Screens

let primaryHeight = NSScreen.screens.first?.frame.height ?? 0

func topLeft(_ r: CGRect) -> CGRect {
  CGRect(x: r.minX, y: primaryHeight - r.maxY, width: r.width, height: r.height)
}
func rectJSON(_ r: CGRect) -> [String: Double] {
  ["x": Double(r.minX), "y": Double(r.minY), "w": Double(r.width), "h": Double(r.height)]
}

func screensJSON() -> [String: Any] {
  var list: [[String: Any]] = []
  var builtIn: [String: Any]?
  for screen in NSScreen.screens {
    let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
    let id = CGDirectDisplayID(number?.uint32Value ?? 0)
    var entry: [String: Any] = [
      "name": screen.localizedName, "frame": rectJSON(topLeft(screen.frame)),
      "builtIn": CGDisplayIsBuiltin(id) != 0, "displayID": Int(id),
    ]
    if let l = screen.auxiliaryTopLeftArea, let r = screen.auxiliaryTopRightArea {
      // The camera housing lies between the two areas macOS reports (taken as
      // relative to the screen unless they already lie on it).
      let f = screen.frame
      let dx = l.minX >= f.minX && r.maxX <= f.maxX ? 0 : f.minX
      let notch = CGRect(
        x: dx + l.maxX, y: f.maxY - max(l.height, r.height),
        width: r.minX - l.maxX, height: max(l.height, r.height))
      entry["notch"] = rectJSON(topLeft(notch))
    }
    entry["menuBarHeight"] = Double(screen.frame.maxY - screen.visibleFrame.maxY)
    if CGDisplayIsBuiltin(id) != 0 { builtIn = entry }
    list.append(entry)
  }
  return ["screens": list, "builtIn": builtIn ?? NSNull()]
}

// MARK: Accessibility

func requireTrust() {
  if !AXIsProcessTrusted() {
    fail("Accessibility permission is needed for the terminal running the tests", code: 3)
  }
}

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
  var value: AnyObject?
  guard AXUIElementCopyAttributeValue(el, name as CFString, &value) == .success else { return nil }
  return value
}

func frameOf(_ el: AXUIElement) -> CGRect? {
  guard let p = attr(el, kAXPositionAttribute), let s = attr(el, kAXSizeAttribute) else {
    return nil
  }
  var point = CGPoint.zero
  var size = CGSize.zero
  AXValueGetValue(p as! AXValue, .cgPoint, &point)
  AXValueGetValue(s as! AXValue, .cgSize, &size)
  return CGRect(origin: point, size: size)
}

func describe(_ el: AXUIElement, depth: Int) -> [String: Any] {
  var d: [String: Any] = ["depth": depth]
  for (key, name) in [
    ("role", kAXRoleAttribute), ("subrole", kAXSubroleAttribute), ("title", kAXTitleAttribute),
    ("description", kAXDescriptionAttribute), ("identifier", kAXIdentifierAttribute),
  ] {
    if let s = attr(el, name) as? String, !s.isEmpty { d[key] = s }
  }
  if let v = attr(el, kAXValueAttribute) {
    if let s = v as? String { d["value"] = s } else if let n = v as? NSNumber { d["value"] = n }
  }
  if let e = attr(el, kAXEnabledAttribute) as? Bool { d["enabled"] = e }
  if let f = frameOf(el) { d["frame"] = rectJSON(f) }
  return d
}

func flatten(_ el: AXUIElement, depth: Int = 0, into out: inout [[String: Any]]) {
  out.append(describe(el, depth: depth))
  guard depth < 40, let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] else {
    return
  }
  for child in children { flatten(child, depth: depth + 1, into: &out) }
}

func appElement(_ pid: pid_t) -> AXUIElement {
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 1.0)
  return app
}

/// The windows of an app and everything drawn in them.
func windowsJSON(_ pid: pid_t) -> [[String: Any]] {
  let app = appElement(pid)
  let windows = (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
  return windows.map { w in
    var elements: [[String: Any]] = []
    flatten(w, into: &elements)
    var entry: [String: Any] = ["elements": elements]
    if let f = frameOf(w) { entry["frame"] = rectJSON(f) }
    if let t = attr(w, kAXTitleAttribute) as? String { entry["title"] = t }
    if let fs = attr(w, "AXFullScreen") as? Bool { entry["fullScreen"] = fs }
    if let m = attr(w, kAXMinimizedAttribute) as? Bool { entry["minimized"] = m }
    if let m = attr(w, kAXMainAttribute) as? Bool { entry["main"] = m }
    return entry
  }
}

/// Open context menus of an app, wherever they hang in its tree (a menu
/// popped up for a view hangs under that view's window), with their items.
func menusJSON(_ pid: pid_t) -> [[String: Any]] {
  var menus: [[String: Any]] = []
  func walk(_ el: AXUIElement, depth: Int) {
    guard depth < 30 else { return }
    let role = attr(el, kAXRoleAttribute) as? String
    if role == "AXMenuBar" { return }
    if role == "AXMenu" {
      var entry = describe(el, depth: depth)
      let items = (attr(el, kAXChildrenAttribute) as? [AXUIElement]) ?? []
      entry["items"] = items.filter { attr($0, kAXRoleAttribute) as? String == "AXMenuItem" }
        .map { item -> [String: Any] in
          var d = describe(item, depth: depth + 1)
          if let hidden = attr(item, "AXHidden") as? Bool { d["hidden"] = hidden }
          return d
        }
      menus.append(entry)
      return
    }
    for child in (attr(el, kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
      walk(child, depth: depth + 1)
    }
  }
  walk(appElement(pid), depth: 0)
  return menus
}

func menuBarJSON(_ pid: pid_t) -> [[String: Any]] {
  let app = appElement(pid)
  guard let bar = attr(app, kAXMenuBarAttribute),
    let items = attr(bar as! AXUIElement, kAXChildrenAttribute) as? [AXUIElement]
  else { return [] }
  return items.map { describe($0, depth: 0) }
}

/// Status items in the menu bar beside the notch, from the processes that
/// draw them (on macOS 26 the system's own come from ControlCenter).
func extrasJSON() -> [[String: Any]] {
  var out: [[String: Any]] = []
  for app in NSWorkspace.shared.runningApplications {
    let el = appElement(app.processIdentifier)
    guard let bar = attr(el, "AXExtrasMenuBar"),
      let items = attr(bar as! AXUIElement, kAXChildrenAttribute) as? [AXUIElement]
    else { continue }
    for item in items {
      var d = describe(item, depth: 0)
      d["owner"] = app.localizedName ?? ""
      d["pid"] = Int(app.processIdentifier)
      out.append(d)
    }
  }
  return out
}

func frontmostJSON() -> [String: Any] {
  guard let app = NSWorkspace.shared.frontmostApplication else { return [:] }
  return [
    "pid": Int(app.processIdentifier), "bundleID": app.bundleIdentifier ?? "",
    "name": app.localizedName ?? "",
  ]
}

// MARK: Pointer

func post(_ type: CGEventType, _ p: CGPoint, _ button: CGMouseButton = .left, clicks: Int64 = 1) {
  guard
    let e = CGEvent(
      mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: button)
  else { fail("could not make a pointer event") }
  e.setIntegerValueField(.mouseEventClickState, value: clicks)
  e.post(tap: .cghidEventTap)
}

func pointer() -> CGPoint {
  CGEvent(source: nil)?.location ?? .zero
}

/// Move the pointer to `p` and make sure it got there: the first event a
/// fresh process posts is sometimes dropped, so the move is checked and sent
/// again until the pointer stands where it should.
func warp(to p: CGPoint, dragging: Bool = false) {
  for _ in 0..<20 {
    post(dragging ? .leftMouseDragged : .mouseMoved, p)
    usleep(4000)
    let now = pointer()
    if abs(now.x - p.x) < 1, abs(now.y - p.y) < 1 { return }
  }
  fail("the pointer would not move to \(p.x), \(p.y)", code: 5)
}

func sleepMs(_ ms: Double) { usleep(useconds_t(max(0, ms) * 1000)) }

/// Glide the pointer to `to` in `steps` steps of `stepMs` each.
func glide(to: CGPoint, steps: Int, stepMs: Double, dragging: Bool = false) {
  let from = pointer()
  let n = max(1, steps)
  for i in 1...n {
    let t = Double(i) / Double(n)
    let p = CGPoint(x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t)
    if i == 1 || i == n {
      warp(to: p, dragging: dragging)
    } else {
      post(dragging ? .leftMouseDragged : .mouseMoved, p)
    }
    sleepMs(stepMs)
  }
}

func scroll(dy: Int32, wheel: Bool) {
  if wheel {
    let e = CGEvent(
      scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)
    e?.setIntegerValueField(.scrollWheelEventIsContinuous, value: 0)
    e?.post(tap: .cghidEventTap)
    return
  }
  // A two-finger scroll: a gesture that begins, changes and ends.
  let steps = 8
  for i in 0...steps {
    let e = CGEvent(
      scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1,
      wheel1: i == steps ? 0 : dy / Int32(steps), wheel2: 0, wheel3: 0)
    e?.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
    let phase: Int64 = i == 0 ? 1 : (i == steps ? 4 : 2)  // began, changed, ended
    e?.setIntegerValueField(.scrollWheelEventScrollPhase, value: phase)
    e?.setIntegerValueField(
      .scrollWheelEventPointDeltaAxis1, value: Int64(i == steps ? 0 : dy / Int32(steps)))
    e?.post(tap: .cghidEventTap)
    sleepMs(12)
  }
}

// MARK: Sampling

func now() -> Double { Date().timeIntervalSince1970 * 1000 }

/// One look at the island: its windows' frames and what is drawn in them.
func islandSample(_ pid: pid_t) -> [String: Any] {
  ["t": now(), "pointer": ["x": pointer().x, "y": pointer().y], "windows": windowsJSON(pid)]
}

// MARK: Movie

func makeMovie(path: String, seconds: Int) {
  let url = URL(fileURLWithPath: path)
  try? FileManager.default.removeItem(at: url)
  guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mov) else {
    fail("cannot write \(path)")
  }
  let width = 640
  let height = 360
  let input = AVAssetWriterInput(
    mediaType: .video,
    outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
    ])
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
    ])
  writer.add(input)
  writer.startWriting()
  writer.startSession(atSourceTime: .zero)
  for frame in 0...seconds {
    while !input.isReadyForMoreMediaData { usleep(1000) }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
    guard let buffer else { fail("no pixel buffer") }
    CVPixelBufferLockBaseAddress(buffer, [])
    let base = CVPixelBufferGetBaseAddress(buffer)!
    let shade = UInt8(40 + (frame * 7) % 60)
    memset(base, Int32(shade), CVPixelBufferGetDataSize(buffer))
    CVPixelBufferUnlockBaseAddress(buffer, [])
    adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: 1))
  }
  input.markAsFinished()
  let done = DispatchSemaphore(value: 0)
  writer.finishWriting { done.signal() }
  done.wait()
  if writer.status != .completed { fail("movie not written: \(String(describing: writer.error))") }
}

// MARK: Captures

func luminance(_ image: CGImage, crop: CGRect) -> (max: Double, mean: Double) {
  guard let part = image.cropping(to: crop) else { return (0, 0) }
  let rep = NSBitmapImageRep(cgImage: part)
  var maxL = 0.0
  var sum = 0.0
  var n = 0.0
  for y in Swift.stride(from: 0, to: rep.pixelsHigh, by: 2) {
    for x in Swift.stride(from: 0, to: rep.pixelsWide, by: 2) {
      guard let c = rep.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) else { continue }
      let l = Double(0.2126 * c.redComponent + 0.7152 * c.greenComponent + 0.0722 * c.blueComponent)
      maxL = max(maxL, l)
      sum += l
      n += 1
    }
  }
  return (maxL, n > 0 ? sum / n : 0)
}

/// capture-check x y w h: show a white backdrop window of our own over the
/// rect (below the menu bar's level), then capture the rect with macOS's own
/// `screencapture` and with ScreenCaptureKit, and report how bright each
/// capture is there. A window kept out of captures over the backdrop leaves
/// it white; one that is captured darkens it.
func captureCheck(_ rect: CGRect, islandPid: Int) -> Never {
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  let appKitRect = CGRect(
    x: rect.minX, y: primaryHeight - rect.maxY, width: rect.width, height: rect.height)
  let backdrop = NSWindow(
    contentRect: appKitRect.insetBy(dx: -20, dy: -20), styleMask: [.borderless],
    backing: .buffered, defer: false)
  backdrop.backgroundColor = .white
  backdrop.level = .floating
  backdrop.ignoresMouseEvents = true
  backdrop.orderFrontRegardless()
  // Any window that is neither ours nor the island's and sits above the
  // backdrop over the rect darkens a capture without the island being in it
  // (a menu-bar app's popover, say). Name them, so the verdict can tell an
  // environment problem from a D110 failure.
  let backdropNumber = backdrop.windowNumber
  func foreignWindows() -> [[String: Any]] {
    let list =
      (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]])
      ?? []
    var found: [[String: Any]] = []
    for info in list {  // front to back
      let number = info[kCGWindowNumber as String] as? Int ?? 0
      if number == backdropNumber { break }
      let pid = info[kCGWindowOwnerPID as String] as? Int ?? 0
      let alpha = info[kCGWindowAlpha as String] as? Double ?? 1
      guard pid != islandPid, pid != Int(getpid()), alpha > 0.01,
        let b = info[kCGWindowBounds as String] as? NSDictionary,
        let r = CGRect(dictionaryRepresentation: b), r.intersects(rect)
      else { continue }
      found.append([
        "owner": info[kCGWindowOwnerName as String] as? String ?? "", "pid": pid,
        "layer": info[kCGWindowLayer as String] as? Int ?? 0, "frame": rectJSON(r),
      ])
    }
    return found
  }
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
    var result: [String: Any] = [:]
    let foreignBefore = foreignWindows()
    let file = NSTemporaryDirectory() + "island-harness-\(getpid()).png"
    let shot = Process()
    shot.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    shot.arguments = ["-x", "-D", "1", file]
    try? shot.run()
    shot.waitUntilExit()
    if let image = NSImage(contentsOfFile: file)?.cgImage(
      forProposedRect: nil, context: nil, hints: nil)
    {
      let scale = Double(image.width) / Double(NSScreen.screens[0].frame.width)
      let crop = CGRect(
        x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale,
        height: rect.height * scale)
      let l = luminance(image, crop: crop)
      result["screencapture"] = ["max": l.max, "mean": l.mean]
    }
    try? FileManager.default.removeItem(atPath: file)
    Task {
      do {
        let content = try await SCShareableContent.excludingDesktopWindows(
          false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() })
        else { fail("no display to capture") }
        let config = SCStreamConfiguration()
        config.width = display.width * 2
        config.height = display.height * 2
        let image = try await SCScreenshotManager.captureImage(
          contentFilter: SCContentFilter(display: display, excludingWindows: []),
          configuration: config)
        let scale = Double(image.width) / Double(display.width)
        let l = luminance(
          image,
          crop: CGRect(
            x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale,
            height: rect.height * scale))
        result["screenCaptureKit"] = ["max": l.max, "mean": l.mean]
      } catch {
        result["screenCaptureKitError"] = "\(error)"
      }
      result["foreignWindows"] = foreignBefore + foreignWindows()
      emit(result)
      exit(0)
    }
  }
  app.run()
  exit(0)
}

// MARK: Commands

switch command {
case "screen":
  emit(screensJSON())
case "frontmost":
  emit(frontmostJSON())
case "pointer":
  let p = pointer()
  emit(["x": p.x, "y": p.y])
case "trusted":
  emit(["trusted": AXIsProcessTrusted()])
case "windows":
  requireTrust()
  emit(["windows": windowsJSON(pid_t(num(1)))])
case "menus":
  requireTrust()
  emit(["menus": menusJSON(pid_t(num(1)))])
case "menubar":
  requireTrust()
  emit(["items": menuBarJSON(pid_t(num(1)))])
case "extras":
  requireTrust()
  emit(["items": extrasJSON()])
case "activate":
  guard let app = NSRunningApplication(processIdentifier: pid_t(num(1))) else {
    fail("no such app")
  }
  app.activate()
  emit(["ok": true])
case "fullscreen":
  // Put an app's front window into fullscreen, as its green button would.
  requireTrust()
  let app = appElement(pid_t(num(1)))
  guard let windows = attr(app, kAXWindowsAttribute) as? [AXUIElement], let w = windows.first
  else { fail("no window to make fullscreen") }
  let r = AXUIElementSetAttributeValue(w, "AXFullScreen" as CFString, kCFBooleanTrue)
  emit(["ok": r == .success])
case "move":
  warp(to: CGPoint(x: num(1), y: num(2)))
  emit(["ok": true])
case "glide":
  // glide x y steps stepMs
  glide(to: CGPoint(x: num(1), y: num(2)), steps: Int(num(3)), stepMs: num(4))
  emit(["ok": true])
case "click":
  // click x y [left|right]
  let p = CGPoint(x: num(1), y: num(2))
  let right = args.count > 3 && args[3] == "right"
  warp(to: p)
  post(right ? .rightMouseDown : .leftMouseDown, p, right ? .right : .left)
  sleepMs(40)
  post(right ? .rightMouseUp : .leftMouseUp, p, right ? .right : .left)
  emit(["ok": true, "t": now()])
case "arrive-and-click":
  // arrive-and-click pid x y steps stepMs sampleMs: glide onto (x, y), click
  // the moment the pointer arrives, then sample the island for a while.
  let pid = pid_t(num(1))
  let p = CGPoint(x: num(2), y: num(3))
  glide(to: p, steps: Int(num(4)), stepMs: num(5))
  post(.leftMouseDown, p)
  let t = now()
  sleepMs(20)
  post(.leftMouseUp, p)
  var samples: [[String: Any]] = []
  let until = t + num(6)
  repeat {
    samples.append(islandSample(pid))
    sleepMs(10)
  } while now() < until
  emit(["clickedAt": t, "samples": samples])
case "key":
  // key keycode: press and release one key (53 is Escape).
  let code = CGKeyCode(num(1))
  CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)?.post(tap: .cghidEventTap)
  CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)?.post(tap: .cghidEventTap)
  emit(["ok": true])
case "cgwindows":
  // The windows on screen now, as the window server lists them.
  let list =
    (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]) ?? []
  emit([
    "windows": list.map { info -> [String: Any] in
      var d: [String: Any] = [
        "owner": info[kCGWindowOwnerName as String] as? String ?? "",
        "pid": info[kCGWindowOwnerPID as String] as? Int ?? 0,
        "layer": info[kCGWindowLayer as String] as? Int ?? 0,
      ]
      if let b = info[kCGWindowBounds as String] as? NSDictionary,
        let r = CGRect(dictionaryRepresentation: b)
      {
        d["frame"] = rectJSON(r)
      }
      return d
    }
  ])
case "region-stats":
  // region-stats x y w h: a real screenshot of the region (macOS's own
  // screencapture), summarised as its brightest and mean luminance, 0...1.
  let file = NSTemporaryDirectory() + "island-harness-\(getpid()).png"
  let shot = Process()
  shot.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
  shot.arguments = ["-x", "-R\(Int(num(1))),\(Int(num(2))),\(Int(num(3))),\(Int(num(4)))", file]
  try? shot.run()
  shot.waitUntilExit()
  guard let data = FileManager.default.contents(atPath: file),
    let rep = NSBitmapImageRep(data: data)
  else { fail("screencapture produced no image (Screen Recording permission?)", code: 4) }
  try? FileManager.default.removeItem(atPath: file)
  var maxL = 0.0
  var sum = 0.0
  var n = 0.0
  for y in Swift.stride(from: 0, to: rep.pixelsHigh, by: 2) {
    for x in Swift.stride(from: 0, to: rep.pixelsWide, by: 2) {
      guard let c = rep.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) else { continue }
      let l = 0.2126 * c.redComponent + 0.7152 * c.greenComponent + 0.0722 * c.blueComponent
      maxL = max(maxL, Double(l))
      sum += Double(l)
      n += 1
    }
  }
  emit(["max": maxL, "mean": n > 0 ? sum / n : 0, "pixels": n])
case "drag":
  // drag x1 y1 x2 y2 steps stepMs [hold]: press at 1, drag to 2, let go
  // (or keep holding when "hold" is given).
  let a = CGPoint(x: num(1), y: num(2))
  warp(to: a)
  sleepMs(30)
  post(.leftMouseDown, a)
  sleepMs(60)
  glide(to: CGPoint(x: num(3), y: num(4)), steps: Int(num(5)), stepMs: num(6), dragging: true)
  if !(args.count > 7 && args[7] == "hold") {
    sleepMs(60)
    post(.leftMouseUp, CGPoint(x: num(3), y: num(4)))
  }
  emit(["ok": true, "t": now()])
case "release":
  post(.leftMouseUp, pointer())
  emit(["ok": true])
case "scroll":
  // scroll dy wheel|trackpad (at the pointer; negative scrolls down)
  scroll(dy: Int32(num(1)), wheel: arg(2) == "wheel")
  emit(["ok": true, "t": now()])
case "watch":
  // watch pid ms everyMs: samples of the island's windows over a while.
  requireTrust()
  let pid = pid_t(num(1))
  let until = now() + num(2)
  var samples: [[String: Any]] = []
  repeat {
    samples.append(islandSample(pid))
    sleepMs(num(3))
  } while now() < until
  emit(["samples": samples])
case "sweep":
  // sweep pid x1 y1 x2 y2 steps stepMs settleMs: glide across while sampling
  // the island at every step, then keep sampling while the pointer rests.
  requireTrust()
  let pid = pid_t(num(1))
  let a = CGPoint(x: num(2), y: num(3))
  let b = CGPoint(x: num(4), y: num(5))
  let steps = Int(num(6))
  warp(to: a)
  sleepMs(50)
  var samples: [[String: Any]] = [islandSample(pid)]
  for i in 1...steps {
    let t = Double(i) / Double(steps)
    post(.mouseMoved, CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t))
    let started = now()
    samples.append(islandSample(pid))
    sleepMs(num(7) - (now() - started))
  }
  let until = now() + num(8)
  while now() < until {
    samples.append(islandSample(pid))
    sleepMs(40)
  }
  emit(["samples": samples])
case "capture-check":
  captureCheck(
    CGRect(x: num(1), y: num(2), width: num(3), height: num(4)), islandPid: Int(num(5)))
case "make-movie":
  makeMovie(path: arg(1), seconds: Int(num(2)))
  emit(["ok": true])
default:
  fail("unknown command \(command)")
}
fflush(stdout)
