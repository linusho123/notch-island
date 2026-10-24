import CoreGraphics
import Foundation
import Testing

@testable import IslandCore

/// The island's shape and motion (D135-D139): the spring out, the shrink
/// back, the neck no wider than the notch, the wing inside its gap.
struct IslandMotionTests {
  // This Mac: notch 185 wide from x 763, 33 high; menu bar strip 34 high.
  let shape = IslandShape(
    notch: CGRect(x: 763, y: 0, width: 185, height: 33), stripBottom: 34,
    openBody: CGSize(width: 460, height: 167))
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

  /// How far each of the body's edges passes its resting place, in points.
  func overshoot(_ p: Double) -> CGFloat {
    guard let b = shape.body(progress: p) else { return 0 }
    let open = shape.body(progress: 1)!
    return max(open.minX - b.minX, b.maxX - open.maxX, b.maxY - open.maxY, 0)
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
      if let b = shape.body(progress: p) {
        #expect(b.width >= shape.notch.width && b.width <= 460 && b.height <= 167)
      }
    }
  }

  @Test func theNeckIsNeverWiderThanTheNotchInsideTheMenuBarStrip() {
    var m = opened()
    var samples = run(m, seconds: 0.25)
    m.retarget(to: 0, curve: IslandMotion.closing, at: 0.25)
    samples += run(m, from: 0.25, seconds: 0.6)
    for (_, p) in samples {
      let neck = shape.neck(progress: p)
      #expect(neck.width <= shape.notch.width)
      #expect(neck.minX >= shape.notch.minX && neck.maxX <= shape.notch.maxX)
      if let body = shape.body(progress: p) {
        #expect(body.minY >= shape.stripBottom, "the panel reaches into the menu bar strip")
      }
    }
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

  @Test func theShouldersCornersAreNotPartOfTheShape() {
    let body = shape.body(progress: 1)!
    // Just beside the neck, under the strip: inside the shoulder's curve, not drawn.
    let besideNeck = CGPoint(x: shape.notch.maxX + 6, y: body.minY + 2)
    #expect(!shape.contains(besideNeck, progress: 1, neckBottomRadius: 0))
    // The panel's outer top corner: not drawn either.
    #expect(
      !shape.contains(CGPoint(x: body.minX + 1, y: body.minY + 1), progress: 1, neckBottomRadius: 0)
    )
    // The neck, the menu bar strip beside it, the panel's middle.
    #expect(shape.contains(CGPoint(x: shape.notch.midX, y: 10), progress: 1, neckBottomRadius: 0))
    #expect(
      !shape.contains(CGPoint(x: shape.notch.maxX + 20, y: 10), progress: 1, neckBottomRadius: 0))
    #expect(
      !shape.contains(CGPoint(x: shape.notch.minX - 20, y: 10), progress: 1, neckBottomRadius: 0))
    #expect(shape.contains(CGPoint(x: body.midX, y: body.midY), progress: 1, neckBottomRadius: 0))
    #expect(
      shape.contains(CGPoint(x: body.minX + 4, y: body.midY), progress: 1, neckBottomRadius: 0))
  }

  @Test func theClosedIslandIsTheNotchAndNothingBelow() {
    #expect(shape.body(progress: 0) == nil)
    #expect(shape.neck(progress: 0) == shape.notch)
    #expect(shape.neck(progress: 0.5).maxY == 34)
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
