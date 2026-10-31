import AppKit
import ApplicationServices

/// The Trash in the Dock, read through Accessibility (top-left based); nil
/// without the island's permission or with no Dock running.
enum DockTrashReader {
  static func frame() -> CGRect? {
    guard AXIsProcessTrusted(),
      let dock = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.dock")
        .first
    else { return nil }
    let app = AXUIElementCreateApplication(dock.processIdentifier)
    AXUIElementSetMessagingTimeout(app, 0.3)
    for list in children(of: app) {
      for item in children(of: list) where string(item, kAXSubroleAttribute) == "AXTrashDockItem" {
        var p: CFTypeRef?
        var s: CFTypeRef?
        guard
          AXUIElementCopyAttributeValue(item, kAXPositionAttribute as CFString, &p) == .success,
          AXUIElementCopyAttributeValue(item, kAXSizeAttribute as CFString, &s) == .success
        else { return nil }
        var point = CGPoint.zero
        var size = CGSize.zero
        AXValueGetValue(p as! AXValue, .cgPoint, &point)
        AXValueGetValue(s as! AXValue, .cgSize, &size)
        return CGRect(origin: point, size: size)
      }
    }
    return nil
  }

  private static func children(of element: AXUIElement) -> [AXUIElement] {
    var value: CFTypeRef?
    guard
      AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success
    else { return [] }
    return value as? [AXUIElement] ?? []
  }

  private static func string(_ element: AXUIElement, _ attribute: String) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else {
      return nil
    }
    return value as? String
  }
}
