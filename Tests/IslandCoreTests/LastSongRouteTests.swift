import Foundation
import Testing

@testable import IslandCore

/// Play on a kept last song reopens it from its own source, never another
/// (P2 fix M2, D117, D124).
struct LastSongRouteTests {
  func chromeSong(_ url: String?, tab: Int = 7) -> Song {
    Song(
      title: "Lecture 4", artist: nil, source: "YouTube", trackID: nil, duration: 3000,
      sourceID: .chromeTab(tab), location: url)
  }

  func route(
    _ song: Song, live: Set<SourceID> = [.appleMusic], closed: Bool = false, at: TimeInterval? = 125
  )
    -> LastSongRoute
  {
    LastSongRouting.route(song, liveParts: live, closedTabKnown: closed, resumeAt: at)
  }

  @Test func aChromeSongAfterTheIslandRestartedReopensItsPageNotAppleMusic() {
    let r = route(chromeSong("https://www.youtube.com/watch?v=l4"))
    #expect(r == .openPage(URL(string: "https://www.youtube.com/watch?v=l4&t=125s")!))
  }

  @Test func aChromeSongAfterChromeQuitReopensItsPage() {
    let r = route(chromeSong("https://soundcloud.com/a/mix"), live: [.appleMusic], closed: false)
    #expect(r == .openPage(URL(string: "https://soundcloud.com/a/mix#t=2:05")!))
  }

  @Test func aChromeSongWithAKnownClosedTabGoesThroughTheExtension() {
    #expect(
      route(chromeSong("https://www.youtube.com/watch?v=l4"), closed: true) == .part(.chromeTab(7)))
  }

  @Test func aChromeSongWithNoPageDoesNothing() {
    #expect(route(chromeSong(nil)) == .nothing)
  }

  @Test func onlyYouTubeAndSoundCloudPagesAreOpened() {
    #expect(route(chromeSong("https://evil.example/watch")) == .nothing)
    #expect(route(chromeSong("https://youtube.com.evil.example/")) == .nothing)
    #expect(route(chromeSong("file:///etc/passwd")) == .nothing)
    #expect(route(chromeSong("javascript:alert(1)")) == .nothing)
  }

  @Test func aPlaybackFromNoPartNeverStartsAppleMusic() {
    let iina = Song(
      title: "a.mkv", artist: nil, source: "IINA", trackID: nil, duration: 1, sourceID: .iina)
    #expect(route(iina, live: [.appleMusic]) == .nothing)
  }

  @Test func appleMusicAndLiveSourcesRouteToThemselves() {
    let music = Song(
      title: "W", artist: nil, source: "Apple Music", trackID: "A", duration: 1,
      sourceID: .appleMusic)
    #expect(route(music) == .part(.appleMusic))
    let qt = Song(
      title: "h.mov", artist: nil, source: "QuickTime Player", trackID: nil, duration: 1,
      sourceID: .quickTime)
    #expect(route(qt, live: [.appleMusic, .quickTime]) == .part(.quickTime))
  }

  @Test func aSongKeptBeforeSourcesWereTrackedIsAppleMusics() {
    let old = Song(title: "W", artist: nil, source: "Apple Music", trackID: "A", duration: 1)
    #expect(route(old) == .part(.appleMusic))
  }
}
