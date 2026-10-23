import Foundation
import Testing

@testable import IslandCore

/// A QuickTime read that failed is no report (P2 fix M1); a read that
/// succeeded and found nothing is "stopped".
struct QuickTimeReadTests {
  let doc = QuickTimeDocument(
    name: "holiday.mov", path: "/tmp/holiday.mov", duration: 60, playing: true, currentTime: 3)

  @Test func aFailedReadIsNoReport() {
    #expect(QuickTimeRead.report(id: .quickTime, documents: nil, at: 5) == nil)
  }

  @Test func aSuccessfulReadOfNoDocumentIsStopped() {
    let report = QuickTimeRead.report(id: .quickTime, documents: [], at: 5)
    #expect(report?.state == .stopped)
    #expect(report?.song == nil)
  }

  @Test func aPlayingDocumentIsPreferred() {
    var paused = doc
    paused.name = "other.mov"
    paused.playing = false
    let report = QuickTimeRead.report(id: .quickTime, documents: [paused, doc], at: 5)
    #expect(report?.song?.title == "holiday.mov")
    #expect(report?.state == .playing)
  }

  @Test func aFailedReadMustNotTakeTheFrontFromTheNewestSource() {
    var hub = NowPlayingHub(lastSong: nil)
    let music = Song(
      title: "Wonderwall", artist: "Oasis", source: "Apple Music", trackID: "W", duration: 258,
      sourceID: .appleMusic)
    func feed(_ id: SourceID, _ report: SourceReport?) {
      if let report { hub.update(id, report) }
    }
    feed(.quickTime, QuickTimeRead.report(id: .quickTime, documents: [doc], at: 1))
    feed(
      .appleMusic,
      SourceReport(song: music, state: .playing, position: 1, readAt: 2))
    feed(.quickTime, QuickTimeRead.report(id: .quickTime, documents: nil, at: 3))
    feed(.quickTime, QuickTimeRead.report(id: .quickTime, documents: [doc], at: 4))
    #expect(hub.page.content == .current(music))
    #expect(hub.page.flip == FlipCount(index: 0, count: 2))
  }
}

struct QuickTimeScriptTests {
  @Test func aCommandSentByNameNeverStartsQuickTime() {
    let script = QuickTimeScripts.command("play front document")
    let guardRange = script.range(of: "is not running")
    let tellRange = script.range(of: "tell application \"QuickTime Player\"")
    #expect(guardRange != nil, "no check that QuickTime runs: \(script)")
    if let g = guardRange, let t = tellRange {
      #expect(g.lowerBound < t.lowerBound, "the check comes after the command")
    }
    #expect(script.contains("play front document"))
  }
}
