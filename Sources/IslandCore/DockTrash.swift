import CoreGraphics

/// Whether a shelf drag was let go on the Trash in the Dock (D142). The Dock
/// reports a drop on its Trash as a generic one, the same as a drop that only
/// copies, so where the drag ended is what tells them apart.
public enum DockTrash {
  /// `point` as AppKit gives it (bottom-left based, on the main screen);
  /// `trash` as Accessibility reports it (top-left based), nil when unread.
  public static func contains(_ point: CGPoint, trash: CGRect?, mainScreenHeight: CGFloat) -> Bool {
    guard let trash else { return false }
    return trash.contains(CGPoint(x: point.x, y: mainScreenHeight - point.y))
  }
}
