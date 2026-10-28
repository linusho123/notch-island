import AppKit
import CoreImage
import ScreenCaptureKit

// P6's Zoom/Meet stand-in. The display filter excludes no windows. Keep an
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
  var frameTime = Date.distantPast
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
      let buffer = CMSampleBufferGetImageBuffer(sampleBuffer)
    else { return }
    let image = CIImage(cvPixelBuffer: buffer)
    latest = context.createCGImage(image, from: image.extent)
    frameTime = Date()
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
      "wing": CGRect(x: notch.minX - 100, y: notch.minY + 7, width: 16, height: 16),
      "panel": CGRect(x: notch.midX - 200, y: notch.maxY + 30, width: 16, height: 16),
    ] {
      let window = NSWindow(
        contentRect: CGRect(
          x: rect.minX, y: primaryHeight - rect.maxY, width: rect.width, height: rect.height),
        styleMask: [.borderless], backing: .buffered, defer: false)
      window.backgroundColor = .green
      window.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 2)
      window.sharingType = .readOnly
      window.ignoresMouseEvents = true
      window.hasShadow = false
      let patch = NSView(frame: NSRect(x: 8, y: 0, width: 8, height: 16))
      patch.wantsLayer = true
      patch.layer?.backgroundColor = NSColor.magenta.cgColor
      window.contentView?.addSubview(patch)
      window.orderFrontRegardless()
      controls[name] = window
      controlRects[name] = rect
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
    let requested = Date()
    for window in controls.values { window.alphaValue = window.alphaValue == 1 ? 0.99 : 1 }
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
    guard let rep = pixels(image, rect) else { return 0 }
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

  func difference(_ a: CGImage, _ b: CGImage, _ rect: CGRect) -> Double {
    guard let first = pixels(a, rect), let second = pixels(b, rect),
      first.pixelsWide == second.pixelsWide, first.pixelsHigh == second.pixelsHigh
    else { return 1 }
    var changed = 0.0
    var total = 0.0
    for y in stride(from: 0, to: first.pixelsHigh, by: 2) {
      for x in stride(from: 0, to: first.pixelsWide, by: 2) {
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
      let shots = try await images()
      if op == "baseline" {
        baseline = shots
        write("response.json", ["baseline": true])
        return
      }
      guard let r = request["rect"] as? [String: Double], let x = r["x"], let y = r["y"],
        let w = r["w"], let h = r["h"], let kind = request["kind"] as? String,
        let control = controlRects[kind]
      else { throw NSError(domain: "bad capture request", code: 4) }
      let rect = CGRect(x: x, y: y, width: w, height: h)
      guard rect.contains(control) else {
        throw NSError(domain: "control is outside the island rect", code: 5)
      }
      var result: [String: Any] = [:]
      for (name, image) in shots {
        guard let plain = baseline[name] else {
          throw NSError(domain: "no plain reference", code: 6)
        }
        result[name] = [
          "control": controlScore(image, control), "baselineControl": controlScore(plain, control),
          "changedFraction": difference(plain, image, rect),
        ]
      }
      write("response.json", result)
    } catch { write("response.json", ["error": "\(error)"]) }
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
