import CoreGraphics
import Foundation

/// A screen as the island needs to know it, in AppKit's global coordinates
/// (origin bottom-left of the primary screen).
public struct ScreenDescription: Equatable, Sendable {
  public var frame: CGRect
  public var isBuiltIn: Bool
  /// The menu bar strip left and right of the camera housing, when the screen
  /// reports a notch (`NSScreen.auxiliaryTopLeftArea` / `...TopRightArea`).
  public var topLeftArea: CGRect?
  public var topRightArea: CGRect?

  public init(frame: CGRect, isBuiltIn: Bool, topLeftArea: CGRect?, topRightArea: CGRect?) {
    self.frame = frame
    self.isBuiltIn = isBuiltIn
    self.topLeftArea = topLeftArea
    self.topRightArea = topRightArea
  }
}

public enum NotchGeometry {
  /// The island's home: the built-in screen that reports a notch. Nothing of
  /// the island appears on any other screen (D16).
  public static func homeScreen(in screens: [ScreenDescription]) -> ScreenDescription? {
    screens.first { $0.isBuiltIn && notchRect(on: $0) != nil }
  }

  /// The camera housing: the gap between the two areas the screen reports
  /// either side of it, as tall as those areas, flush with the screen's top.
  public static func notchRect(on screen: ScreenDescription) -> CGRect? {
    guard let left = screen.topLeftArea, let right = screen.topRightArea else { return nil }
    let width = right.minX - left.maxX
    let height = max(left.height, right.height)
    guard width > 0, height > 0 else { return nil }
    return CGRect(x: left.maxX, y: screen.frame.maxY - height, width: width, height: height)
  }

  /// The open panel: hanging down from the top of the screen, centred on the
  /// notch, kept inside the screen sideways.
  public static func openRect(notch: CGRect, screen: CGRect, size: CGSize) -> CGRect {
    var x = notch.midX - size.width / 2
    x = min(max(x, screen.minX), screen.maxX - size.width)
    return CGRect(x: x, y: screen.maxY - size.height, width: size.width, height: size.height)
  }
}
