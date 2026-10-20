import Testing

@testable import IslandCore

struct ArtworkTrackerTests {
  @Test func aNewTrackIsReadOnceItsArtIsKept() {
    var t = ArtworkTracker()
    let first = t.shouldRead("A")
    t.finished("A", succeeded: true)
    let again = t.shouldRead("A")
    let other = t.shouldRead("B")
    #expect(first)
    #expect(!again)
    #expect(other)
  }

  @Test func aFailedReadIsTriedAgain() {
    var t = ArtworkTracker()
    let first = t.shouldRead("A")
    t.finished("A", succeeded: false)
    let again = t.shouldRead("A")
    #expect(first)
    #expect(again)
  }

  @Test func retriesAreBounded() {
    var t = ArtworkTracker(maxAttempts: 3)
    var reads = 0
    for _ in 0..<10 where t.shouldRead("A") {
      reads += 1
      t.finished("A", succeeded: false)
    }
    let other = t.shouldRead("B")
    #expect(reads == 3)
    #expect(other)
  }

  @Test func switchingTracksResetsTheCount() {
    var t = ArtworkTracker(maxAttempts: 2)
    let a1 = t.shouldRead("A")
    t.finished("A", succeeded: false)
    let b = t.shouldRead("B")
    t.finished("B", succeeded: true)
    let a2 = t.shouldRead("A")
    #expect(a1 && b && a2)
  }

  @Test func noTrackKeyIsDoneAtOnce() {
    var t = ArtworkTracker()
    let first = t.shouldRead(nil)
    t.finished(nil, succeeded: true)
    let again = t.shouldRead(nil)
    #expect(first)
    #expect(!again)
  }
}
