import CoreGraphics
import Foundation

/// Whether an app is fullscreen on the home screen (D125, D100): the
/// frontmost app has a normal-level window there that covers the whole
/// screen, menu bar strip included, or that the app itself reports as
/// fullscreen (on a notched screen a fullscreen window sits below the strip,
/// which macOS paints black). The island asks it at the moment it would pop a wing,
/// never from a flag kept since the last space change: the space's animation
/// into fullscreen ends after macOS reports the change, so a flag read then
/// still says "not fullscreen" for the whole movie.
public enum FullscreenRule {
  /// One window as the window server lists it (bounds top-left based).
  public struct Window: Sendable, Equatable {
    public var pid: Int32
    public var layer: Int
    public var bounds: CGRect
    /// The app's own word that the window is fullscreen (Accessibility).
    public var reportsFullscreen: Bool

    public init(pid: Int32, layer: Int, bounds: CGRect, reportsFullscreen: Bool = false) {
      self.pid = pid
      self.layer = layer
      self.bounds = bounds
      self.reportsFullscreen = reportsFullscreen
    }
  }

  /// `screen` is the home screen's frame, top-left based like the bounds.
  public static func isFullscreen(front: Int32?, windows: [Window], screen: CGRect) -> Bool {
    guard let front else { return false }
    return windows.contains { w in
      guard w.pid == front, w.layer == 0 else { return false }
      if w.bounds.contains(screen) { return true }
      return w.reportsFullscreen && screen.contains(CGPoint(x: w.bounds.midX, y: w.bounds.midY))
    }
  }
}
