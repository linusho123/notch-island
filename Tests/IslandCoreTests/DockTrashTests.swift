import CoreGraphics
import Testing

@testable import IslandCore

/// D142, as found 2026-10-30: the Dock reports a drop on its Trash as generic,
/// like a drop that only copies, so where the drag was let go decides.
struct DockTrashTests {
  // The Trash on this Mac, as Accessibility reports it (top-left based), on
  // a 1112-point-high main screen.
  let trash = CGRect(x: 1380.3, y: 1018, width: 68, height: 84)
  let height: CGFloat = 1112

  @Test func lettingGoOnTheTrashIsADropOnIt() {
    // AppKit's point for the Trash's center: bottom-left based.
    #expect(
      DockTrash.contains(CGPoint(x: 1414, y: 1112 - 1060), trash: trash, mainScreenHeight: height))
  }

  @Test func lettingGoElsewhereIsNot() {
    #expect(!DockTrash.contains(CGPoint(x: 1414, y: 600), trash: trash, mainScreenHeight: height))
    #expect(!DockTrash.contains(CGPoint(x: 900, y: 52), trash: trash, mainScreenHeight: height))
  }

  @Test func theTwoOriginsAreNotMixedUp() {
    // The Trash's own top-left y, read unflipped, lies near the screen's top.
    #expect(!DockTrash.contains(CGPoint(x: 1414, y: 1060), trash: trash, mainScreenHeight: height))
  }

  @Test func noTrashFoundIsNoDropOnIt() {
    #expect(!DockTrash.contains(CGPoint(x: 1414, y: 52), trash: nil, mainScreenHeight: height))
  }
}
