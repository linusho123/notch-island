import Foundation
import Testing

@testable import IslandCore

/// The minimal hub: it shows only what the source reports (D124), keeps the
/// last song paused and ready (D31), and reads "Nothing played yet" before any
/// song (D90).
struct NowPlayingTests {
  let wonderwall = Song(
    title: "Wonderwall", artist: "Oasis", source: "Apple Music", trackID: "ABC", duration: 258)

  @Test func beforeAnySongTheMusicPageReadsNothingPlayedYet() {
    let hub = NowPlayingHub(lastSong: nil)
    #expect(hub.page.content == .nothingPlayedYet)
    #expect(!hub.page.controlsEnabled)
    #expect(!hub.page.isPlaying)
  }

  @Test func aPlayingSongShowsWithPause() {
    var hub = NowPlayingHub(lastSong: nil)
    let changed = hub.update(
      SourceReport(song: wonderwall, state: .playing, position: 100, readAt: 0))
    #expect(changed)
    #expect(hub.page.content == .current(wonderwall))
    #expect(hub.page.isPlaying)
    #expect(hub.lastSong == wonderwall)
  }

  @Test func aPausedSongShowsWithPlay() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(SourceReport(song: wonderwall, state: .paused, position: 100, readAt: 0))
    #expect(hub.page.content == .current(wonderwall))
    #expect(!hub.page.isPlaying)
  }

  @Test func withNothingPlayingTheLastSongIsPausedAndReady() {
    var hub = NowPlayingHub(lastSong: nil)
    hub.update(SourceReport(song: wonderwall, state: .playing, position: 10, readAt: 0))
    hub.update(SourceReport(song: nil, state: .stopped, position: nil, readAt: 1))
    #expect(hub.page.content == .lastSong(wonderwall))
    #expect(!hub.page.isPlaying)
    #expect(hub.page.controlsEnabled)
  }

  @Test func theLastSongComesFromTheStoreAfterARestart() {
    let hub = NowPlayingHub(lastSong: wonderwall)
    #expect(hub.page.content == .lastSong(wonderwall))
  }

  @Test func theSameSongAgainIsNoNewLastSong() {
    var hub = NowPlayingHub(lastSong: wonderwall)
    let changed = hub.update(
      SourceReport(song: wonderwall, state: .playing, position: 0, readAt: 0))
    #expect(!changed)
  }

  @Test func thePositionCarriesOnOnlyWhilePlaying() {
    let playing = SourceReport(song: wonderwall, state: .playing, position: 100, readAt: 50)
    #expect(playing.position(at: 52) == 102)
    let paused = SourceReport(song: wonderwall, state: .paused, position: 100, readAt: 50)
    #expect(paused.position(at: 52) == 100)
    let nearEnd = SourceReport(song: wonderwall, state: .playing, position: 257, readAt: 0)
    #expect(nearEnd.position(at: 10) == 258)
  }

  @Test func theStoreKeepsTheLastSong() throws {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("island-store-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let store = LastSongStore(directory: dir)
    #expect(store.load() == nil)
    try store.save(wonderwall)
    #expect(LastSongStore(directory: dir).load() == wonderwall)
  }
}
