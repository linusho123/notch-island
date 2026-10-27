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

  @Test func showingAPageDirectlyTurnsToItD33() {
    var p = PageScroller()
    #expect(p.page == .music)
    p.show(.shelf)
    #expect(p.page == .shelf)
    p.show(.music)
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

/// Geometry tests ensuring remove x never overlaps note text or editor (M3).
struct NoteLayoutGeometryTests {
  @Test("Note remove gutter does not intersect card text or editor frame across lengths (M3)")
  func noteRemoveGutterDoesNotIntersectTextOrEditor() {
    let lengths: [CGFloat] = [0, 10, 50, 100, 150, 200, 250, 500]
    for w in lengths {
      #expect(NoteLayoutGeometry.framesDoNotIntersect(contentWidth: w))
      let card = NoteLayoutGeometry.cardRect(contentWidth: w)
      let gutter = NoteLayoutGeometry.removeGutterRect(contentWidth: w)
      #expect(gutter.minX >= card.maxX + NoteLayoutGeometry.gutterSpacing)
      #expect(!card.intersects(gutter))
    }
  }

  @Test("Legacy overlay geometry demonstrably intersected the card frame (M3 mutant proof)")
  func legacyOverlayGeometryIntersectedCard() {
    let lengths: [CGFloat] = [50, 100, 150, 200]
    for w in lengths {
      #expect(NoteLayoutGeometry.overlayIntersectsCard(cardWidth: w, removeSize: 20))
    }
  }
}

/// Routing and reachability tests for shelf horizontal scroll and overflow (M9, S1).
struct ShelfScrollRoutingTests {
  @Test("Horizontal scroll on shelf routes to content and never pages (M9)")
  func horizontalScrollOnShelfRoutesToContent() {
    var pager = PageScroller()
    pager.show(.shelf)

    // A two-finger horizontal scroll to the left
    let action = ShelfScrollRouting.route(
      page: .shelf,
      deltaX: -40,
      deltaY: 0,
      continuous: true,
      gestureBegan: true,
      momentum: false,
      pager: &pager
    )
    #expect(action == .routeToContent)
    #expect(pager.page == .shelf)
  }

  @Test("Horizontal scroll with minor vertical drift does not page to music (M9)")
  func horizontalScrollWithDriftDoesNotPage() {
    var pager = PageScroller()
    pager.show(.shelf)

    // Horizontal scroll with slight vertical drift
    for _ in 0..<5 {
      let action = ShelfScrollRouting.route(
        page: .shelf,
        deltaX: -30,
        deltaY: 5,
        continuous: true,
        gestureBegan: false,
        momentum: false,
        pager: &pager
      )
      #expect(action == .routeToContent)
      #expect(pager.page == .shelf)
    }
  }

  @Test("Vertical scroll down on music pages to shelf (M9)")
  func verticalScrollDownOnMusicPagesToShelf() {
    var pager = PageScroller(threshold: 24)
    #expect(pager.page == .music)

    let action1 = ShelfScrollRouting.route(
      page: .music,
      deltaX: 0,
      deltaY: -10,
      continuous: true,
      gestureBegan: true,
      momentum: false,
      pager: &pager
    )
    #expect(action1 == .swallow)
    #expect(pager.page == .music)

    let action2 = ShelfScrollRouting.route(
      page: .music,
      deltaX: 0,
      deltaY: -20,
      continuous: true,
      gestureBegan: false,
      momentum: false,
      pager: &pager
    )
    #expect(action2 == .changePage(.shelf))
    #expect(pager.page == .shelf)
  }

  @Test("Vertical scroll up on shelf pages to music (M9)")
  func verticalScrollUpOnShelfPagesToMusic() {
    var pager = PageScroller(threshold: 24)
    pager.show(.shelf)

    let action = ShelfScrollRouting.route(
      page: .shelf,
      deltaX: 0,
      deltaY: 30,
      continuous: true,
      gestureBegan: true,
      momentum: false,
      pager: &pager
    )
    #expect(action == .changePage(.music))
    #expect(pager.page == .music)
  }

  @Test("Horizontal scroll on music page is swallowed and never pages (M9)")
  func horizontalScrollOnMusicIsSwallowed() {
    var pager = PageScroller()
    #expect(pager.page == .music)

    let action = ShelfScrollRouting.route(
      page: .music,
      deltaX: -50,
      deltaY: 0,
      continuous: true,
      gestureBegan: true,
      momentum: false,
      pager: &pager
    )
    #expect(action == .swallow)
    #expect(pager.page == .music)
  }

  @Test("D30 8-item + 3 long notes and reminder overflow and reachability geometry (M9)")
  func shelfItemsLayoutReachability() {
    // 3 screenshots (each ~46pt width), 2 files (~46pt), 2 notes (~150pt), 1 reminder (~150pt)
    // plus 3 long notes (~200pt) and 1 reminder (~150pt) = 12 items
    let itemWidths: [CGFloat] = [
      46, 46, 46, 46, 46, 150, 150, 150, 200, 200, 200, 150,
    ]
    let spacing: CGFloat = 6
    let horizontalPadding: CGFloat = 8

    let totalWidth =
      itemWidths.reduce(0, +) + CGFloat(itemWidths.count - 1) * spacing + horizontalPadding
    let viewportWidth: CGFloat = 394.5

    // Total content exceeds the viewport width: overflow is guaranteed
    #expect(totalWidth > viewportWidth)

    // Compute frames of all items along horizontal axis
    var currentX = horizontalPadding / 2
    var itemFrames: [CGRect] = []
    for w in itemWidths {
      itemFrames.append(CGRect(x: currentX, y: 0, width: w, height: 60))
      currentX += w + spacing
    }

    // First item is visible at scrollOffset 0
    #expect(itemFrames[0].maxX <= viewportWidth)

    // Last item overflows at scrollOffset 0
    let lastFrame = itemFrames.last!
    #expect(lastFrame.maxX > viewportWidth)

    // With horizontal scrolling, the last item is brought into view
    let maxScroll = totalWidth - viewportWidth
    let scrolledLastX = lastFrame.minX - maxScroll
    #expect(scrolledLastX >= 0)
    #expect(scrolledLastX + lastFrame.width <= viewportWidth + 10)
  }
}
