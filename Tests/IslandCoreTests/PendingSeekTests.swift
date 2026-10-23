import Foundation
import Testing

@testable import IslandCore

/// A seek waiting for a reopened file to show again (IINA, D117) does not wait
/// for ever (P2 fix S7).
struct PendingSeekTests {
  @Test func theSeekIsTakenWhenTheFileShowsAgain() {
    var pending = PendingSeek()
    pending.set(title: "rehearsal.mkv", position: 2530, at: 100)
    #expect(pending.take(title: "rehearsal.mkv", at: 103) == 2530)
    #expect(pending.take(title: "rehearsal.mkv", at: 104) == nil)
  }

  @Test func anotherFileDoesNotTakeIt() {
    var pending = PendingSeek()
    pending.set(title: "rehearsal.mkv", position: 2530, at: 100)
    #expect(pending.take(title: "other.mkv", at: 101) == nil)
  }

  @Test func aSeekThatNeverCameExpires() {
    var pending = PendingSeek()
    pending.set(title: "rehearsal.mkv", position: 2530, at: 100)
    #expect(
      pending.take(title: "rehearsal.mkv", at: 100 + 3600) == nil,
      "a stale seek jumped a later play")
  }
}
