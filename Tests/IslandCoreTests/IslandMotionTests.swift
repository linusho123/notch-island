import CoreGraphics
import Foundation
import Testing

@testable import IslandCore

/// The island's shape and motion (D136-D140): the spring out, the shrink
/// back, the open card about 8 points below the notch with nothing between,
/// nothing wider than the notch inside the menu bar strip, the wing inside
/// its gap.
struct IslandMotionTests {
  // This Mac: notch 185 wide from x 763, 33 high; a menu bar strip a point
  // deeper than the notch, so the card's path past the strip is tested too.
  let shape = IslandShape(
    notch: CGRect(x: 763, y: 0, width: 185, height: 33), stripBottom: 34,
    openCard: CGSize(width: 460, height: 167))
  let ms = 0.001

  /// Samples of a motion every millisecond for `seconds`.
  func run(_ m: MotionValue, from t0: Double = 0, seconds: Double) -> [(t: Double, x: Double)] {
    stride(from: 0.0, through: seconds, by: ms).map { ($0, m.sample(at: t0 + $0).x) }
  }

  func opened() -> MotionValue {
    var m = MotionValue(at: 0)
    m.retarget(to: 1, curve: IslandMotion.opening, at: 0)
    return m
  }

  func closed(from start: Double = 1) -> MotionValue {
    var m = MotionValue(at: start)
    m.retarget(to: 0, curve: IslandMotion.closing, at: 0)
    return m
  }

  /// How far each of the card's four edges passes its resting place, in points.
  func overshoot(_ p: Double) -> CGFloat {
    guard let b = shape.card(progress: p) else { return 0 }
    let open = shape.openFrame
    let sideways: CGFloat = max(open.minX - b.minX, b.maxX - open.maxX)
    let downward: CGFloat = max(b.maxY - open.maxY, b.minY - open.minY)
    return max(sideways, downward, 0)
  }

  /// Progress samples of an opening, a close, and a close turned back
  /// mid-way at each of several moments.
  func everyMotion() -> [Double] {
    var all = run(opened(), seconds: 1).map(\.x) + run(closed(), seconds: 0.6).map(\.x)
    for reverseAt in stride(from: 0.02, through: 0.3, by: 0.04) {
      var m = closed()
      all += run(m, seconds: reverseAt).map(\.x)
      m.retarget(to: 1, curve: IslandMotion.opening, at: reverseAt)
      all += run(m, from: reverseAt, seconds: 0.8).map(\.x)
    }
    var m = opened()
    all += run(m, seconds: 0.12).map(\.x)
    m.retarget(to: 0, curve: IslandMotion.closing, at: 0.12)
    return all + run(m, from: 0.12, seconds: 0.6).map(\.x)
  }

  @Test func openingGrowsOverAboutFourTenthsOfASecond() {
    let samples = run(opened(), seconds: 1)
    #expect(samples[0].x == 0)
    let at100 = samples[100].x
    #expect(at100 > 0.2 && at100 < 0.9, "partway at 0.1 s, not \(at100)")
    // Within a point of the open size by 0.45 s, and not before 0.25 s.
    let travel = 167.0
    let firstNear = samples.first { abs($0.x - 1) * travel < 1 && $0.t > 0.05 }!
    #expect(firstNear.t > 0.1 && firstNear.t < 0.45)
    let late = samples.filter { $0.t >= 0.45 }
    #expect(late.allSatisfy { abs($0.x - 1) * travel < 1 })
  }

  @Test func openingBouncesALittleAndAtMostFourPoints() {
    let samples = run(opened(), seconds: 1)
    let peak = samples.map(\.x).max()!
    #expect(peak > 1, "a small spring passes its resting place")
    let worst = samples.map { overshoot($0.x) }.max()!
    #expect(worst > 0.5 && worst <= 4, "overshoot \(worst) points")
  }

  @Test func aLargeOvershootIsHeldToFourPoints() {
    // Even a value far past the open size draws an edge at most 4 points out.
    #expect(overshoot(1.5) <= 4)
    #expect(IslandMotion.length(closed: 0, open: 100, progress: 1.12) <= 104)
  }

  @Test func closingShrinksInAboutThreeTenthsWithNoBounce() {
    let samples = run(closed(), seconds: 1)
    let at100 = samples[100].x
    #expect(at100 > 0.05 && at100 < 0.9, "partway at 0.1 s, not \(at100)")
    for (a, b) in zip(samples, samples.dropFirst()) {
      #expect(b.x <= a.x + 1e-12, "it grew again at \(b.t) s")
      #expect(b.x >= 0, "smaller than the notch at \(b.t) s")
    }
    let travel = 167.0
    #expect(samples.filter { $0.t >= 0.3 }.allSatisfy { $0.x * travel < 0.5 })
  }

  @Test func neverSmallerThanTheNotchNorLargerThanTheOpenPanelWhileClosing() {
    for p in run(closed(), seconds: 0.6).map(\.x) {
      if let b = shape.card(progress: p) {
        #expect(b.width >= shape.notch.width && b.width <= 460 && b.height <= 167)
      }
      #expect(shape.parts(progress: p).first == shape.notch, "the notch is drawn throughout")
    }
  }

  @Test func nothingInsideTheMenuBarStripIsEverWiderThanTheNotch() {
    let strip = CGRect(x: 0, y: 0, width: 1710, height: shape.stripBottom)
    let samples = everyMotion()
    #expect(samples.count > 3000)
    for p in samples {
      for part in shape.parts(progress: p) {
        let inStrip = part.intersection(strip)
        guard !inStrip.isNull, inStrip.height > 0 else { continue }
        #expect(inStrip.width <= shape.notch.width, "\(inStrip) at progress \(p)")
        #expect(inStrip.minX >= shape.notch.minX && inStrip.maxX <= shape.notch.maxX)
      }
      if let card = shape.card(progress: p) {
        #expect(card.minY >= shape.stripBottom, "the card reaches into the strip at progress \(p)")
        #expect(abs(card.midX - shape.notch.midX) < 1e-9, "the card is off-centre at \(p)")
      }
    }
  }

  @Test func theOpenCardSitsEightPointsBelowTheNotchCentredUnderIt() {
    let open = shape.openFrame
    #expect(open.minY == shape.notch.maxY + 8)
    #expect(open.minY >= shape.stripBottom)
    #expect(open.midX == shape.notch.midX)
    #expect(open.size == CGSize(width: 460, height: 167))
    #expect(shape.card(progress: 1) == open)
    #expect(shape.parts(progress: 1) == [shape.notch, open])
    // A menu bar strip deeper than the gap: the card still starts below it.
    let deep = IslandShape(
      notch: shape.notch, stripBottom: 50, openCard: CGSize(width: 460, height: 167))
    #expect(deep.openFrame.minY == 50)
  }

  @Test func nothingIsDrawnBetweenTheNotchAndTheOpenCard() {
    let open = shape.openFrame
    let gap = CGRect(
      x: open.minX, y: shape.notch.maxY, width: open.width, height: open.minY - shape.notch.maxY)
    for part in shape.parts(progress: 1) {
      #expect(part.intersection(gap).height <= 0 || part.intersection(gap).isNull, "\(part)")
    }
    for x in stride(from: open.minX, through: open.maxX, by: 5) {
      for y in stride(from: shape.notch.maxY + 0.5, to: open.minY, by: 0.5) {
        #expect(!shape.contains(CGPoint(x: x, y: y), progress: 1), "drawn at \(x), \(y)")
      }
    }
  }

  @Test func theOpeningGrowsDownOutOfTheNotch() {
    #expect(shape.card(progress: 0) == nil)
    #expect(shape.parts(progress: 0) == [shape.notch])
    // Just started: a notch-wide sliver right under the notch.
    let first = shape.card(progress: 0.01)!
    #expect(first.minY >= shape.stripBottom && first.minY < shape.stripBottom + 0.5)
    #expect(first.width < shape.notch.width + 4 && first.height < 3)
    #expect(abs(first.midX - shape.notch.midX) < 1e-9)
    // Midway: wider and taller than the notch, short of the open card, and
    // already apart from the notch.
    let mid = shape.card(progress: 0.5)!
    #expect(mid.width > shape.notch.width + 50 && mid.width < 460 - 50)
    #expect(mid.height > 50 && mid.height < 167 - 50)
    #expect(mid.minY > shape.stripBottom && mid.minY < shape.openFrame.minY)
  }

  @Test func turningBackMidCloseIsSmoothAndStillBouncesAtMostFourPoints() {
    for reverseAt in stride(from: 0.02, through: 0.3, by: 0.02) {
      var m = closed()
      let before = m.sample(at: reverseAt)
      m.retarget(to: 1, curve: IslandMotion.opening, at: reverseAt)
      let after = m.sample(at: reverseAt)
      #expect(abs(after.x - before.x) < 1e-9, "the shape jumped turning back at \(reverseAt) s")
      #expect(abs(after.v - before.v) < 1e-9, "the speed jumped turning back at \(reverseAt) s")
      let samples = run(m, from: reverseAt, seconds: 1)
      for (a, b) in zip(samples, samples.dropFirst()) {
        // No frame-to-frame leap: at most 3 % of the travel per millisecond.
        #expect(abs(b.x - a.x) < 0.03)
      }
      #expect(samples.map { overshoot($0.x) }.max()! <= 4)
    }
  }

  @Test func aMotionSettlesExactlyAtItsTarget() {
    var m = opened()
    let early = m.settle(at: 0.1)
    #expect(!early)
    let late = m.settle(at: 0.6)
    #expect(late)
    #expect(m.sample(at: 0.6).x == 1)
    #expect(m.sample(at: 5).x == 1)
  }

  @Test func theContentFadesInOnlyOnceTheSpringHasSettled() {
    let m = opened()
    let first = stride(from: 0.0, through: 1, by: ms).first {
      m.swing(at: $0) < IslandMotion.contentSwing
    }!
    #expect(first > 0.25 && first < 0.45, "content at \(first) s")
  }

  @Test func onlyTheCardsRoundedRectAndTheNotchArePartOfTheShape() {
    let card = shape.openFrame
    let n = shape.notch
    func on(_ x: CGFloat, _ y: CGFloat, _ p: Double = 1) -> Bool {
      shape.contains(CGPoint(x: x, y: y), progress: p)
    }
    // The card's middle and just inside its straight edges.
    #expect(on(card.midX, card.midY))
    #expect(on(card.minX + 1, card.midY) && on(card.maxX - 1, card.midY))
    #expect(on(card.midX, card.minY + 1) && on(card.midX, card.maxY - 1))
    // Its four rounded corners are not drawn.
    #expect(!on(card.minX + 1, card.minY + 1) && !on(card.maxX - 1, card.minY + 1))
    #expect(!on(card.minX + 1, card.maxY - 1) && !on(card.maxX - 1, card.maxY - 1))
    // Just outside it.
    #expect(!on(card.minX - 1, card.midY) && !on(card.maxX + 1, card.midY))
    #expect(!on(card.midX, card.maxY + 1))
    // The notch, its top edge counted (the pointer pushed against the top),
    // its rounded bottom corners not; the strip beside it never.
    #expect(on(n.midX, 10) && on(n.midX, -1) && on(n.midX, n.maxY - 1))
    #expect(!on(n.minX + 0.5, n.maxY - 0.5))
    #expect(!on(n.maxX + 20, 10) && !on(n.minX - 20, 10))
    // Closed: only the notch.
    #expect(on(n.midX, 10, 0) && !on(card.midX, card.midY, 0))
    // Mid-motion the test follows the card where it is drawn now.
    let mid = shape.card(progress: 0.5)!
    #expect(on(mid.midX, mid.midY, 0.5) && !on(mid.minX + 0.5, mid.minY + 0.5, 0.5))
    #expect(!on(card.minX + 2, card.midY, 0.5))
  }

  @Test func theWingGrowsOutOfTheNotchsEdgeAndNeverPastItsGap() {
    var m = opened()
    let full: CGFloat = 131
    let room: CGFloat = 133
    let samples = run(m, seconds: 1).map {
      IslandMotion.wingWidth(full: full, room: room, progress: $0.x)
    }
    #expect(samples[0] == 0)
    #expect(samples[100] > 20 && samples[100] < full - 10)
    #expect(samples.allSatisfy { $0 <= room })
    #expect(samples.max()! > full, "the wing bounces a little where there is room")
    // A wing that fills its gap never passes it.
    #expect(
      run(m, seconds: 1).allSatisfy {
        IslandMotion.wingWidth(full: 133, room: 133, progress: $0.x) <= 133
      })
    m.retarget(to: 0, curve: IslandMotion.closing, at: 1)
    let folding = run(m, from: 1, seconds: 0.5).map {
      IslandMotion.wingWidth(full: full, room: room, progress: $0.x)
    }
    for (a, b) in zip(folding, folding.dropFirst()) { #expect(b <= a && b >= 0) }
    #expect(folding.last! < 0.5)
  }
}
