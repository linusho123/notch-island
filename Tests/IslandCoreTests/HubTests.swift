import Foundation
import Testing

@testable import IslandCore

/// The full hub (P2): newest source in front, the flip and its count, a
/// source that cannot be seen separately, a source leaving, and the last song
/// resumed where its app quit. The source line names the speaker only when it
/// is not the built-in one.
struct HubTests {
  let wonderwall = Song(
    title: "Wonderwall", artist: "Oasis", source: "Apple Music", trackID: "W", duration: 258,
    sourceID: .appleMusic)
  let lecture = Song(
    title: "Lecture 4: Fourier Series", artist: nil, source: "YouTube", trackID: nil,
    duration: 3000, sourceID: .chromeTab(7))
  let rehearsal = Song(
    title: "rehearsal.mkv", artist: nil, source: "IINA", trackID: nil, duration: 3600,
    sourceID: .iina)
  let holiday = Song(
    title: "holiday.mov", artist: nil, source: "QuickTime Player", trackID: nil, duration: 60,
    sourceID: .quickTime)

  func playing(_ song: Song, at position: TimeInterval = 10, readAt: TimeInterval = 0)
    -> SourceReport
  {
    SourceReport(song: song, state: .playing, position: position, readAt: readAt)
  }

  @Test func oneSourceHasNoFlip() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    #expect(hub.page.flip == nil)
    #expect(hub.page.content == .current(wonderwall))
  }

  @Test func theNewestSourceTakesTheCardWithOneOfTwo() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.chromeTab(7), playing(lecture))
    #expect(hub.page.content == .current(lecture))
    #expect(hub.page.flip == FlipCount(index: 0, count: 2))
    #expect(hub.page.flip?.label == "1 of 2")
  }

  @Test func aLaterReportFromTheOlderSourceDoesNotTakeTheCard() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.chromeTab(7), playing(lecture))
    hub.update(.appleMusic, playing(wonderwall, at: 20, readAt: 5))
    #expect(hub.page.content == .current(lecture))
  }

  @Test func flippingTurnsToTheOtherSourceAsTwoOfTwoAndBack() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.chromeTab(7), playing(lecture))
    hub.flip()
    #expect(hub.page.content == .current(wonderwall))
    #expect(hub.page.flip?.label == "2 of 2")
    #expect(hub.shownID == .appleMusic)
    hub.flip()
    #expect(hub.page.content == .current(lecture))
    #expect(hub.page.flip?.label == "1 of 2")
  }

  @Test(arguments: [
    (1, "rehearsal.mkv", "2 of 3"), (2, "Wonderwall", "3 of 3"),
    (3, "Lecture 4: Fourier Series", "1 of 3"), (4, "rehearsal.mkv", "2 of 3"),
  ])
  func threeSourcesCycleNewestFirst(flips: Int, title: String, count: String) {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.iina, playing(rehearsal))
    hub.update(.chromeTab(7), playing(lecture))
    for _ in 0..<flips { hub.flip() }
    #expect(hub.page.song?.title == title)
    #expect(hub.page.flip?.label == count)
  }

  @Test(arguments: [
    (1, "Wonderwall", "2 of 2"), (2, "Lecture 4: Fourier Series", "1 of 2"),
    (3, "Wonderwall", "2 of 2"),
  ])
  func aSourceThatCannotBeSeenSeparatelyHasNoFace(flips: Int, title: String, count: String) {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.iina, playing(rehearsal))
    hub.update(.chromeTab(7), playing(lecture))
    hub.hide(.iina)
    for _ in 0..<flips { hub.flip() }
    #expect(hub.page.song?.title == title)
    #expect(hub.page.flip?.label == count)
  }

  @Test func aHiddenSourceComingBackKeepsItsTurnAndDoesNotTakeTheCard() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.iina, playing(rehearsal))
    hub.update(.chromeTab(7), playing(lecture))
    hub.hide(.iina)
    hub.update(.iina, playing(rehearsal))
    #expect(hub.faces == [.chromeTab(7), .iina, .appleMusic])
    #expect(hub.page.content == .current(lecture))
  }

  @Test(arguments: [
    (SourceID.appleMusic, "Lecture 4: Fourier Series"),
    (SourceID.chromeTab(7), "rehearsal.mkv"),
    (SourceID.iina, "Lecture 4: Fourier Series"),
  ])
  func whenASourceLeavesTheNewestRemainingShows(gone: SourceID, shown: String) {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.iina, playing(rehearsal))
    hub.update(.chromeTab(7), playing(lecture))
    hub.leave(gone, at: 5)
    #expect(hub.page.song?.title == shown)
    #expect(!hub.faces.contains(gone))
    #expect(hub.page.flip?.count == 2)
    for _ in 0..<4 {
      hub.flip()
      #expect(hub.shownID != gone)
    }
  }

  @Test func aFlippedFaceThatLeavesTurnsTheCardToTheNewest() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.chromeTab(7), playing(lecture))
    hub.flip()
    hub.leave(.appleMusic, at: 1)
    #expect(hub.page.content == .current(lecture))
    #expect(hub.page.flip == nil)
  }

  @Test func quittingTheOnlySourceLeavesItsSongPausedAndReadyWithItsPlace() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall, at: 130, readAt: 100))
    hub.leave(.appleMusic, at: 102)
    #expect(hub.page.content == .lastSong(wonderwall))
    #expect(hub.page.playEnabled)
    #expect(!hub.page.controlsEnabled)
    #expect(hub.resumeAt == 132)
  }

  @Test func anAppSayingStoppedJustBeforeItQuitsKeepsItsPlace() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall, at: 130, readAt: 100))
    hub.update(
      .appleMusic, SourceReport(song: nil, state: .stopped, position: nil, readAt: 101))
    hub.leave(.appleMusic, at: 101.5)
    #expect(hub.resumeAt == 131)
  }

  @Test func aStopWithTheAppStillRunningStartsTheSongAgain() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall, at: 130, readAt: 100))
    hub.update(
      .appleMusic, SourceReport(song: nil, state: .stopped, position: nil, readAt: 101))
    #expect(hub.page.content == .lastSong(wonderwall))
    #expect(hub.resumeAt == nil)
    hub.leave(.appleMusic, at: 200)
    #expect(hub.resumeAt == nil)
  }

  @Test func theLastSongIsTheNewestSourcesSong() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.chromeTab(7), playing(lecture))
    hub.update(.appleMusic, playing(wonderwall, at: 30, readAt: 9))
    #expect(hub.lastSong == lecture)
  }

  @Test func playingAgainClearsThePlaceToResume() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall, at: 130))
    hub.leave(.appleMusic, at: 0)
    hub.update(.appleMusic, playing(wonderwall, at: 130, readAt: 3))
    #expect(hub.resumeAt == nil)
  }

  @Test func aNewSourceAfterAFlipShowsInFront() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(.appleMusic, playing(wonderwall))
    hub.update(.chromeTab(7), playing(lecture))
    hub.flip()
    hub.update(.quickTime, playing(holiday))
    #expect(hub.page.content == .current(holiday))
    #expect(hub.page.flip?.label == "1 of 3")
  }

  @Test func theStoreKeepsWhereTheLastSongWas() throws {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("island-store-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let store = LastSongStore(directory: dir)
    try store.save(rehearsal, resumeAt: 2530)
    #expect(LastSongStore(directory: dir).loadKept() == KeptSong(song: rehearsal, resumeAt: 2530))
  }

  @Test func theStoreReadsTheSongP1Kept() throws {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("island-store-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let old = Song(
      title: "Wonderwall", artist: "Oasis", source: "Apple Music", trackID: "W", duration: 258)
    try JSONEncoder().encode(old).write(to: dir.appendingPathComponent("last-song.json"))
    #expect(LastSongStore(directory: dir).loadKept() == KeptSong(song: old, resumeAt: nil))
  }

  @Test(arguments: [
    ("Apple Music", nil as OutputDevice?, "Apple Music"),
    ("Apple Music", OutputDevice(name: "MacBook Air Speakers", isBuiltIn: true), "Apple Music"),
    ("Apple Music", OutputDevice(name: "JBL Flip 5", isBuiltIn: false), "Apple Music · JBL Flip 5"),
    ("YouTube", OutputDevice(name: "JBL Flip 5", isBuiltIn: false), "YouTube · JBL Flip 5"),
    ("SoundCloud", OutputDevice(name: "MacBook Air Speakers", isBuiltIn: true), "SoundCloud"),
    ("IINA", OutputDevice(name: "", isBuiltIn: false), "IINA"),
  ])
  func theSourceLineNamesTheSpeakerOnlyWhenItIsNotBuiltIn(
    source: String, output: OutputDevice?, line: String
  ) {
    let song = Song(title: "x", artist: nil, source: source, trackID: nil, duration: nil)
    #expect(sourceLine(for: song, output: output) == line)
  }
}
