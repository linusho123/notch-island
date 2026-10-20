import Testing

@testable import IslandCore

/// The pointer rules: a rest opens, a sweep does not (D51, D99); a click opens
/// at once (D74); a grace on leaving, never closing mid-drag (D52).
struct HoverMachineTests {
  let timing = IslandTiming(rest: 0.3, grace: 0.5, restRadius: 8)

  @Test func restingOnTheNotchOpensAfterTheRestTime() {
    var m = HoverMachine(timing: timing)
    m.pointer(x: 855, y: 1100, inside: true, at: 10.0)
    #expect(m.nextDeadline == 10.3)
    let changed1 = m.tick(at: 10.29)
    #expect(!changed1)
    #expect(m.state == .closed)
    let changed2 = m.tick(at: 10.3)
    #expect(changed2)
    #expect(m.state == .open)
  }

  @Test func smallDriftStillCountsAsResting() {
    var m = HoverMachine(timing: timing)
    m.pointer(x: 855, y: 1100, inside: true, at: 0)
    m.pointer(x: 860, y: 1098, inside: true, at: 0.2)
    m.tick(at: 0.3)
    #expect(m.state == .open)
  }

  @Test func aSweepAcrossTheNotchNeverOpens() {
    var m = HoverMachine(timing: timing)
    // 185 points of notch crossed in 0.15 s, a move every 10 ms.
    var t = 0.0
    var x = 763.0
    while x <= 948 {
      m.pointer(x: x, y: 1100, inside: true, at: t)
      m.tick(at: t)
      #expect(m.state == .closed)
      x += 12
      t += 0.01
    }
    m.pointer(x: 1000, y: 1100, inside: false, at: t)
    #expect(m.nextDeadline == nil)
    m.tick(at: t + 5)
    #expect(m.state == .closed)
  }

  @Test func aSlowSweepThatKeepsMovingNeverRests() {
    var m = HoverMachine(timing: timing)
    var t = 0.0
    var x = 763.0
    // 40 points a second: slow, but never still for a rest.
    while x <= 948 {
      m.pointer(x: x, y: 1100, inside: true, at: t)
      m.tick(at: t)
      #expect(m.state == .closed)
      x += 4
      t += 0.1
    }
  }

  @Test func leavingBeforeTheRestEndsOpensNothing() {
    var m = HoverMachine(timing: timing)
    m.pointer(x: 855, y: 1100, inside: true, at: 0)
    m.pointer(x: 855, y: 900, inside: false, at: 0.2)
    #expect(m.nextDeadline == nil)
    let changed3 = m.tick(at: 1)
    #expect(!changed3)
    #expect(m.state == .closed)
  }

  @Test func aClickOpensAtOnce() {
    var m = HoverMachine(timing: timing)
    m.pointer(x: 855, y: 1100, inside: true, at: 0)
    m.click(at: 0.01)
    #expect(m.state == .open)
  }

  @Test func aSecondaryClickForgetsTheRest() {
    var m = HoverMachine(timing: timing)
    m.pointer(x: 855, y: 1100, inside: true, at: 0)
    m.secondaryClick()
    #expect(m.nextDeadline == nil)
    m.tick(at: 1)
    #expect(m.state == .closed)
  }

  @Test func theGraceKeepsTheIslandOpenForAMomentOff() {
    var m = HoverMachine(timing: timing)
    m.click(at: 0)
    m.pointer(x: 855, y: 800, inside: false, at: 1.0)
    #expect(m.nextDeadline == 1.5)
    m.tick(at: 1.2)
    #expect(m.state == .open)
    m.pointer(x: 855, y: 1000, inside: true, at: 1.2)
    #expect(m.nextDeadline == nil)
    m.tick(at: 3)
    #expect(m.state == .open)
  }

  @Test func theIslandClosesWhenTheGraceRunsOut() {
    var m = HoverMachine(timing: timing)
    m.click(at: 0)
    m.pointer(x: 855, y: 800, inside: false, at: 1.0)
    m.pointer(x: 855, y: 700, inside: false, at: 1.3)  // still off: the grace runs from leaving
    let changed4 = m.tick(at: 1.5)
    #expect(changed4)
    #expect(m.state == .closed)
  }

  @Test func aDragHoldsTheIslandOpenUntilLetGo() {
    var m = HoverMachine(timing: timing)
    m.click(at: 0)
    m.dragBegan()
    m.pointer(x: 855, y: 100, inside: false, at: 1)  // down to the Dock
    #expect(m.nextDeadline == nil)
    m.tick(at: 30)
    #expect(m.state == .open)
    m.dragEnded(inside: false, at: 30)
    #expect(m.nextDeadline == 30.5)
    m.tick(at: 30.5)
    #expect(m.state == .closed)
  }

  @Test func aDragLetGoOnTheIslandKeepsItOpen() {
    var m = HoverMachine(timing: timing)
    m.click(at: 0)
    m.dragBegan()
    m.dragEnded(inside: true, at: 2)
    #expect(m.nextDeadline == nil)
    m.tick(at: 10)
    #expect(m.state == .open)
  }

  @Test func aDragCannotBeginOnTheClosedNotch() {
    var m = HoverMachine(timing: timing)
    m.dragBegan()
    #expect(!m.isDragging)
  }

  @Test func theTimesAreConfiguration() {
    var m = HoverMachine(timing: IslandTiming(rest: 0.7, grace: 1.0, restRadius: 8))
    m.pointer(x: 855, y: 1100, inside: true, at: 0)
    m.tick(at: 0.5)
    #expect(m.state == .closed)
    m.tick(at: 0.7)
    #expect(m.state == .open)
    m.pointer(x: 855, y: 800, inside: false, at: 1)
    #expect(m.nextDeadline == 2)
  }
}

/// A mouse-up that never arrives must not hold the island open for good.
struct LostMouseUpTests {
  let timing = IslandTiming(rest: 0.3, grace: 0.5, restRadius: 8)

  @Test func aDragWhoseButtonIsNoLongerHeldEndsAndTheGraceRuns() {
    var m = HoverMachine(timing: timing)
    m.click(at: 0)
    m.dragBegan()
    m.pointer(x: 0, y: 0, inside: false, at: 1)
    #expect(m.nextDeadline == nil)
    m.leftButton(held: false, inside: false, at: 2)
    #expect(!m.isDragging)
    #expect(m.nextDeadline == 2.5)
    m.tick(at: 2.5)
    #expect(m.state == .closed)
  }

  @Test func aHeldButtonKeepsTheDragGoing() {
    var m = HoverMachine(timing: timing)
    m.click(at: 0)
    m.dragBegan()
    m.leftButton(held: true, inside: false, at: 2)
    #expect(m.isDragging)
    m.tick(at: 10)
    #expect(m.state == .open)
  }

  @Test func withNoDragTheButtonCheckChangesNothing() {
    var m = HoverMachine(timing: timing)
    m.click(at: 0)
    m.leftButton(held: false, inside: false, at: 2)
    #expect(m.nextDeadline == nil)
    #expect(m.state == .open)
  }
}
