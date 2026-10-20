import CoreGraphics
import Testing

@testable import IslandCore

/// The island's place (built-in notch only, D16) and its pages (D29, D30, D76).
struct GeometryTests {
  // This Mac: 1710 x 1107, notch 185 wide from x 763 to 948, 33 high.
  let builtIn = ScreenDescription(
    frame: CGRect(x: 0, y: 0, width: 1710, height: 1107), isBuiltIn: true,
    topLeftArea: CGRect(x: 0, y: 1074, width: 763, height: 33),
    topRightArea: CGRect(x: 948, y: 1074, width: 762, height: 33))
  let external = ScreenDescription(
    frame: CGRect(x: 1710, y: 0, width: 1920, height: 1080), isBuiltIn: false,
    topLeftArea: nil, topRightArea: nil)

  @Test func theNotchLiesBetweenTheTwoReportedAreas() {
    #expect(
      NotchGeometry.notchRect(on: builtIn) == CGRect(x: 763, y: 1074, width: 185, height: 33))
  }

  @Test func aScreenWithoutANotchHasNoIsland() {
    #expect(NotchGeometry.notchRect(on: external) == nil)
    #expect(NotchGeometry.homeScreen(in: [external]) == nil)
  }

  @Test func theHomeIsTheBuiltInScreenWhateverTheOrder() {
    #expect(NotchGeometry.homeScreen(in: [external, builtIn]) == builtIn)
  }

  @Test func aNotchedScreenThatIsNotBuiltInIsNoHome() {
    var other = builtIn
    other.isBuiltIn = false
    #expect(NotchGeometry.homeScreen(in: [other]) == nil)
  }

  @Test func theOpenPanelHangsFromTheNotch() {
    let notch = CGRect(x: 763, y: 1074, width: 185, height: 33)
    let rect = NotchGeometry.openRect(
      notch: notch, screen: builtIn.frame, size: CGSize(width: 460, height: 190))
    #expect(rect == CGRect(x: 625.5, y: 917, width: 460, height: 190))
    #expect(rect.midX == notch.midX)
  }

  @Test func theOpenPanelStaysOnTheScreen() {
    let notch = CGRect(x: 10, y: 1074, width: 100, height: 33)
    let rect = NotchGeometry.openRect(
      notch: notch, screen: builtIn.frame, size: CGSize(width: 460, height: 190))
    #expect(rect.minX == 0)
  }
}

struct PageScrollerTests {
  @Test func scrollingDownWithTwoFingersReachesTheShelfOncePerGesture() {
    var p = PageScroller(threshold: 24)
    let changed1 = p.scroll(deltaY: -10, continuous: true, gestureBegan: true)
    #expect(!changed1)
    #expect(p.page == .music)
    let changed2 = p.scroll(deltaY: -20, continuous: true)
    #expect(changed2)
    #expect(p.page == .shelf)
    let changed3 = p.scroll(deltaY: 40, continuous: true)
    #expect(!changed3)
    #expect(p.page == .shelf)
  }

  @Test func scrollingUpReturnsToTheMusicPage() {
    var p = PageScroller(threshold: 24)
    p.scroll(deltaY: -30, continuous: true, gestureBegan: true)
    let changed4 = p.scroll(deltaY: 30, continuous: true, gestureBegan: true)
    #expect(changed4)
    #expect(p.page == .music)
  }

  @Test func eachNotchOfAMouseWheelCounts() {
    var p = PageScroller()
    let changed5 = p.scroll(deltaY: -1, continuous: false)
    #expect(changed5)
    #expect(p.page == .shelf)
    let changed6 = p.scroll(deltaY: 1, continuous: false)
    #expect(changed6)
    #expect(p.page == .music)
  }

  @Test func momentumAfterTheFingersLiftNeverTurnsAPage() {
    var p = PageScroller()
    let changed7 = p.scroll(deltaY: -100, continuous: true, gestureBegan: true, momentum: true)
    #expect(!changed7)
    #expect(p.page == .music)
  }

  @Test func closingReturnsToTheMusicPage() {
    var p = PageScroller()
    p.scroll(deltaY: -1, continuous: false)
    p.reset()
    #expect(p.page == .music)
  }
}

/// risk-2: the pointer is on the island only where the shape is drawn, not in
/// the transparent corners of the panel's rectangle.
struct ShapeHitTests {
  let open = CGRect(x: 625, y: 917, width: 460, height: 190)  // AppKit: origin bottom-left

  @Test func theMiddleAndTheTopEdgeAreOnTheShape() {
    #expect(NotchGeometry.shapeContains(CGPoint(x: 855, y: 1000), in: open, bottomRadius: 22))
    #expect(NotchGeometry.shapeContains(CGPoint(x: 855, y: 1107.5), in: open, bottomRadius: 22))
  }

  @Test func theTransparentBottomCornersAreOff() {
    #expect(!NotchGeometry.shapeContains(CGPoint(x: 625.5, y: 917.5), in: open, bottomRadius: 22))
    #expect(!NotchGeometry.shapeContains(CGPoint(x: 1084.5, y: 917.5), in: open, bottomRadius: 22))
  }

  @Test func insideTheRoundingStaysOn() {
    // 10 pt in from each edge of the corner, well inside the 22 pt arc.
    #expect(NotchGeometry.shapeContains(CGPoint(x: 640, y: 932), in: open, bottomRadius: 22))
    #expect(NotchGeometry.shapeContains(CGPoint(x: 1070, y: 932), in: open, bottomRadius: 22))
    // Straight along the bottom edge, away from the corners.
    #expect(NotchGeometry.shapeContains(CGPoint(x: 855, y: 917.5), in: open, bottomRadius: 22))
  }

  @Test func outsideTheRectIsOff() {
    #expect(!NotchGeometry.shapeContains(CGPoint(x: 600, y: 1000), in: open, bottomRadius: 22))
    #expect(!NotchGeometry.shapeContains(CGPoint(x: 855, y: 900), in: open, bottomRadius: 22))
  }
}
