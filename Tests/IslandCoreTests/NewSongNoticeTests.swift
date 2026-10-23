import CoreGraphics
import Foundation
import Testing

@testable import IslandCore

private func song(_ title: String, trackID: String? = nil) -> Song {
  Song(title: title, artist: "Oasis", source: "Apple Music", trackID: trackID, duration: 300)
}

private func playing(_ title: String, at position: TimeInterval = 0, readAt: TimeInterval = 100)
  -> SourceReport
{
  SourceReport(song: song(title), state: .playing, position: position, readAt: readAt)
}

/// When a new song starts (D115, D78): the hub hands the notice to the island.
struct NewSongDetectorTests {
  @Test func theNextSongPlayingInASourceIsANewSong() {
    var d = NewSongDetector()
    _ = d.take(.appleMusic, playing("Wonderwall", at: 290))
    #expect(d.take(.appleMusic, playing("Champagne Supernova", at: 0.2)) != nil)
  }

  @Test func theSameSongReportedAgainIsNotANewSong() {
    var d = NewSongDetector()
    _ = d.take(.appleMusic, playing("Wonderwall", at: 0.1))
    #expect(d.take(.appleMusic, playing("Wonderwall", at: 12)) == nil)
  }

  @Test func aResumeAfterAPauseIsNotANewSong() {
    var d = NewSongDetector()
    _ = d.take(.appleMusic, playing("Wonderwall", at: 30))
    let paused = SourceReport(song: song("Wonderwall"), state: .paused, position: 40, readAt: 110)
    #expect(d.take(.appleMusic, paused) == nil)
    #expect(d.take(.appleMusic, playing("Wonderwall", at: 40, readAt: 120)) == nil)
  }

  @Test func aSongSkippedToWhilePausedIsNewWhenItPlays() {
    var d = NewSongDetector()
    _ = d.take(.appleMusic, playing("Wonderwall", at: 30))
    let paused = SourceReport(
      song: song("Champagne Supernova"), state: .paused, position: 0, readAt: 110)
    #expect(d.take(.appleMusic, paused) == nil)
    #expect(d.take(.appleMusic, playing("Champagne Supernova", at: 0, readAt: 115)) != nil)
  }

  @Test func aSongFoundMidwayWhenTheIslandStartsIsNotANewSong() {
    var d = NewSongDetector()
    #expect(d.take(.appleMusic, playing("Wonderwall", at: 95)) == nil)
  }

  @Test func aSourceThatStartsFromTheTopIsANewSong() {
    // A tab that starts a video, an app that starts playing.
    var d = NewSongDetector()
    #expect(d.take(.chromeTab(4), playing("Lecture 4: Fourier Series", at: 0.4)) != nil)
  }

  @Test func eachSourceKeepsItsOwnSong() {
    var d = NewSongDetector()
    _ = d.take(.appleMusic, playing("Wonderwall", at: 10))
    _ = d.take(.iina, playing("part-1.mkv", at: 1))
    #expect(d.take(.appleMusic, playing("Wonderwall", at: 11)) == nil)
    #expect(d.take(.iina, playing("part-2.mkv", at: 0.3)) != nil)
  }

  @Test func twoTracksOfOneTitleAreToldApartByTheAppsOwnID() {
    var d = NewSongDetector()
    let a = SourceReport(
      song: song("Intro", trackID: "A1"), state: .playing, position: 100, readAt: 1)
    let b = SourceReport(
      song: song("Intro", trackID: "B2"), state: .playing, position: 0, readAt: 2)
    _ = d.take(.appleMusic, a)
    #expect(d.take(.appleMusic, b) != nil)
  }

  @Test func theStartIsBackDatedByThePositionTheAppReports() {
    // The song started when the app's own playhead says, not when the
    // island happened to read it, so the fold is four seconds after the start.
    var d = NewSongDetector()
    _ = d.take(.appleMusic, playing("Wonderwall", at: 290, readAt: 50))
    let started = d.take(.appleMusic, playing("Champagne Supernova", at: 0.6, readAt: 100))
    #expect(started != nil)
    #expect(abs((started ?? 0) - 99.4) < 0.001)
  }

  @Test func aLateReadIsBackDatedAtMostASecondAndAHalf() {
    var d = NewSongDetector()
    _ = d.take(.appleMusic, playing("Wonderwall", at: 290, readAt: 50))
    let started = d.take(.appleMusic, playing("Champagne Supernova", at: 3, readAt: 100))
    #expect(abs((started ?? 0) - 98.5) < 0.001)
  }

  @Test func aSourceThatLeftAndCameBackStartsAfresh() {
    var d = NewSongDetector()
    _ = d.take(.quickTime, playing("holiday.mov", at: 5))
    d.forget(.quickTime)
    #expect(d.take(.quickTime, playing("holiday.mov", at: 0.5)) != nil)
  }

  @Test func aStoppedOrEmptyReportIsNoSong() {
    var d = NewSongDetector()
    let stopped = SourceReport(song: nil, state: .stopped, position: nil, readAt: 1)
    #expect(d.take(.appleMusic, stopped) == nil)
  }
}

/// The wing's room (D113, D114): the cover art and as much of the title as
/// fits in the free gap left of the notch; with less room the title goes
/// first and the art shows alone; when even the art does not fit, nothing.
struct WingLayoutTests {
  /// Widths as the system font at the wing's size gives them (12 pt).
  static let widths: [String: CGFloat] = [
    "Champagne Su…": 95.51, "Champagne Sup…": 102.71, "Champagne Supernova": 131.47,
    "C…": 18.25, "…": 9.66,
  ]
  static func measure(_ s: String) -> CGFloat {
    // Known strings exactly; others about 7.3 points a character.
    widths[s] ?? CGFloat(s.count) * 7.3
  }

  @Test func a135PointGapAsWithChromeInFrontShowsTheArtAndChampagneSu() {
    let fit = WingLayout.fit(title: "Champagne Supernova", gap: 135, measure: Self.measure)
    guard case .artAndTitle(let title, let width) = fit else {
      Issue.record("no title: \(fit)")
      return
    }
    #expect(title == "Champagne Su…")
    #expect(width <= 135 - WingLayout.menuMargin)
  }

  @Test func aWideGapShowsTheWholeTitle() {
    let fit = WingLayout.fit(title: "Champagne Supernova", gap: 400, measure: Self.measure)
    guard case .artAndTitle(let title, let width) = fit else {
      Issue.record("no title: \(fit)")
      return
    }
    #expect(title == "Champagne Supernova")
    #expect(width < 400)
    #expect(width >= 131.47 + WingLayout.art)
  }

  @Test func aGapForTheArtButNotOneLetterShowsTheArtAlone() {
    let fit = WingLayout.fit(title: "Champagne Supernova", gap: 45, measure: Self.measure)
    guard case .artOnly(let width) = fit else {
      Issue.record("not the art alone: \(fit)")
      return
    }
    #expect(width <= 45 - WingLayout.menuMargin)
    #expect(width >= WingLayout.art)
  }

  @Test func aGapTooNarrowForTheArtShowsNothing() {
    #expect(WingLayout.fit(title: "Champagne Supernova", gap: 25, measure: Self.measure) == .none)
    #expect(WingLayout.fit(title: "Champagne Supernova", gap: 0, measure: Self.measure) == .none)
    #expect(WingLayout.fit(title: "Champagne Supernova", gap: -10, measure: Self.measure) == .none)
  }

  @Test func theBoundariesBetweenNothingArtAloneAndATitle() {
    let artOnly = WingLayout.menuMargin + WingLayout.artOnlyWidth
    #expect(WingLayout.fit(title: "Champagne", gap: artOnly - 0.5, measure: Self.measure) == .none)
    if case .artOnly = WingLayout.fit(title: "Champagne", gap: artOnly, measure: Self.measure) {
    } else {
      Issue.record("not the art alone at exactly its width")
    }
    let oneLetter = WingLayout.menuMargin + WingLayout.titleOverhead + 18.25
    if case .artAndTitle(let t, _) = WingLayout.fit(
      title: "Champagne", gap: oneLetter, measure: Self.measure)
    {
      #expect(t == "C…")
    } else {
      Issue.record("no first letter at its width")
    }
  }

  @Test func theWingNeverReachesPastTheGap() {
    for gap in stride(from: CGFloat(0), through: 300, by: 7) {
      switch WingLayout.fit(title: "Champagne Supernova", gap: gap, measure: Self.measure) {
      case .none: break
      case .artOnly(let w), .artAndTitle(_, let w): #expect(w + WingLayout.menuMargin <= gap)
      }
    }
  }

  @Test func aShortenedTitleDropsATrailingSpaceBeforeTheEllipsis() {
    #expect(
      WingLayout.shortened(
        "Champagne Supernova", toFit: 80,
        measure: { $0 == "Champagne…" ? 76 : CGFloat($0.count) * 8 }) == "Champagne…")
  }
}

/// The free gap left of the notch, measured live from the frontmost app's
/// menu bar items and any status items there (D114); top-left coordinates.
struct MenuBarGapTests {
  let home = CGRect(x: 0, y: 0, width: 1710, height: 1107)
  let notch = CGRect(x: 763, y: 0, width: 185, height: 33)

  func items(_ maxXs: [CGFloat], screenX: CGFloat = 0, y: CGFloat = 0) -> [CGRect] {
    var x = screenX + 10
    return maxXs.map { m in
      defer { x = screenX + m }
      return CGRect(x: x, y: y, width: screenX + m - x, height: 33)
    }
  }

  @Test func chromesHelpMenuEndingAt628Leaves135() {
    let gap = MenuBarGap.width(
      notch: notch, home: home, menuItems: items([40, 120, 628]), menuScreen: home,
      statusItems: [])
    #expect(gap == 135)
  }

  @Test func noMenuItemsReadMeansNoRoom() {
    #expect(
      MenuBarGap.width(notch: notch, home: home, menuItems: [], menuScreen: home, statusItems: [])
        == nil)
  }

  @Test func aMenuReachingUnderTheNotchLeavesNothing() {
    let gap = MenuBarGap.width(
      notch: notch, home: home, menuItems: items([300, 780]), menuScreen: home, statusItems: [])
    #expect(gap == 0)
  }

  @Test func menuItemsHiddenRightOfTheNotchDoNotCount() {
    var list = items([300, 600])
    list.append(CGRect(x: 1000, y: 0, width: 40, height: 33))
    list.append(CGRect(x: 650, y: 0, width: 0, height: 33))  // zero width: hidden
    let gap = MenuBarGap.width(
      notch: notch, home: home, menuItems: list, menuScreen: home, statusItems: [])
    #expect(gap == 163)
  }

  @Test func aStatusIconLeftOfTheNotchNarrowsTheGap() {
    let gap = MenuBarGap.width(
      notch: notch, home: home, menuItems: items([300]), menuScreen: home,
      statusItems: [CGRect(x: 700, y: 0, width: 30, height: 33)])
    #expect(gap == 33)
  }

  @Test func statusIconsRightOfTheNotchOrOnAnotherScreenDoNotCount() {
    let gap = MenuBarGap.width(
      notch: notch, home: home, menuItems: items([300]), menuScreen: home,
      statusItems: [
        CGRect(x: 1210, y: 0, width: 30, height: 33),
        CGRect(x: -900, y: -400, width: 30, height: 24),
      ])
    #expect(gap == 463)
  }

  @Test func menusOnAnExternalMonitorAreLaidOutTheSameOnTheBuiltInScreen() {
    // The visionary works in Chrome on the external monitor: Accessibility
    // gives the menu bar there; the built-in screen's menu bar shows the same
    // menus from its own left edge (D16).
    let external = CGRect(x: -1920, y: -200, width: 1920, height: 1080)
    let gap = MenuBarGap.width(
      notch: notch, home: home, menuItems: items([40, 120, 628], screenX: -1920, y: -200),
      menuScreen: external, statusItems: [])
    #expect(gap == 135)
  }
}

/// Four seconds out after the last song started, held through fast skips
/// (D115, D44).
struct WingHoldTests {
  @Test func theWingFoldsFourSecondsAfterTheSongStarted() {
    var hold = WingHold()
    hold.songStarted(at: 10)
    #expect(hold.isOut(at: 10))
    #expect(hold.isOut(at: 13.9))
    #expect(!hold.isOut(at: 14.01))
    #expect(hold.foldAt == 14)
  }

  @Test func eachNewSongWhileOutHoldsItFourSecondsMore() {
    var hold = WingHold()
    for i in 0..<20 { hold.songStarted(at: 10 + Double(i)) }
    #expect(hold.isOut(at: 29 + 3.9))
    #expect(!hold.isOut(at: 29 + 4.01))
  }

  @Test func notOutBeforeAnySong() {
    #expect(!WingHold().isOut(at: 0))
  }

  @Test func theWingPopsOnlyWhileTheIslandIsClosedAndNothingIsFullscreen() {
    let fit = WingFit.artOnly(width: 34)
    #expect(WingHold.pops(fit: fit, islandOpen: false, fullscreen: false))
    #expect(!WingHold.pops(fit: fit, islandOpen: true, fullscreen: false))
    #expect(!WingHold.pops(fit: fit, islandOpen: false, fullscreen: true))
    #expect(!WingHold.pops(fit: .none, islandOpen: false, fullscreen: false))
  }
}
