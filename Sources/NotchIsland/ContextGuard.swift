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

  /// Fullscreen on the home screen: the frontmost app has a normal-level
  /// window covering the whole screen, menu bar strip included.
  @objc private func spaceOrAppChanged() {
    let now = frontmostIsFullscreen()
    guard now != isFullscreen else { return }
    isFullscreen = now
    onFullscreenChanged?(now)
  }

  private func frontmostIsFullscreen() -> Bool {
    guard let screen = homeScreen,
      let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier,
      let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID)
        as? [[String: Any]],
      let primaryHeight = NSScreen.screens.first?.frame.height
    else { return false }
    // Window bounds are top-left based; turn the screen's frame the same way.
    let f = screen.frame
    let screenTopLeft = CGRect(
      x: f.minX, y: primaryHeight - f.maxY, width: f.width, height: f.height)
    return windows.contains { info in
      guard (info[kCGWindowOwnerPID as String] as? Int32) == pid,
        (info[kCGWindowLayer as String] as? Int) == 0,
        let dict = info[kCGWindowBounds as String] as? NSDictionary,
        let bounds = CGRect(dictionaryRepresentation: dict)
      else { return false }
      return bounds.contains(screenTopLeft)
    }
  }
}
