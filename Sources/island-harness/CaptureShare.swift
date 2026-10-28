import AVFoundation
import AppKit
import CoreImage
import ScreenCaptureKit

// P6's explicitly mapped capture proxy and native-recording decoder. The display filter excludes no windows. Keep an
// actual SCK stream alive across the user's action; inspect its delivered
// frame as well as a screencapture shot. The two-colour, normally shared
// windows are in the measured rect, below the island and above the menu bar.
@MainActor
final class CaptureShare: NSObject, @preconcurrency SCStreamOutput, @preconcurrency SCStreamDelegate
{
  let directory: URL
  let notch: CGRect
  var stream: SCStream?
  var display: SCDisplay?
  var latest: CGImage?
  var frameTime: UInt64 = 0
  var serial = 0
  var tick = 0
  var ticks: [Int: Double] = [:]
  var watching: String?
  var began = 0.0
  var frames: [[String: Any]] = []
  var overflow = false

  // SCStreamFrameInfo.displayTime is mach absolute time, when the window
  // server displayed the frame, NOT the time our callback finally ran.
  func seconds(_ time: UInt64) -> Double {
    var info = mach_timebase_info_data_t()
    mach_timebase_info(&info)
    return Double(time) * Double(info.numer) / Double(info.denom) / 1_000_000_000
  }
  var now: Double { seconds(mach_absolute_time()) }

  func region(_ kind: String) -> CGRect {
    // Covers the complete opening motion, including overshoot. Only capture
    // presence is compared; no assertion about the island's visual styling.
    kind == "wing"
      ? CGRect(x: notch.minX - 140, y: notch.minY, width: 140, height: notch.height)
      : CGRect(x: notch.midX - 238, y: notch.maxY, width: 476, height: 185)
  }

  func pulse() {
    tick += 1
    ticks[tick] = now
    for window in controls.values {
      (window.contentView as? CaptureControl)?.tick = tick
      window.contentView?.display()
    }
  }
  var baseline: [String: CGImage] = [:]
  var controls: [String: NSWindow] = [:]
  var controlRects: [String: CGRect] = [:]
  var busy = false
  var stopping = false
  let context = CIContext()

  init(directory: URL, notch: CGRect) {
    self.directory = directory
    self.notch = notch
  }

  func stream(
    _ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
    of type: SCStreamOutputType
  ) {
    guard type == .screen, sampleBuffer.isValid,
      let attachments = CMSampleBufferGetSampleAttachmentsArray(
        sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
      let status = attachments.first?[.status] as? Int,
      status == SCFrameStatus.complete.rawValue,
      let timestamp = attachments.first?[.displayTime] as? UInt64,
      timestamp > frameTime,
      let buffer = CMSampleBufferGetImageBuffer(sampleBuffer)
    else { return }
    let image = CIImage(cvPixelBuffer: buffer)
    latest = context.createCGImage(image, from: image.extent)
    frameTime = timestamp
    serial += 1
    if let kind = watching, seconds(timestamp) >= began, let latest {
      if frames.count >= 1800 || now - began > 30 {
        overflow = true
        return
      }
      var frame = measurement(latest, kind, baseline["screenCaptureKit"])
      frame["captured"] = seconds(timestamp)
      frame["id"] = serial
      if let marker = markerTime(latest, kind), abs(marker - seconds(timestamp)) < 0.3 {
        frame["marker"] = marker
      } else {
        frame["control"] = 0.0
      }
      frames.append(frame)
    }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    write("error.json", ["error": "SCK stream stopped: \(error)"])
    exit(2)
  }

  func write(_ name: String, _ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    try! data.write(to: directory.appendingPathComponent(name), options: .atomic)
  }

  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(
      false, onScreenWindowsOnly: true)
    guard let display = content.displays.first(where: { CGDisplayIsBuiltin($0.displayID) != 0 })
    else { throw NSError(domain: "no built-in display", code: 1) }
    self.display = display
    let config = SCStreamConfiguration()
    config.width = display.width * 2
    config.height = display.height * 2
    config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
    config.queueDepth = 3
    config.showsCursor = false
    let stream = SCStream(
      filter: SCContentFilter(display: display, excludingWindows: []),
      configuration: config, delegate: self)
    self.stream = stream
    try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: .main)
    try await stream.startCapture()
    for (name, rect) in [
      "wing": CGRect(x: notch.minX - 100, y: notch.minY + 7, width: 32, height: 24),
      "panel": CGRect(x: notch.midX - 200, y: notch.maxY + 30, width: 32, height: 24),
    ] {
      let window = NSWindow(
        contentRect: CGRect(
          x: rect.minX, y: primaryHeight - rect.maxY, width: rect.width, height: rect.height),
        styleMask: [.borderless], backing: .buffered, defer: false)
      window.backgroundColor = .clear
      window.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 2)
      window.sharingType = .readOnly
      window.ignoresMouseEvents = true
      window.hasShadow = false
      window.contentView = CaptureControl(frame: CGRect(x: 0, y: 0, width: 32, height: 24))
      window.orderFrontRegardless()
      controls[name] = window
      controlRects[name] = rect
    }
    pulse()
    Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.pulse() }
    }
    write("ready.json", ["pid": Int(getpid()), "streamStarted": true])
  }

  func stop() async {
    if stopping { return }
    stopping = true
    try? await stream?.stopCapture()
    for window in controls.values { window.orderOut(nil) }
    write("stopped.json", ["streamStopped": true, "controlsClosed": true])
    exit(0)
  }

  func images() async throws -> [String: CGImage] {
    // Change the control by less than the pixel tolerance to force a complete
    // frame AFTER this request. An old closed-island frame proves nothing.
    let requested = mach_absolute_time()
    pulse()
    let end = Date().addingTimeInterval(3)
    while latest == nil || frameTime <= requested {
      if Date() > end { throw NSError(domain: "SCK supplied no fresh complete frame", code: 2) }
      try await Task.sleep(nanoseconds: 20_000_000)
    }
    let screenIndex =
      NSScreen.screens.firstIndex { screen in
        let id = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
        return id?.uint32Value == display?.displayID
      } ?? 0
    guard let image = displayScreenshot(screenIndex + 1), let latest else {
      throw NSError(domain: "screencapture supplied no image", code: 3)
    }
    return ["screencapture": image, "screenCaptureKit": latest]
  }

  func pixels(_ image: CGImage, _ rect: CGRect) -> NSBitmapImageRep? {
    guard let display else { return nil }
    let scale = Double(image.width) / Double(display.width)
    let crop = CGRect(
      x: (rect.minX - display.frame.minX) * scale,
      y: (rect.minY - display.frame.minY) * scale,
      width: rect.width * scale, height: rect.height * scale)
    return image.cropping(to: crop).map { NSBitmapImageRep(cgImage: $0) }
  }

  func controlScore(_ image: CGImage, _ rect: CGRect) -> Double {
    let colours = CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: 16)
    guard let rep = pixels(image, colours) else { return 0 }
    var correct = 0.0
    var total = 0.0
    for y in 2..<(rep.pixelsHigh - 2) {
      for x in 2..<(rep.pixelsWide - 2) {
        // Omit the colour boundary's antialiasing pixels.
        if abs(x - rep.pixelsWide / 2) <= 2 { continue }
        guard let c = rep.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) else { continue }
        let left = x < rep.pixelsWide / 2
        if left
          ? (c.greenComponent > 0.85 && c.redComponent < 0.15 && c.blueComponent < 0.15)
          : (c.redComponent > 0.85 && c.blueComponent > 0.85 && c.greenComponent < 0.15)
        {
          correct += 1
        }
        total += 1
      }
    }
    return total > 0 ? correct / total : 0
  }

  func difference(_ a: CGImage, _ b: CGImage, _ rect: CGRect, _ control: CGRect) -> Double {
    guard let first = pixels(a, rect), let second = pixels(b, rect),
      first.pixelsWide == second.pixelsWide, first.pixelsHigh == second.pixelsHigh
    else { return 1 }
    var changed = 0.0
    var total = 0.0
    for y in stride(from: 0, to: first.pixelsHigh, by: 2) {
      for x in stride(from: 0, to: first.pixelsWide, by: 2) {
        let point = CGPoint(
          x: rect.minX + Double(x) / Double(first.pixelsWide) * rect.width,
          y: rect.minY + Double(y) / Double(first.pixelsHigh) * rect.height)
        // The timestamp changes on purpose; its two-colour presence and code
        // are checked separately in every frame.
        if control.insetBy(dx: -1, dy: -1).contains(point) { continue }
        guard let c = first.colorAt(x: x, y: y)?.usingColorSpace(.sRGB),
          let d = second.colorAt(x: x, y: y)?.usingColorSpace(.sRGB)
        else { return 1 }
        if max(
          abs(c.redComponent - d.redComponent), abs(c.greenComponent - d.greenComponent),
          abs(c.blueComponent - d.blueComponent)) > 0.08
        {
          changed += 1
        }
        total += 1
      }
    }
    return total > 0 ? changed / total : 1
  }

  func measurement(_ image: CGImage, _ kind: String, _ plain: CGImage?) -> [String: Any] {
    guard let plain, let control = controlRects[kind] else { return ["control": 0] }
    return [
      "control": controlScore(image, control), "baselineControl": controlScore(plain, control),
      "changedFraction": difference(plain, image, region(kind), control),
    ]
  }

  func markerTime(_ image: CGImage, _ kind: String) -> Double? {
    guard let rect = controlRects[kind], let rep = pixels(image, rect) else { return nil }
    var value = 0
    for bit in 0..<16 {
      let x = (bit * 2 + 1) * rep.pixelsWide / 32
      let y = 20 * rep.pixelsHigh / 24
      guard let c = rep.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) else { return nil }
      if min(c.redComponent, c.greenComponent, c.blueComponent) > 0.8 {
        value |= 1 << bit
      } else if max(c.redComponent, c.greenComponent, c.blueComponent) > 0.2 {
        return nil
      }
    }
    return ticks[value]
  }

  func playback(_ file: String, _ kind: String) throws -> [[String: Any]] {
    // Decode EVERY movie frame. No QuickTime window, app data, or re-recording
    // of playback. The on-screen clock ties movie frames to the live action.
    let asset = AVURLAsset(url: URL(fileURLWithPath: file))
    guard let track = asset.tracks(withMediaType: .video).first else {
      throw NSError(domain: "native recording has no video track", code: 7)
    }
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(
      track: track,
      outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    reader.add(output)
    guard reader.startReading() else { throw reader.error! }
    var result: [[String: Any]] = []
    var index = 0
    while let sample = output.copyNextSampleBuffer() {
      index += 1
      guard index <= 3600, let buffer = CMSampleBufferGetImageBuffer(sample) else {
        throw NSError(domain: "unbounded or unreadable recording", code: 8)
      }
      let ci = CIImage(cvPixelBuffer: buffer)
      guard let image = context.createCGImage(ci, from: ci.extent),
        let marker = markerTime(image, kind)
      else { throw NSError(domain: "recorded frame lost its contemporaneous control", code: 9) }
      // All pre-action frames also have to contain the control. Only frames
      // from this action are compared with its plain reference.
      if marker < began { continue }
      var frame = measurement(image, kind, baseline["screencapture"])
      frame["captured"] = marker
      frame["id"] = index
      frame["presentation"] = CMSampleBufferGetPresentationTimeStamp(sample).seconds
      result.append(frame)
    }
    guard reader.status == .completed else {
      throw reader.error ?? NSError(domain: "movie did not decode completely", code: 10)
    }
    return result
  }

  func request() async {
    let file = directory.appendingPathComponent("request.json")
    guard !busy, let data = try? Data(contentsOf: file),
      let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let op = request["op"] as? String
    else { return }
    busy = true
    try? FileManager.default.removeItem(at: file)
    defer { busy = false }
    if op == "stop" {
      await stop()
      return
    }
    do {
      if op == "mark" {
        write("response.json", ["time": now])
        return
      }
      if op == "arm", let kind = request["kind"] as? String, controlRects[kind] != nil {
        frames = []
        overflow = false
        watching = kind
        pulse()
        began = ticks[tick]!
        write(
          "response.json",
          [
            "start": began,
            "rect": [
              "x": region(kind).minX, "y": region(kind).minY, "w": region(kind).width,
              "h": region(kind).height,
            ],
          ])
        return
      }
      if op == "playback", let kind = watching, let movie = request["file"] as? String {
        let frames = try playback(movie, kind)
        write("response.json", ["frames": frames])
        return
      }
      let shots = try await images()
      if op == "baseline" {
        baseline = shots
        write("response.json", ["baseline": true])
        return
      }
      guard let kind = watching else {
        throw NSError(domain: "capture was not armed before action", code: 4)
      }
      var result: [String: Any] = [:]
      for (name, image) in shots { result[name] = measurement(image, kind, baseline[name]) }
      result["timeline"] = ["start": began, "frames": frames, "overflow": overflow]
      write("response.json", result)
    } catch { write("response.json", ["error": "\(error)"]) }
  }
}

@MainActor
final class CaptureControl: NSView {
  var tick = 0 { didSet { needsDisplay = true } }
  override var isFlipped: Bool { true }
  override func draw(_ dirtyRect: NSRect) {
    NSColor.green.setFill()
    CGRect(x: 0, y: 0, width: 16, height: 16).fill()
    NSColor.magenta.setFill()
    CGRect(x: 16, y: 0, width: 16, height: 16).fill()
    for bit in 0..<16 {
      (tick & (1 << bit) == 0 ? NSColor.black : NSColor.white).setFill()
      CGRect(x: bit * 2, y: 16, width: 2, height: 8).fill()
    }
  }
}

@MainActor
func captureShare(_ directory: String, _ notch: CGRect) -> Never {
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  let session = CaptureShare(directory: URL(fileURLWithPath: directory), notch: notch)
  let owner = ProcessInfo.processInfo.environment["NOTCH_ISLAND_OWNER_PID"].flatMap(Int32.init)
  Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
    Task { @MainActor in
      if let owner, kill(owner, 0) != 0 { await session.stop() }
      await session.request()
    }
  }
  DispatchQueue.main.asyncAfter(deadline: .now() + 900) { Task { await session.stop() } }
  Task { @MainActor in
    do { try await session.start() } catch {
      session.write("error.json", ["error": "\(error)"])
      exit(2)
    }
  }
  app.run()
  exit(0)
}
