import AppKit
import IslandCore

/// The context guard's screen and fullscreen parts. It knows which screen is
/// the built-in one with the notch, and whether an app is fullscreen, from
/// system events only (never by polling), and tells the island when either
/// changes. Sharing and recording need no detection: the island's windows are
/// kept out of every capture at all times (D108, D110).
final class ContextGuard {
  var onScreensChanged: (() -> Void)?
  var onFullscreenChanged: ((Bool) -> Void)?
  private(set) var isFullscreen = false

  func start() {
    NotificationCenter.default.addObserver(
      self, selector: #selector(screensChanged),
      name: NSApplication.didChangeScreenParametersNotification, object: nil)
    let workspace = NSWorkspace.shared.notificationCenter
    workspace.addObserver(
      self, selector: #selector(spaceOrAppChanged),
      name: NSWorkspace.activeSpaceDidChangeNotification, object: nil)
    workspace.addObserver(
      self, selector: #selector(spaceOrAppChanged),
      name: NSWorkspace.didActivateApplicationNotification, object: nil)
    spaceOrAppChanged()
  }

  /// The built-in screen that reports a notch, if there is one now.
  var homeScreen: NSScreen? {
    let screens = NSScreen.screens
    let descriptions = screens.map(Self.describe)
    guard let home = NotchGeometry.homeScreen(in: descriptions),
      let index = descriptions.firstIndex(of: home)
    else { return nil }
    return screens[index]
  }

  static func describe(_ screen: NSScreen) -> ScreenDescription {
    let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
    let isBuiltIn =
      number.map { CGDisplayIsBuiltin(CGDirectDisplayID($0.uint32Value)) != 0 } ?? false
    // The areas beside the camera housing, in global coordinates whether
    // macOS reports them relative to the screen or not.
    let frame = screen.frame
    func global(_ r: CGRect) -> CGRect {
      r.minX >= frame.minX && r.maxX <= frame.maxX ? r : r.offsetBy(dx: frame.minX, dy: 0)
    }
    return ScreenDescription(
      frame: frame, isBuiltIn: isBuiltIn,
      topLeftArea: screen.auxiliaryTopLeftArea.map(global),
      topRightArea: screen.auxiliaryTopRightArea.map(global))
  }

  @objc private func screensChanged() {
    onScreensChanged?()
    spaceOrAppChanged()
  }

  /// Fullscreen on the home screen, read now (FullscreenRule). Whoever needs
  /// the answer at a moment (the wing, about to pop) asks this rather than
  /// `isFullscreen`, which is only as fresh as the last space or app change.
  func fullscreenNow() -> Bool {
    spaceOrAppChanged()
    return isFullscreen
  }

  @objc private func spaceOrAppChanged() {
    let now = frontmostIsFullscreen()
    guard now != isFullscreen else { return }
    isFullscreen = now
    onFullscreenChanged?(now)
  }

  private func frontmostIsFullscreen() -> Bool {
    guard let screen = homeScreen,
      let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID)
        as? [[String: Any]],
      let primaryHeight = NSScreen.screens.first?.frame.height
    else { return false }
    // Window bounds are top-left based; turn the screen's frame the same way.
    let f = screen.frame
    let screenTopLeft = CGRect(
      x: f.minX, y: primaryHeight - f.maxY, width: f.width, height: f.height)
    let listed = windows.compactMap { info -> FullscreenRule.Window? in
      guard let pid = info[kCGWindowOwnerPID as String] as? Int32,
        let layer = info[kCGWindowLayer as String] as? Int,
        let dict = info[kCGWindowBounds as String] as? NSDictionary,
        let bounds = CGRect(dictionaryRepresentation: dict)
      else { return nil }
      return FullscreenRule.Window(pid: pid, layer: layer, bounds: bounds)
    }
    let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
    return FullscreenRule.isFullscreen(
      front: front, windows: listed + (front.map(Self.reportedFullscreen) ?? []),
      screen: screenTopLeft)
  }

  /// The windows an app itself reports fullscreen, through Accessibility
  /// (top-left based frames); none without the island's permission.
  private static func reportedFullscreen(pid: pid_t) -> [FullscreenRule.Window] {
    guard AXIsProcessTrusted() else { return [] }
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.3)
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value) == .success,
      let windows = value as? [AXUIElement]
    else { return [] }
    return windows.compactMap { window in
      var full: CFTypeRef?
      var p: CFTypeRef?
      var s: CFTypeRef?
      guard
        AXUIElementCopyAttributeValue(window, "AXFullScreen" as CFString, &full) == .success,
        (full as? Bool) == true,
        AXUIElementCopyAttributeValue(window, kAXPositionAttribute as CFString, &p) == .success,
        AXUIElementCopyAttributeValue(window, kAXSizeAttribute as CFString, &s) == .success
      else { return nil }
      var point = CGPoint.zero
      var size = CGSize.zero
      AXValueGetValue(p as! AXValue, .cgPoint, &point)
      AXValueGetValue(s as! AXValue, .cgSize, &size)
      return FullscreenRule.Window(
        pid: pid, layer: 0, bounds: CGRect(origin: point, size: size), reportsFullscreen: true)
    }
  }
}
