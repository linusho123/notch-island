import CoreGraphics
import Foundation
import Testing

@testable import IslandCore

/// When an app is fullscreen on the home screen (D125, D100): no wing pops.
struct FullscreenRuleTests {
  // The built-in screen, top-left based as the window server lists windows.
  let screen = CGRect(x: 0, y: 0, width: 1710, height: 1112)

  @Test func theFrontAppsWindowCoveringTheWholeScreenIsFullscreen() {
    let windows = [FullscreenRule.Window(pid: 7, layer: 0, bounds: screen)]
    #expect(FullscreenRule.isFullscreen(front: 7, windows: windows, screen: screen))
  }

  @Test func aWindowBelowTheMenuBarStripIsNotFullscreen() {
    // A zoomed window: the whole screen but the menu bar strip.
    let zoomed = CGRect(x: 0, y: 33, width: 1710, height: 1079)
    let windows = [FullscreenRule.Window(pid: 7, layer: 0, bounds: zoomed)]
    #expect(!FullscreenRule.isFullscreen(front: 7, windows: windows, screen: screen))
  }

  @Test func anotherAppsWindowOrAnOverlayIsNotTheFrontAppFullscreen() {
    let other = [FullscreenRule.Window(pid: 8, layer: 0, bounds: screen)]
    #expect(!FullscreenRule.isFullscreen(front: 7, windows: other, screen: screen))
    let overlay = [FullscreenRule.Window(pid: 7, layer: 25, bounds: screen)]
    #expect(!FullscreenRule.isFullscreen(front: 7, windows: overlay, screen: screen))
    #expect(!FullscreenRule.isFullscreen(front: nil, windows: other, screen: screen))
  }

  @Test func aFullscreenWindowOnTheExternalMonitorIsNotOnTheHomeScreen() {
    let external = CGRect(x: 1710, y: 0, width: 1920, height: 1080)
    let windows = [FullscreenRule.Window(pid: 7, layer: 0, bounds: external)]
    #expect(!FullscreenRule.isFullscreen(front: 7, windows: windows, screen: screen))
  }

  @Test func aWindowItsAppReportsFullscreenBelowTheBlackStripIsFullscreen() {
    // On a notched screen a fullscreen movie sits below the strip, which
    // macOS paints black: its app's own fullscreen flag tells it apart from a
    // zoomed window of the same frame.
    let below = CGRect(x: 0, y: 33, width: 1710, height: 1079)
    let windows = [FullscreenRule.Window(pid: 7, layer: 0, bounds: below, reportsFullscreen: true)]
    #expect(FullscreenRule.isFullscreen(front: 7, windows: windows, screen: screen))
  }

  @Test func aFullscreenWindowReportedOnTheExternalMonitorLeavesTheHomeScreen() {
    let external = CGRect(x: 1710, y: 0, width: 1920, height: 1080)
    let windows = [
      FullscreenRule.Window(pid: 7, layer: 0, bounds: external, reportsFullscreen: true)
    ]
    #expect(!FullscreenRule.isFullscreen(front: 7, windows: windows, screen: screen))
  }
}
