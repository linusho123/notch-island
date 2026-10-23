import Foundation
import Testing

@testable import IslandCore

/// The shared now-playing channel when its adapter ends or fails (P2 fix M3).
struct ChannelModelTests {
  func line(_ object: [String: Any]) -> Data {
    (try! JSONSerialization.data(withJSONObject: object)) + Data([0x0A])
  }

  let iinaPlaying: [String: Any] = [
    "type": "nowPlaying", "pid": 321, "title": "rehearsal.mkv", "playing": true, "rate": 1.0,
    "elapsed": 10.0, "timestamp": 100.0, "duration": 3600.0,
  ]

  func playing() -> ChannelModel {
    var model = ChannelModel()
    model.started(at: 0)
    _ = model.take(line(iinaPlaying), bundleID: { _ in "com.colliderli.iina" })
    return model
  }

  @Test func theChannelShowsWhatTheAdapterSays() {
    let model = playing()
    #expect(model.info?.bundleID == "com.colliderli.iina")
    #expect(model.info?.playing == true)
  }

  @Test func whenTheAdapterEndsTheChannelIsNoLongerKnown() {
    var model = playing()
    let (effects, _) = model.ended(at: 60)
    #expect(model.info == nil)
    #expect(effects == [.changed(nil)])
  }

  @Test func aHealthyAdapterIsRestartedSoon() {
    var model = playing()
    let (_, decision) = model.ended(at: 60)
    #expect(decision == .restart(after: 2))
  }

  @Test func quickRepeatedExitsBackOffThenStop() {
    var model = ChannelModel()
    var delays: [TimeInterval] = []
    var time: TimeInterval = 0
    var gaveUp = false
    for _ in 0..<12 {
      model.started(at: time)
      time += 0.5
      let (_, decision) = model.ended(at: time)
      switch decision {
      case .restart(let after):
        delays.append(after)
        time += after
      case .giveUp:
        gaveUp = true
      }
      if gaveUp { break }
    }
    #expect(gaveUp, "an adapter that keeps exiting at once is respawned forever")
    #expect(delays == delays.sorted() && delays.last! > delays.first!, "no back-off: \(delays)")
  }

  @Test func anErrorLineMarksTheChannelDeadAndGivesUp() {
    var model = playing()
    let effects = model.take(
      line(["type": "error", "message": "MediaRemote could not be loaded"]), bundleID: { _ in nil })
    #expect(effects == [.dead])
    let (_, decision) = model.ended(at: 1)
    #expect(decision == .giveUp)
  }

  @Test func aLongHealthyRunResetsTheBackOff() {
    var model = ChannelModel()
    for i in 0..<3 {
      model.started(at: Double(i))
      _ = model.ended(at: Double(i) + 0.5)
    }
    model.started(at: 100)
    _ = model.ended(at: 200)
    model.started(at: 201)
    let (_, decision) = model.ended(at: 201.5)
    #expect(decision == .restart(after: 2))
  }
}

/// The island's skip reaches QuickTime Player as the system's next command,
/// and only when the channel shows QuickTime (P2 fix S8, D46).
struct ChannelRoutingTests {
  func info(_ bundle: String?) -> ChannelInfo? {
    ChannelInfo(
      bundleID: bundle, pid: 1, title: "t", artist: nil, duration: nil, elapsed: nil,
      timestamp: nil, rate: 1, playing: true, readAt: 0)
  }

  @Test func theCommandIsSentWhenTheChannelShowsThatApp() {
    #expect(info("com.apple.QuickTimePlayerX").shows("com.apple.QuickTimePlayerX"))
  }

  @Test func theCommandIsNotSentWhenTheChannelShowsAnotherAppOrNone() {
    #expect(!info("com.colliderli.iina").shows("com.apple.QuickTimePlayerX"))
    #expect(!info(nil).shows("com.apple.QuickTimePlayerX"))
    let none: ChannelInfo? = nil
    #expect(!none.shows("com.apple.QuickTimePlayerX"))
  }
}
