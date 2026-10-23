import Foundation
import Testing

@testable import IslandCore

/// The two timers the island keeps, both by ruling: QuickTime Player about
/// once a second while it is open (D132), and Music's playhead every 10 to 15
/// seconds while Music plays (D133). Nothing runs otherwise.
struct PollPolicyTests {
  @Test func musicsPlayheadIsCheckedEveryTenToFifteenSecondsWhilePlaying() {
    let interval = PollPolicy.musicPlayhead(isPlaying: true)
    #expect(interval != nil)
    #expect((10...15).contains(interval ?? 0))
  }

  @Test func musicsPlayheadIsNotCheckedWhilePausedOrStopped() {
    #expect(PollPolicy.musicPlayhead(isPlaying: false) == nil)
  }

  @Test func quickTimeIsCheckedAboutOnceASecondOnlyWhileOpen() {
    #expect(PollPolicy.quickTime(isOpen: true) == 1)
    #expect(PollPolicy.quickTime(isOpen: false) == nil)
  }
}
