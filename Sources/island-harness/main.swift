import AVFoundation
import AppKit
import ApplicationServices
import CoreAudio
import HarnessCore
import IOKit
import MediaPlayer
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
    if let f = attr(w, kAXFocusedAttribute) as? Bool { entry["focused"] = f }
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

/// Where the keyboard goes, as Accessibility keeps it for the whole system:
/// the app and the element that have the focus, by process.
func keyboardFocusJSON() -> [String: Any] {
  let system = AXUIElementCreateSystemWide()
  AXUIElementSetMessagingTimeout(system, 1.0)
  func pid(of attribute: String) -> Int {
    guard let el = attr(system, attribute) else { return 0 }
    var p: pid_t = 0
    AXUIElementGetPid(el as! AXUIElement, &p)
    return Int(p)
  }
  return [
    "app": pid(of: kAXFocusedApplicationAttribute),
    "element": pid(of: kAXFocusedUIElementAttribute),
  ]
}

// MARK: Pointer

func post(_ type: CGEventType, _ p: CGPoint, _ button: CGMouseButton = .left, clicks: Int64 = 1) {
  guard
    let e = CGEvent(
      mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: button)
  else { fail("could not make a pointer event") }
  e.setIntegerValueField(.mouseEventClickState, value: clicks)
  postTagged(e)
}

/// Every event the harness posts goes out here, tagged as the harness's own,
/// so the input guard can tell it from the visionary's real input.
func postTagged(_ e: CGEvent) {
  e.setIntegerValueField(.eventSourceUserData, value: InputGuard.tag)
  stampPost()
  e.post(tap: .cghidEventTap)  // tagged-post
}

/// Tell the waiter's input guard, before the event goes out, that the
/// harness is posting one now (InputGuard.msSinceHarnessEvent).
func stampPost() {
  guard let file = ProcessInfo.processInfo.environment[InputGuard.postStampVariable] else {
    return
  }
  try? String(now()).write(toFile: file, atomically: true, encoding: .utf8)
}

/// The last post the harness stamped, if any.
func lastStampedPostMs() -> Double? {
  guard let file = ProcessInfo.processInfo.environment[InputGuard.postStampVariable],
    let text = try? String(contentsOfFile: file, encoding: .utf8)
  else { return nil }
  return Double(text.trimmingCharacters(in: .whitespacesAndNewlines))
}

/// The system-wide left button, as macOS reads it.
func leftButtonDown() -> Bool {
  CGEventSource.buttonState(.combinedSessionState, button: .left)
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
    guard let e else { return }
    e.setIntegerValueField(.scrollWheelEventIsContinuous, value: 0)
    postTagged(e)
    return
  }
  // A two-finger scroll: a gesture that begins, changes and ends.
  let steps = 8
  for i in 0...steps {
    let e = CGEvent(
      scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1,
      wheel1: i == steps ? 0 : dy / Int32(steps), wheel2: 0, wheel3: 0)
    guard let e else { continue }
    e.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
    let phase: Int64 = i == 0 ? 1 : (i == steps ? 4 : 2)  // began, changed, ended
    e.setIntegerValueField(.scrollWheelEventScrollPhase, value: phase)
    e.setIntegerValueField(
      .scrollWheelEventPointDeltaAxis1, value: Int64(i == steps ? 0 : dy / Int32(steps)))
    postTagged(e)
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

func makeMovie(path: String, seconds: Int, withSound: Bool = false) {
  let url = URL(fileURLWithPath: path)
  try? FileManager.default.removeItem(at: url)
  guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mov) else {
    fail("cannot write \(path)")
  }
  // A quiet tone, so players treat the file as one that sounds.
  let rate = 8000.0
  let sound = AVAssetWriterInput(
    mediaType: .audio,
    outputSettings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: rate, AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 16000,
    ])
  if withSound { writer.add(sound) }
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
  var format = AudioStreamBasicDescription(
    mSampleRate: rate, mFormatID: kAudioFormatLinearPCM,
    mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked,
    mBytesPerPacket: 2, mFramesPerPacket: 1, mBytesPerFrame: 2, mChannelsPerFrame: 1,
    mBitsPerChannel: 16, mReserved: 0)
  var description: CMAudioFormatDescription?
  CMAudioFormatDescriptionCreate(
    allocator: nil, asbd: &format, layoutSize: 0, layout: nil, magicCookieSize: 0,
    magicCookie: nil, extensions: nil, formatDescriptionOut: &description)
  let chunk = Int(rate)  // one second per buffer
  /// Append second `second` of the tone; interleaved with the frames.
  func appendSound(_ second: Int) {
    while !sound.isReadyForMoreMediaData { usleep(1000) }
    var samples = [Int16](repeating: 0, count: chunk)
    for i in 0..<chunk {
      samples[i] = Int16(120 * sin(2 * Double.pi * 220 * Double(second * chunk + i) / rate))
    }
    var block: CMBlockBuffer?
    let bytes = chunk * 2
    CMBlockBufferCreateWithMemoryBlock(
      allocator: nil, memoryBlock: nil, blockLength: bytes, blockAllocator: nil,
      customBlockSource: nil, offsetToData: 0, dataLength: bytes, flags: 0,
      blockBufferOut: &block)
    _ = samples.withUnsafeBytes {
      CMBlockBufferReplaceDataBytes(
        with: $0.baseAddress!, blockBuffer: block!, offsetIntoDestination: 0, dataLength: bytes)
    }
    var buffer: CMSampleBuffer?
    CMAudioSampleBufferCreateReadyWithPacketDescriptions(
      allocator: nil, dataBuffer: block!, formatDescription: description!,
      sampleCount: chunk,
      presentationTimeStamp: CMTime(value: CMTimeValue(second * chunk), timescale: Int32(rate)),
      packetDescriptions: nil, sampleBufferOut: &buffer)
    sound.append(buffer!)
  }
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
    if withSound, frame < seconds { appendSound(frame) }
  }
  input.markAsFinished()
  if withSound { sound.markAsFinished() }
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

// MARK: Sharing the Mac

/// The system's idle clock: milliseconds since the last keyboard or pointer
/// input of any kind (IOHIDSystem's HIDIdleTime).
func hidIdleMs() -> Double? {
  let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOHIDSystem"))
  guard service != 0 else { return nil }
  defer { IOObjectRelease(service) }
  guard
    let value = IORegistryEntryCreateCFProperty(
      service, "HIDIdleTime" as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue()
      as? NSNumber
  else { return nil }
  return value.doubleValue / 1e6
}

/// What the waiter needs to know besides input, power and the lid: whether
/// the built-in display sleeps, the screen is locked, the screen saver runs.
func sessionJSON() -> [String: Any] {
  var ids = [CGDirectDisplayID](repeating: 0, count: 16)
  var count: UInt32 = 0
  CGGetOnlineDisplayList(16, &ids, &count)
  let builtIn = ids.prefix(Int(count)).first { CGDisplayIsBuiltin($0) != 0 } ?? CGMainDisplayID()
  let session = (CGSessionCopyCurrentDictionary() as? [String: Any]) ?? [:]
  let saver = NSWorkspace.shared.runningApplications.contains {
    $0.bundleIdentifier == "com.apple.ScreenSaver.Engine"
      || $0.executableURL?.lastPathComponent == "ScreenSaverEngine"
  }
  return [
    "displayAsleep": CGDisplayIsAsleep(builtIn) != 0,
    "locked": (session["CGSSessionScreenIsLocked"] as? Bool) ?? false,
    "onConsole": (session[kCGSessionOnConsoleKey as String] as? Bool) ?? true,
    "screenSaver": saver,
  ]
}

func line(_ value: [String: Any]) {
  emit(value)
  fflush(stdout)
}

/// The input guard's state; globals, as the tap's C callback captures nothing.
var guardTap: CFMachPort?
var guardLastHarnessMs = now()
var guardSawHarness = false

func inputKind(_ type: UInt32) -> String {
  switch type {
  case 10, 11, 12: return "keyboard"
  case 1, 2, 3, 4, 5, 6, 7, 25, 26, 27: return "pointer"
  case 22: return "scroll"
  case 14: return "media or special key"
  default: return "trackpad"
  }
}

func reportRealInput(_ fields: [String: Any]) -> Never {
  var report = fields
  report["real"] = true
  report["t"] = now()
  line(report)
  exit(0)
}

/// input-guard: a listen-only tap on every event of the session. Prints
/// {"ready"} once the tap is up, {"harness"} the first time it sees one of
/// the harness's own tagged events, and {"real", ...} (then exits) the moment
/// it sees keyboard, pointer or trackpad input the harness did not post, or
/// the idle clock shows input no tap could see. Never a key code.
func runInputGuard() -> Never {
  let callback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      if let tap = guardTap { CGEvent.tapEnable(tap: tap, enable: true) }
      return Unmanaged.passUnretained(event)
    }
    let raw = type.rawValue
    var subtype: Int?
    if raw == 14 { subtype = NSEvent(cgEvent: event).map { Int($0.subtype.rawValue) } }
    let userData = event.getIntegerValueField(.eventSourceUserData)
    switch InputGuard.origin(type: raw, userData: userData, subtype: subtype) {
    case .harness:
      guardLastHarnessMs = now()
      if !guardSawHarness {
        guardSawHarness = true
        line(["harness": true, "t": now()])
      }
    case .real:
      reportRealInput([
        "signal": "tap", "type": Int(raw), "kind": inputKind(raw),
        "sourcePid": Int(event.getIntegerValueField(.eventSourceUnixProcessID)),
      ])
    case .notInput:
      break
    }
    return Unmanaged.passUnretained(event)
  }
  guard
    let tap = CGEvent.tapCreate(
      tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
      eventsOfInterest: CGEventMask.max, callback: callback, userInfo: nil)
  else {
    fail("the input guard could not open an event tap (Accessibility or Input Monitoring)", code: 3)
  }
  guardTap = tap
  let source = CFMachPortCreateRunLoopSource(nil, tap, 0)
  CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
  CGEvent.tapEnable(tap: tap, enable: true)
  guardLastHarnessMs = now()
  Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
    guard let idle = hidIdleMs() else { return }
    let since = InputGuard.msSinceHarnessEvent(
      now: now(), lastSeenMs: guardLastHarnessMs, lastPostedMs: lastStampedPostMs())
    if InputGuard.idleShowsRealInput(hidIdleMs: idle, msSinceHarnessEvent: since) {
      reportRealInput(["signal": "idle", "hidIdleMs": idle, "sinceHarnessMs": since])
    }
  }
  line(["ready": true, "t": now()])
  RunLoop.main.run()
  exit(0)
}

// MARK: Commands

switch command {
case "screen":
  emit(screensJSON())
case "frontmost":
  emit(frontmostJSON())
case "keyboardfocus":
  requireTrust()
  emit(keyboardFocusJSON())
case "pointer":
  let p = pointer()
  emit(["x": p.x, "y": p.y])
case "nudge":
  // nudge: a tagged move one point aside and back, so the input guard can
  // show it sees the harness's own events (a move to where the pointer
  // already is never reaches an event tap).
  let p = pointer()
  warp(to: CGPoint(x: p.x + 1, y: p.y))
  warp(to: p)
  emit(["ok": true])
case "idle":
  emit(["idleMs": hidIdleMs().map { $0 as Any } ?? NSNull()])
case "session":
  emit(sessionJSON())
case "input-guard":
  runInputGuard()
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
  for down in [true, false] {
    if let e = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down) { postTagged(e) }
  }
  emit(["ok": true])
case "tree":
  // tree pid: everything under an app's Accessibility element, windows or
  // not (Control Center's module panel is no AXWindow).
  requireTrust()
  var elements: [[String: Any]] = []
  flatten(appElement(pid_t(num(1))), into: &elements)
  emit(["elements": elements])
case "press":
  // press pid identifier-or-description: AXPress the first element under the
  // app whose identifier or description matches (a menu extra, a button).
  requireTrust()
  func find(_ el: AXUIElement, depth: Int) -> AXUIElement? {
    let id = attr(el, kAXIdentifierAttribute) as? String
    let desc = attr(el, kAXDescriptionAttribute) as? String
    if id == arg(2) || desc == arg(2) { return el }
    guard depth < 40, let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] else {
      return nil
    }
    for child in children {
      if let hit = find(child, depth: depth + 1) { return hit }
    }
    return nil
  }
  guard let target = find(appElement(pid_t(num(1))), depth: 0) else {
    fail("nothing named \(arg(2)) under pid \(arg(1))")
  }
  let err = AXUIElementPerformAction(target, kAXPressAction as CFString)
  emit(["ok": err == .success, "error": err.rawValue])
case "text-width":
  // text-width size weight text: the width the text needs on one line in the
  // system font, to tell a drawn title that is cut short from one that fits.
  let weights: [String: NSFont.Weight] = ["regular": .regular, "semibold": .semibold]
  let font = NSFont.systemFont(ofSize: num(1), weight: weights[arg(2)] ?? .regular)
  let width = (arg(3) as NSString).size(withAttributes: [.font: font]).width
  emit(["width": Double(width)])
case "output-device":
  // The system's default audio output, read from Core Audio: its name and
  // whether it is the built-in speakers.
  var device = AudioObjectID(0)
  var size = UInt32(MemoryLayout<AudioObjectID>.size)
  var address = AudioObjectPropertyAddress(
    mSelector: kAudioHardwarePropertyDefaultOutputDevice,
    mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  AudioObjectGetPropertyData(
    AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device)
  var name: Unmanaged<CFString>?
  size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  address.mSelector = kAudioObjectPropertyName
  AudioObjectGetPropertyData(device, &address, 0, nil, &size, &name)
  var transport = UInt32(0)
  size = UInt32(MemoryLayout<UInt32>.size)
  address.mSelector = kAudioDevicePropertyTransportType
  AudioObjectGetPropertyData(device, &address, 0, nil, &size, &transport)
  emit([
    "name": (name?.takeRetainedValue() as String?) ?? "",
    "builtIn": transport == kAudioDeviceTransportTypeBuiltIn,
  ])
case "media-key":
  // media-key play|next|previous: press and release the keyboard's media key,
  // as the key itself sends it (a system-defined event, subtype 8).
  let codes = ["play": 16, "next": 17, "previous": 18]
  guard let code = codes[arg(1)] else { fail("unknown media key \(arg(1))") }
  for down in [true, false] {
    let flags = NSEvent.ModifierFlags(rawValue: down ? 0xA00 : 0xB00)
    let data1 = (code << 16) | (down ? 0xA00 : 0xB00)
    let event = NSEvent.otherEvent(
      with: .systemDefined, location: .zero, modifierFlags: flags, timestamp: 0,
      windowNumber: 0, context: nil, subtype: 8, data1: data1, data2: -1)
    if let e = event?.cgEvent { postTagged(e) }
    sleepMs(30)
  }
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
  // release: let go of the left button and make sure it reads released. The
  // first event a fresh process posts is often dropped, so a move goes first,
  // then the mouse-up, and the button is checked and the pair re-sent until it
  // reads released; failing loudly (exit 6) if it never does.
  if !leftButtonDown() {
    emit(["ok": true, "attempts": 0])
  } else {
    var attempts = 0
    while leftButtonDown() && attempts < 25 {
      attempts += 1
      post(.mouseMoved, pointer())
      usleep(15000)
      post(.leftMouseUp, pointer())
      usleep(30000)
    }
    if leftButtonDown() {
      fail("the left mouse button still reads held after \(attempts) tries", code: 6)
    }
    emit(["ok": true, "attempts": attempts])
  }
case "button":
  // button: whether the left button reads held, system-wide.
  emit(["left": leftButtonDown()])
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
case "motion-watch":
  // motion-watch pid ms everyMs [below=Y] [start=open|close] [looks=ms,ms]
  // [hits=x:y,x:y]: the island's window frames sampled fast for a while,
  // from Accessibility (its AXWindows) and from the window server (the
  // windows it lists for the process), with nothing else read, so a motion
  // is seen frame by frame. With `start`, the moment the part below the
  // strip (a window whose top is at or below Y) first appears (open) or
  // first shrinks (close) is the start, and a full look at the island is
  // taken `looks` ms after it. With `hits`, macOS's own hit test is asked
  // at each point in every sample: which process's element lies there.
  requireTrust()
  let pid = pid_t(num(1))
  let app = appElement(pid)
  let until = now() + num(2)
  var opts: [String: String] = [:]
  for a in args.dropFirst(4) {
    let kv = a.split(separator: "=", maxSplits: 1).map(String.init)
    if kv.count == 2 { opts[kv[0]] = kv[1] }
  }
  let below = Double(opts["below"] ?? "") ?? .infinity
  let mode = opts["start"]
  var pending = (opts["looks"] ?? "").split(separator: ",").compactMap { Double($0) }.sorted()
  let points = (opts["hits"] ?? "").split(separator: ",").compactMap { pair -> CGPoint? in
    let xy = pair.split(separator: ":").compactMap { Double($0) }
    return xy.count == 2 ? CGPoint(x: xy[0], y: xy[1]) : nil
  }
  let system = AXUIElementCreateSystemWide()
  var samples: [[String: Any]] = []
  var looks: [[String: Any]] = []
  var start: Double?
  var tallest = 0.0
  repeat {
    let t0 = now()
    let windows = (attr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
    let frames = windows.compactMap(frameOf)
    let list =
      (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]])
      ?? []
    let cg = list.compactMap { info -> [String: Double]? in
      guard (info[kCGWindowOwnerPID as String] as? Int) == Int(pid),
        let b = info[kCGWindowBounds as String] as? NSDictionary,
        let r = CGRect(dictionaryRepresentation: b)
      else { return nil }
      return rectJSON(r)
    }
    let hits = points.map { p -> Any in
      var element: AXUIElement?
      guard AXUIElementCopyElementAtPosition(system, Float(p.x), Float(p.y), &element) == .success,
        let el = element
      else { return NSNull() }
      var owner: pid_t = 0
      AXUIElementGetPid(el, &owner)
      return Int(owner)
    }
    let t = (t0 + now()) / 2
    samples.append(["t": t, "ax": frames.map(rectJSON), "cg": cg, "hits": hits])
    let bodyHeight = frames.filter { Double($0.minY) >= below - 1 }.map { Double($0.height) }.max()
    if start == nil, let mode {
      if mode == "open", bodyHeight != nil { start = t }
      if mode == "close", let h = bodyHeight ?? (tallest > 0 ? 0 : nil), h < tallest - 0.5 {
        start = t
      }
    }
    tallest = max(tallest, bodyHeight ?? 0)
    if let s = start, let next = pending.first {
      let wait = s + next - now()
      if wait <= num(3) {
        sleepMs(wait)
        looks.append(["at": next, "look": islandSample(pid)])
        pending.removeFirst()
        continue
      }
    }
    sleepMs(num(3) - (now() - t0))
  } while now() < until
  emit(["samples": samples, "start": start.map { $0 as Any } ?? NSNull(), "looks": looks])
case "hit":
  // hit x y: what macOS's own hit test finds at a point: the process whose
  // element lies there, and that element's role and description.
  requireTrust()
  let system = AXUIElementCreateSystemWide()
  var element: AXUIElement?
  let err = AXUIElementCopyElementAtPosition(system, Float(num(1)), Float(num(2)), &element)
  guard err == .success, let el = element else {
    emit(["pid": NSNull(), "error": err.rawValue])
    break
  }
  var pid: pid_t = 0
  AXUIElementGetPid(el, &pid)
  emit(["pid": Int(pid), "element": describe(el, depth: 0)])
case "status-stand-in":
  // status-stand-in seconds title: a status item of the harness's own in the
  // menu bar, right of the notch where macOS puts a new one, that prints
  // {"clicked"} each time it is clicked. Ends after `seconds` or with the
  // run that started it (NOTCH_ISLAND_OWNER_PID).
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  final class Clicks: NSObject {
    @objc func clicked(_ sender: Any?) { line(["clicked": true, "t": now()]) }
  }
  let clicks = Clicks()
  let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  item.button?.title = arg(2)
  item.button?.target = clicks
  item.button?.action = #selector(Clicks.clicked(_:))
  line(["pid": Int(getpid())])
  DispatchQueue.main.asyncAfter(deadline: .now() + num(1)) { exit(0) }
  if let owner = ProcessInfo.processInfo.environment["NOTCH_ISLAND_OWNER_PID"].flatMap(Int32.init) {
    Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
      if kill(owner, 0) != 0 { exit(0) }
    }
  }
  withExtendedLifetime(clicks) { app.run() }
case "capture-check":
  captureCheck(
    CGRect(x: num(1), y: num(2), width: num(3), height: num(4)), islandPid: Int(num(5)))
case "now-playing-stand-in":
  // now-playing-stand-in file seconds: another app on the system's shared
  // now-playing channel, none the island follows. It plays the file quietly
  // and publishes itself as now playing, for `seconds` or until stopped.
  guard let player = try? AVAudioPlayer(contentsOf: URL(fileURLWithPath: arg(1))) else {
    fail("cannot play \(arg(1))")
  }
  player.numberOfLoops = -1
  player.volume = 0.2
  player.play()
  let center = MPNowPlayingInfoCenter.default()
  center.nowPlayingInfo = [
    MPMediaItemPropertyTitle: "notch-island stand-in", MPNowPlayingInfoPropertyPlaybackRate: 1.0,
    MPMediaItemPropertyPlaybackDuration: player.duration,
    MPNowPlayingInfoPropertyElapsedPlaybackTime: 0.0,
  ]
  center.playbackState = .playing
  let commands = MPRemoteCommandCenter.shared()
  _ = commands.playCommand.addTarget { _ in .success }
  _ = commands.pauseCommand.addTarget { _ in .success }
  emit(["ok": true, "pid": Int(getpid())])
  fflush(stdout)
  RunLoop.main.run(until: Date().addingTimeInterval(num(2)))
case "menu-stand-in":
  // menu-stand-in seconds title...: an app of the harness's own, in front,
  // whose menu bar holds its app menu and the given menus, so a scenario
  // knows what the menu bar beside the notch shows. Ends after `seconds`.
  let app = NSApplication.shared
  app.setActivationPolicy(.regular)
  let bar = NSMenu()
  let appItem = NSMenuItem()
  appItem.submenu = NSMenu(title: "stand-in")
  appItem.submenu?.addItem(
    withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
  bar.addItem(appItem)
  for title in args.dropFirst(2) {
    let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    item.submenu = NSMenu(title: title)
    item.submenu?.addItem(withTitle: "Nothing", action: nil, keyEquivalent: "")
    bar.addItem(item)
  }
  app.mainMenu = bar
  line(["pid": Int(getpid())])
  DispatchQueue.main.asyncAfter(deadline: .now() + num(1)) { exit(0) }
  // Opened through LaunchServices it is no child of the test run: it ends
  // with the run that opened it (NOTCH_ISLAND_OWNER_PID), voided or not.
  if let owner = ProcessInfo.processInfo.environment["NOTCH_ISLAND_OWNER_PID"].flatMap(Int32.init) {
    Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
      if kill(owner, 0) != 0 { exit(0) }
    }
  }
  DispatchQueue.main.async { app.activate(ignoringOtherApps: true) }
  app.run()
case "move-window":
  // move-window pid x y: put an app's front window's top-left corner at
  // (x, y), as dragging its title bar would (onto another screen, say).
  requireTrust()
  let app = appElement(pid_t(num(1)))
  guard let windows = attr(app, kAXWindowsAttribute) as? [AXUIElement], let w = windows.first
  else { fail("no window to move") }
  var p = CGPoint(x: num(2), y: num(3))
  let value = AXValueCreate(.cgPoint, &p)!
  let r = AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, value)
  emit(["ok": r == .success, "frame": frameOf(w).map(rectJSON) ?? NSNull()])
case "menu-items":
  // menu-items pid title: the items of one of an app's menu bar menus, read
  // without opening it (an app's own idea of its commands: Pause or Resume).
  requireTrust()
  let app = appElement(pid_t(num(1)))
  guard let bar = attr(app, kAXMenuBarAttribute),
    let items = attr(bar as! AXUIElement, kAXChildrenAttribute) as? [AXUIElement],
    let menuItem = items.first(where: { attr($0, kAXTitleAttribute) as? String == arg(2) }),
    let menu = (attr(menuItem, kAXChildrenAttribute) as? [AXUIElement])?.first,
    let entries = attr(menu, kAXChildrenAttribute) as? [AXUIElement]
  else { fail("no menu \(arg(2)) in the menu bar of \(arg(1))") }
  emit(["items": entries.map { describe($0, depth: 0) }])
case "make-movie":
  // make-movie path seconds [sound]
  makeMovie(path: arg(1), seconds: Int(num(2)), withSound: CommandLine.arguments.count > 4)
  emit(["ok": true])
default:
  fail("unknown command \(command)")
}
fflush(stdout)
