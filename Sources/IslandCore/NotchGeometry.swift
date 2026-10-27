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

  /// The drawn shape's bottom corner radii: the closed island's and the open
  /// panel's. The view draws with these and the pointer test follows them.
  public static let closedBottomRadius: CGFloat = 10
  public static let openBottomRadius: CGFloat = 22

  /// Whether `p` (AppKit coordinates, origin bottom-left) is on the drawn
  /// shape: `rect` with its bottom corners rounded by `bottomRadius`. The top
  /// edge counts, one point past it too: the pointer pushed against the top of
  /// the screen is on the notch.
  public static func shapeContains(_ p: CGPoint, in rect: CGRect, bottomRadius r: CGFloat) -> Bool {
    let hit = CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height + 1)
    guard hit.contains(p) else { return false }
    let radius = min(r, rect.width / 2, rect.height)
    let cy = rect.minY + radius
    guard p.y < cy else { return true }
    let cx: CGFloat
    if p.x < rect.minX + radius {
      cx = rect.minX + radius
    } else if p.x > rect.maxX - radius {
      cx = rect.maxX - radius
    } else {
      return true
    }
    let dx = p.x - cx
    let dy = p.y - cy
    return dx * dx + dy * dy <= radius * radius
  }
}

/// Geometry for note items on the shelf (M3).
/// The remove button (small x) sits in a separate gutter and never overlaps the
/// note's text, controls, or the open editor.
public enum NoteLayoutGeometry {
  public static let maxContentWidth: CGFloat = 200
  public static let cardPadding: CGFloat = 4
  public static let gutterSpacing: CGFloat = 2
  public static let removeButtonSize: CGFloat = 18

  public static func cardRect(contentWidth: CGFloat, height: CGFloat = 32) -> CGRect {
    let width = min(contentWidth, maxContentWidth) + cardPadding * 2
    return CGRect(x: 0, y: 0, width: width, height: height)
  }

  public static func removeGutterRect(contentWidth: CGFloat, height: CGFloat = 32) -> CGRect {
    let card = cardRect(contentWidth: contentWidth, height: height)
    return CGRect(
      x: card.maxX + gutterSpacing,
      y: 0,
      width: removeButtonSize,
      height: removeButtonSize
    )
  }

  public static func framesDoNotIntersect(contentWidth: CGFloat) -> Bool {
    let card = cardRect(contentWidth: contentWidth)
    let gutter = removeGutterRect(contentWidth: contentWidth)
    return !card.intersects(gutter)
  }

  /// Evaluates an overlay layout (as previously used) where the remove button is placed
  /// at the top-trailing corner inside the card frame, demonstrating intersection.
  public static func overlayIntersectsCard(cardWidth: CGFloat, removeSize: CGFloat = 20) -> Bool {
    let card = CGRect(x: 0, y: 0, width: cardWidth, height: 32)
    let overlay = CGRect(x: cardWidth - removeSize, y: 0, width: removeSize, height: removeSize)
    return card.intersects(overlay)
  }
}
