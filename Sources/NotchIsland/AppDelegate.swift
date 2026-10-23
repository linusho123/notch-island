import AppKit
import IslandCore
import ServiceManagement

/// The agent app: no Dock icon, no app menu, no window but the island. It
/// starts by itself at every login (D60) through the system's login-item
/// service for the main app.
final class AppDelegate: NSObject, NSApplicationDelegate {
  private let contextGuard = ContextGuard()
  private var island: IslandController?
  private let channel = NowPlayingChannel()
  private let output = OutputDeviceWatcher()
  private var parts: [SourceID: SourcePart] = [:]
  private var artwork: [SourceID: NSImage?] = [:]
  private var hub: NowPlayingHub
  private let store: LastSongStore
  private let chrome: ChromeBridge

  override init() {
    let directory =
      TestInput.dataDirectory
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("notch-island", isDirectory: true)
    store = LastSongStore(directory: directory)
    chrome = ChromeBridge(directory: directory)
    let kept = store.loadKept()
    hub = NowPlayingHub(lastSong: kept?.song, resumeAt: kept?.resumeAt)
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
    model.onBack = { [weak self] in self?.shownPart?.back() }
    model.onSkip = { [weak self] in self?.shownPart?.skip() }
    model.onSeek = { [weak self] in self?.shownPart?.seek(to: $0) }
    model.onBringForward = { [weak self] in self?.shownPart?.bringForward() }
    model.onFlip = { [weak self] in self?.flip() }
    island.onOpenRefresh = { [weak self] in
      for part in self?.parts.values.map({ $0 }) ?? [] { part.refresh() }
    }

    let iina = IINASource(channel: channel)
    let sources: [SourcePart] = [AppleMusicSource(), iina, QuickTimeSource(channel: channel)]
    for part in sources {
      parts[part.id] = part
      part.onEvent = { [weak self] id, event in self?.take(id, event) }
    }
    channel.onChange = { info in iina.take(info) }
    chrome.onTabPart = { [weak self] part in
      self?.parts[part.id] = part
      part.onEvent = { [weak self] id, event in self?.take(id, event) }
    }
    output.onChange = { device in model.output = device }

    contextGuard.onScreensChanged = { island.place() }
    contextGuard.start()
    island.place()
    output.start()
    channel.start()
    chrome.start()
    for part in sources { part.start() }
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

  /// The part whose face the card shows.
  private var shownPart: SourcePart? { hub.shownID.flatMap { parts[$0] } }

  private func take(_ id: SourceID, _ event: SourceEvent) {
    let now = ProcessInfo.processInfo.systemUptime
    var keep = false
    switch event {
    case .report(let report): keep = hub.update(id, report)
    case .hidden: hub.hide(id)
    case .left: keep = hub.leave(id, at: now) || hub.resumeAt != nil
    case .artwork(let image): artwork[id] = image
    }
    #if ISLAND_TEST_INPUT
      switch event {
      case .artwork: break
      case .report(let r):
        NSLog(
          "notch-island: %@ report %@ %@ at %@ -> shows %@", id.rawValue, r.state.rawValue,
          r.song?.title ?? "-", "\(r.position ?? -1)", "\(hub.page.content)")
      default:
        NSLog(
          "notch-island: %@ %@ -> shows %@ resume %@", id.rawValue, "\(event)",
          "\(hub.page.content)", "\(hub.resumeAt ?? -1)")
      }
    #endif
    if keep, let song = hub.lastSong {
      try? store.save(song, resumeAt: hub.resumeAt)
    }
    show()
  }

  private func show() {
    guard let model = island?.model else { return }
    model.take(report: hub.report)
    model.music = hub.page
    model.faceID = hub.shownID?.rawValue
    let key = hub.shownID ?? hub.lastSong?.sourceID ?? .appleMusic
    model.artwork = artwork[key] ?? nil
  }

  private func flip() {
    hub.flip()
    show()
  }

  private func playPause() {
    let page = hub.page
    switch page.content {
    case .nothingPlayedYet:
      return
    case .lastSong(let song):
      // Reopen the app it came from, resuming where it was (D31, D117).
      // A song never starts another source (D124): a Chrome song whose tab is
      // gone opens its page in Chrome, and only a youtube.com or soundcloud.com one.
      let route = LastSongRouting.route(
        song, liveParts: Set(parts.filter { !($0.value is ChromeTabPart) }.keys),
        closedTabKnown: song.sourceID.map { chrome.canReopen($0) } ?? false,
        resumeAt: hub.resumeAt)
      switch route {
      case .part(let id): parts[id]?.reopen(song, at: hub.resumeAt)
      case .openPage(let url): chrome.open(url)
      case .nothing: break
      }
    case .current:
      if page.isPlaying { shownPart?.pause() } else { shownPart?.play() }
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
