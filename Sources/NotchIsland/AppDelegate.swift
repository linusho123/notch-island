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
  /// When a new song starts, and the wing that tells of it (D115, D78).
  private var detector = NewSongDetector()
  private let wing = WingController()
  private let shelfStore: ShelfStore
  private var captureWatcher: CaptureWatcher?

  override init() {
    let directory =
      TestInput.dataDirectory
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("notch-island", isDirectory: true)
    store = LastSongStore(directory: directory)
    chrome = ChromeBridge(directory: directory)
    shelfStore = ShelfStore(
      directory: directory,
      clock: { TestInput.clockDate ?? Date() }
    )
    let kept = store.loadKept()
    hub = NowPlayingHub(lastSong: kept?.song, resumeAt: kept?.resumeAt)
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    if TestInput.unregisterLoginAndExit || TestInput.loginStatusAndExit {
      do {
        if TestInput.unregisterLoginAndExit {
          try SMAppService.mainApp.unregister()
          guard SMAppService.mainApp.status == .notRegistered else {
            throw NSError(domain: "LoginCleanup", code: 1)
          }
        }
        let status: String
        switch SMAppService.mainApp.status {
        case .notRegistered: status = "notRegistered"
        case .enabled: status = "enabled"
        case .requiresApproval: status = "requiresApproval"
        case .notFound: status = "notFound"
        @unknown default: throw NSError(domain: "LoginCleanup", code: 2)
        }
        let response = ["status": status, "bundleID": Bundle.main.bundleIdentifier ?? ""]
        let data = try JSONSerialization.data(withJSONObject: response)
        FileHandle.standardOutput.write(data)
        exit(0)
      } catch {
        FileHandle.standardError.write(Data("login service failed: \(error)\n".utf8))
        exit(1)
      }
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
    model.shelfStore = shelfStore
    model.onRemoveShelfItem = { [weak self] id in
      self?.shelfStore.remove(id: id)
      self?.island?.model.refreshShelf()
    }
    model.onExpandShelfStack = { [weak self] id in
      self?.shelfStore.expandStack(id: id)
      self?.island?.model.refreshShelf()
    }
    model.refreshShelf()

    let watcher = CaptureWatcher(
      directory: TestInput.screenshotDirectory ?? CaptureWatcher.defaultScreenshotLocation(),
      store: shelfStore,
      locationProvider: {
        #if ISLAND_TEST_INPUT
          if let dir = TestInput.screenshotDirectory {
            return dir
          }
        #endif
        return CaptureWatcher.defaultScreenshotLocation()
      }
    )
    watcher.onCaptureParked = { [weak model] _ in
      DispatchQueue.main.async {
        model?.refreshShelf()
      }
    }
    watcher.start()
    self.captureWatcher = watcher

    #if ISLAND_TEST_INPUT
      var handledClear = false
      var handledSeed = false

      if TestInput.clearShelf {
        self.shelfStore.clear()
        handledClear = true
      }
      if let seeds = TestInput.seedShelf {
        for seed in seeds {
          self.seedItem(seed)
        }
        handledSeed = true
      }
      model.refreshShelf()

      TestInput.onChange { [weak self] in
        guard let self else { return }
        if let dir = TestInput.screenshotDirectory {
          self.captureWatcher?.updateDirectory(dir)
        }
        if !TestInput.clearShelf {
          handledClear = false
        } else if !handledClear {
          self.shelfStore.clear()
          handledClear = true
        }
        if TestInput.seedShelf == nil {
          handledSeed = false
        } else if !handledSeed, let seeds = TestInput.seedShelf {
          for seed in seeds {
            self.seedItem(seed)
          }
          handledSeed = true
        }
        self.island?.model.refreshShelf()
      }
    #endif

    island.onOpenRefresh = { [weak self] in
      for part in self?.parts.values.map({ $0 }) ?? [] { part.refresh() }
      self?.island?.model.refreshShelf()
    }
    wing.islandOpen = { [weak island] in island?.isOpen ?? false }
    wing.fullscreen = { [weak self] in self?.contextGuard.fullscreenNow() ?? false }
    wing.home = { [weak island] in island?.home }
    island.onOpenChanged = { [weak self] open in if open { self?.wing.foldNow() } }
    contextGuard.onFullscreenChanged = { [weak self] full in if full { self?.wing.foldNow() } }

    let iina = IINASource(channel: channel)
    let quickTime = QuickTimeSource(channel: channel)
    let sources: [SourcePart] = [AppleMusicSource(), iina, quickTime]
    for part in sources {
      parts[part.id] = part
      part.onEvent = { [weak self] id, event in self?.take(id, event) }
    }
    channel.onChange = { info in
      iina.take(info)
      // QuickTime tells nothing itself, but it publishes what it plays to the
      // now-playing channel: a change there is read at once, so a new file's
      // wing is out within a second (D78), on top of the once-a-second read.
      if info?.bundleID == QuickTimeSource.bundleID { quickTime.refresh() }
    }
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
    case .report(let report):
      keep = hub.update(id, report)
      if let started = detector.take(id, report), let title = report.song?.title {
        // The part hands over the song's art right after its report: the
        // notice goes out once that has arrived.
        DispatchQueue.main.async { [weak self] in
          guard let self else { return }
          self.wing.notify(title: title, image: self.artwork[id] ?? nil, startedAt: started)
        }
      }
    case .hidden:
      hub.hide(id)
      detector.hidden(id)
    case .left:
      detector.forget(id)
      keep = hub.leave(id, at: now) || hub.resumeAt != nil
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

  #if ISLAND_TEST_INPUT
    private func seedItem(_ seed: [String: Any]) {
      let type = seed["type"] as? String ?? seed["kind"] as? String ?? ""
      let landedAt: Date? = {
        if let str = seed["landedAt"] as? String {
          let f = ISO8601DateFormatter()
          if let d = f.date(from: str) { return d }
          f.formatOptions.insert(.withFractionalSeconds)
          return f.date(from: str)
        } else if let ts = (seed["landedAtTimestamp"] as? NSNumber)?.doubleValue {
          return Date(timeIntervalSince1970: ts)
        }
        return nil
      }()

      switch type {
      case "screenshot", "screenRecording", "capture":
        if let path = seed["path"] as? String {
          captureWatcher?.addSeenPath(path)
          let url = URL(fileURLWithPath: path)
          let capType: CaptureType =
            (type == "screenRecording" || url.pathExtension.lowercased() == "mov")
            ? .screenRecording : .screenshot
          _ = try? shelfStore.parkCapture(at: url, type: capType, landedAt: landedAt)
        }
      case "file", "folder":
        if let path = seed["path"] as? String {
          captureWatcher?.addSeenPath(path)
          _ = try? shelfStore.parkFile(at: URL(fileURLWithPath: path), landedAt: landedAt)
        }
      case "files", "fileStack":
        if let paths = seed["paths"] as? [String] {
          for p in paths { captureWatcher?.addSeenPath(p) }
          let urls = paths.map { URL(fileURLWithPath: $0) }
          _ = try? shelfStore.parkFiles(at: urls, landedAt: landedAt)
        }
      case "link":
        if let urlStr = seed["url"] as? String, let url = URL(string: urlStr) {
          shelfStore.parkLink(url, title: seed["title"] as? String, landedAt: landedAt)
        }
      case "note":
        if let text = seed["text"] as? String {
          let isReminder = seed["isReminder"] as? Bool ?? false
          shelfStore.addNote(text: text, isReminder: isReminder, landedAt: landedAt)
        }
      case "reminder":
        if let text = seed["text"] as? String {
          shelfStore.addNote(text: text, isReminder: true, landedAt: landedAt)
        }
      default:
        break
      }
    }
  #endif
}
