import Foundation
import Testing

@testable import IslandCore

/// D112: back goes to the previous song at three seconds in or earlier, `0:03`
/// itself included, and restarts the song later.
struct BackRuleTests {
  @Test(arguments: [0.0, 0.5, 2.0, 2.99, 3.0, 3.5, 3.999])
  func atThreeSecondsOrEarlierBackGoesToThePreviousSong(position: Double) {
    #expect(backAction(atPosition: position) == .previousSong)
  }

  @Test(arguments: [4.0, 4.01, 100.0, 7200.0])
  func laterBackRestartsTheSong(position: Double) {
    #expect(backAction(atPosition: position) == .restartSong)
  }

  @Test func anUnreadablePositionGoesBack() {
    #expect(backAction(atPosition: .nan) == .previousSong)
  }

  @Test func playbackTimesReadAsTheIslandShowsThem() {
    #expect(formatPlaybackTime(0) == "0:00")
    #expect(formatPlaybackTime(3.9) == "0:03")
    #expect(formatPlaybackTime(100) == "1:40")
    #expect(formatPlaybackTime(4335) == "1:12:15")
    #expect(formatPlaybackTime(-2) == "0:00")
    #expect(formatPlaybackTime(.infinity) == "0:00")
  }
}

/// D124: back acts on what the app reports, never on a guess.
struct BackOnFailedReadTests {
  @Test func aFailedReadIsReadAgainOnceAndUsed() {
    var reads: [TimeInterval?] = [nil, 120]
    let action = backAction(reading: { reads.removeFirst() })
    #expect(action == .restartSong)
    #expect(reads.isEmpty)
  }

  @Test func aReadThatWorksIsNotRepeated() {
    var count = 0
    let action = backAction(reading: {
      count += 1
      return 1
    })
    #expect(action == .previousSong)
    #expect(count == 1)
  }

  @Test func twoFailedReadsSendNothing() {
    var count = 0
    let action = backAction(reading: {
      count += 1
      return nil
    })
    #expect(action == nil)
    #expect(count == 2)
  }
}
