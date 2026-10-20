import Testing

@testable import IslandCore

/// After a click on the bar the island keeps showing the clicked position
/// until Music reports one near it, for a bounded time at most (D124): a stale
/// poll must not flash the dot back to where the song was.
struct SeekHoldTests {
  @Test func aStalePollRightAfterASeekDoesNotMoveTheShownPositionBack() {
    var hold = SeekHold()
    hold.begin(target: 120, at: 50, playing: true)
    // Music still reports the old position (30 s) a moment after the click.
    #expect(hold.shown(real: 30.2, at: 50.1) == 120.1)
    #expect(hold.shown(real: 30.4, at: 50.3) == 120.3)
    #expect(hold.isHolding)
  }

  @Test func aPausedSongHoldsTheTargetWithoutCarryingOn() {
    var hold = SeekHold()
    hold.begin(target: 120, at: 50, playing: false)
    #expect(hold.shown(real: 30, at: 50.8) == 120)
  }

  @Test func aPollNearTheTargetReleasesTheHold() {
    var hold = SeekHold()
    hold.begin(target: 120, at: 50, playing: true)
    #expect(hold.shown(real: 120.2, at: 50.2) == 120.2)
    #expect(!hold.isHolding)
    // Released: Music's own position is shown from now on.
    #expect(hold.shown(real: 125, at: 55) == 125)
  }

  @Test func aHoldNeverConfirmedReleasesAfterTheBoundAndShowsMusicsPosition() {
    var hold = SeekHold()
    hold.begin(target: 120, at: 50, playing: true)
    #expect(hold.shown(real: 30, at: 50.9) == 120.9)
    // Music ignored the seek: after the bound the real position wins (D124).
    #expect(hold.shown(real: 31.1, at: 51.1) == 31.1)
    #expect(!hold.isHolding)
    #expect(hold.shown(real: 32, at: 52) == 32)
  }

  @Test func aNewSongEndsTheHold() {
    var hold = SeekHold()
    hold.begin(target: 120, at: 50, playing: true)
    hold.cancel()
    #expect(hold.shown(real: 0.5, at: 50.5) == 0.5)
  }

  @Test func withoutASeekTheRealPositionIsShown() {
    var hold = SeekHold()
    #expect(hold.shown(real: 42, at: 10) == 42)
  }
}
