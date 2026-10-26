import Foundation

/// Watches the macOS screenshot location for new captures (D64, D105).
///
/// Screenshots and screen recordings that macOS's own tool makes land on the
/// shelf; clipboard captures and files other tools put in that folder never do.
/// Decides "macOS made it" from what macOS itself records, not just the file
/// name (via `CaptureDetector`).
public final class CaptureWatcher: @unchecked Sendable {
  public private(set) var directory: URL
  public let store: ShelfStore
  public var onCaptureParked: (@Sendable (ShelfItem) -> Void)?
  public var locationProvider: (@Sendable () -> URL)?

  private let queue = DispatchQueue(label: "notch-island.capture-watcher")
  private var source: DispatchSourceFileSystemObject?
  private var seenPaths: Set<String> = []
  private var isRunning = false
  private let lock = NSLock()

  public init(
    directory: URL,
    store: ShelfStore,
    locationProvider: (@Sendable () -> URL)? = nil
  ) {
    self.directory = directory
    self.store = store
    self.locationProvider = locationProvider
  }

  deinit {
    stop()
  }

  /// Default screenshot location: reads `com.apple.screencapture location`
  /// or falls back to `~/Desktop`.
  public static func defaultScreenshotLocation() -> URL {
    if let loc = UserDefaults(suiteName: "com.apple.screencapture")?.string(forKey: "location"),
      !loc.isEmpty
    {
      let expanded = (loc as NSString).expandingTildeInPath
      return URL(fileURLWithPath: expanded, isDirectory: true)
    }
    return FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask)[0]
  }

  /// Checks whether the screenshot location has changed or needs re-arming.
  public func checkLocation() {}

  /// Starts watching the screenshot location for new captures.
  public func start() {
    lock.lock()
    defer { lock.unlock() }
    guard !isRunning else { return }
    isRunning = true

    snapshotExistingFiles()
    armSource()
  }

  /// Stops watching.
  public func stop() {
    lock.lock()
    defer { lock.unlock() }
    guard isRunning else { return }
    isRunning = false
    source?.cancel()
    source = nil
  }

  /// Points the watcher at a new screenshot directory.
  public func updateDirectory(_ newDirectory: URL) {
    lock.lock()
    let changed = directory != newDirectory
    directory = newDirectory
    if changed && isRunning {
      source?.cancel()
      source = nil
      snapshotExistingFiles()
      armSource()
    }
    lock.unlock()
  }

  /// Marks a file path as seen so the watcher does not re-park it.
  public func addSeenPath(_ path: String) {
    lock.lock()
    seenPaths.insert(path)
    lock.unlock()
  }

  // MARK: - Private helpers

  private func snapshotExistingFiles() {
    guard
      let contents = try? FileManager.default.contentsOfDirectory(
        at: directory, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
    else { return }
    seenPaths = Set(contents.map { $0.path })
  }

  private func armSource() {
    let path = directory.path
    let fd = open(path, O_EVTONLY)
    guard fd >= 0 else { return }

    let src = DispatchSource.makeFileSystemObjectSource(
      fileDescriptor: fd,
      eventMask: [.write, .extend, .attrib],
      queue: queue
    )
    src.setEventHandler { [weak self] in
      self?.scanForNewCaptures()
    }
    src.setCancelHandler {
      close(fd)
    }
    src.resume()
    self.source = src
  }

  /// Checks the directory for any files that have appeared since the last check.
  public func scanForNewCaptures() {
    guard
      let contents = try? FileManager.default.contentsOfDirectory(
        at: directory, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
    else { return }

    var toCheck: [URL] = []
    lock.lock()
    let currentPaths = Set(contents.map { $0.path })
    // Keep seenPaths fresh when files are removed.
    seenPaths = seenPaths.intersection(currentPaths)
    for url in contents {
      if !seenPaths.contains(url.path) {
        seenPaths.insert(url.path)
        toCheck.append(url)
      }
    }
    lock.unlock()

    for url in toCheck {
      checkAndParkCapture(url: url, retriesRemaining: 6)
    }
  }

  private func checkAndParkCapture(url: URL, retriesRemaining: Int) {
    if CaptureDetector.isMacOSCapture(url: url) {
      if let item = try? store.parkCapture(at: url) {
        onCaptureParked?(item)
      }
      return
    }

    if retriesRemaining > 0 {
      queue.asyncAfter(deadline: .now() + 0.05) { [weak self] in
        self?.checkAndParkCapture(url: url, retriesRemaining: retriesRemaining - 1)
      }
    }
  }
}
