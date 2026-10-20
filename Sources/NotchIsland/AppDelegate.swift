import AppKit
import IslandCore
import ServiceManagement

/// The agent app: no Dock icon, no app menu, no window but the island. It
/// starts by itself at every login (D60) through the system's login-item
/// service for the main app.
final class AppDelegate: NSObject, NSApplicationDelegate {
  private let contextGuard = ContextGuard()
  private var island: IslandController?
  private let music = AppleMusicSource()
  private var hub: NowPlayingHub
  private let store: LastSongStore

  override init() {
    let directory =
      TestInput.dataDirectory
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("notch-island", isDirectory: true)
    store = LastSongStore(directory: directory)
    hub = NowPlayingHub(lastSong: store.load())
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    if TestInput.unregisterLoginAndExit {
      try? SMAppService.mainApp.unregister()
      exit(0)
    }
    registerLoginItem()

    let island = IslandController(timing: Self.timing, contextGuard: contextGuard)
    self.island = island
    let model = island.model
    model.music = hub.page
    model.onPlayPause = { [weak self] in self?.playPause() }
    model.onBack = { [weak self] in self?.music.back() }
    model.onSkip = { [weak self] in self?.music.skip() }
    model.onSeek = { [weak self] in self?.music.seek(to: $0) }
    model.onBringForward = { [weak self] in self?.music.bringForward() }
    island.onOpenRefresh = { [weak self] in self?.music.refresh() }

    music.onReport = { [weak self] report in self?.take(report) }
    music.onArtwork = { image in model.artwork = image }
    contextGuard.onScreensChanged = { island.place() }
    contextGuard.start()
    island.place()
    music.start()
  }

  /// The rest and grace times (D51, D52) are tuned on the machine (BUILD-PLAN
  /// Q3): in a debug or test build only, the defaults `restSeconds` and
  /// `graceSeconds` override them. The installed app has no such switch.
  private static var timing: IslandTiming {
    var timing = IslandTiming.standard
    #if DEBUG || ISLAND_TEST_INPUT
      let defaults = UserDefaults.standard
      if defaults.object(forKey: "restSeconds") != nil {
        timing.rest = defaults.double(forKey: "restSeconds")
      }
      if defaults.object(forKey: "graceSeconds") != nil {
        timing.grace = defaults.double(forKey: "graceSeconds")
      }
    #endif
    return timing
  }

  private func take(_ report: SourceReport) {
    if hub.update(report), let song = hub.lastSong {
      try? store.save(song)
    }
    guard let model = island?.model else { return }
    model.take(report: hub.report)
    model.music = hub.page
  }

  private func playPause() {
    let page = hub.page
    switch page.content {
    case .nothingPlayedYet:
      return
    case .lastSong(let song):
      music.play(song: song)
    case .current:
      if page.isPlaying { music.pause() } else { music.play() }
    }
  }

  private func registerLoginItem() {
    let service = SMAppService.mainApp
    guard service.status != .enabled else { return }
    do {
      try service.register()
    } catch {
      NSLog("notch-island: could not register to start at login: %@", "\(error)")
    }
  }
}
