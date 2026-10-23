import AppKit
import Foundation
import IslandCore
import ScriptingBridge

/// What a source part tells the hub.
enum SourceEvent {
  /// What the app itself says it is doing.
  case report(SourceReport)
  /// The source cannot be seen separately for now (D111).
  case hidden
  /// The app quit or the tab closed (D117).
  case left
  case artwork(NSImage?)
}

/// One followed source (DESIGN: source parts). Each reports what its app is
/// playing and carries the island's clicks to that app; a new part is added
/// without changing how the others behave (D80).
protocol SourcePart: AnyObject {
  var id: SourceID { get }
  var onEvent: ((SourceID, SourceEvent) -> Void)? { get set }
  func start()
  /// Read the app again now.
  func refresh()
  func play()
  func pause()
  func skip()
  func back()
  func seek(to seconds: TimeInterval)
  /// Bring the playing app (or the exact tab) to the front (D26).
  func bringForward()
  /// Reopen the app on the last song and resume it at `position` (D117).
  func reopen(_ song: Song, at position: TimeInterval?)
}

extension SourcePart {
  /// Bring a running app to the front by its bundle id.
  func activate(bundleID: String) {
    guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID) else {
      return
    }
    let config = NSWorkspace.OpenConfiguration()
    config.activates = true
    NSWorkspace.shared.openApplication(at: url, configuration: config) { _, _ in }
  }

  /// Open a file in the app with this bundle id.
  func open(_ path: String, inApp bundleID: String) {
    guard let app = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID) else {
      return
    }
    let config = NSWorkspace.OpenConfiguration()
    config.activates = false
    NSWorkspace.shared.open(
      [URL(fileURLWithPath: path)], withApplicationAt: app, configuration: config
    ) { _, _ in }
  }

  /// Watch an app quit (D117).
  func watchTermination(of bundleID: String, _ action: @escaping () -> Void) {
    NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main
    ) { note in
      let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
      if app?.bundleIdentifier == bundleID { action() }
    }
  }
}

func isRunning(_ bundleID: String) -> Bool {
  !NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).isEmpty
}

/// Run one AppleScript; nil when it failed.
func runAppleScript(_ source: String, label: String) -> NSAppleEventDescriptor? {
  var error: NSDictionary?
  let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
  if let error {
    NSLog("notch-island: %@ script failed: %@", label, error)
    return nil
  }
  return result
}

/// The files a process has open, from the system's own process table
/// (libproc), so a part can name the file its app is playing.
func openFiles(of pid: pid_t) -> [String] {
  let bufferSize = proc_pidinfo(pid, PROC_PIDLISTFDS, 0, nil, 0)
  guard bufferSize > 0 else { return [] }
  let count = Int(bufferSize) / MemoryLayout<proc_fdinfo>.stride
  var fds = [proc_fdinfo](repeating: proc_fdinfo(), count: count)
  let used = proc_pidinfo(pid, PROC_PIDLISTFDS, 0, &fds, bufferSize)
  guard used > 0 else { return [] }
  var paths: [String] = []
  for fd in fds.prefix(Int(used) / MemoryLayout<proc_fdinfo>.stride)
  where fd.proc_fdtype == PROX_FDTYPE_VNODE {
    var info = vnode_fdinfowithpath()
    let size = Int32(MemoryLayout<vnode_fdinfowithpath>.size)
    guard proc_pidfdinfo(pid, fd.proc_fd, PROC_PIDFDVNODEPATHINFO, &info, size) == size else {
      continue
    }
    let path = withUnsafePointer(to: &info.pvip.vip_path) {
      $0.withMemoryRebound(to: CChar.self, capacity: Int(MAXPATHLEN)) { String(cString: $0) }
    }
    paths.append(path)
  }
  return paths
}

// MARK: - IINA

/// IINA's part (D5): IINA has no scripting dictionary, so it is read from the
/// shared now-playing channel, which names one app at a time. While the
/// channel shows another app, IINA cannot be seen separately and has no face
/// (D111); when IINA quits it leaves the card (D117).
final class IINASource: SourcePart {
  static let bundleID = "com.colliderli.iina"
  static let mediaExtensions: Set<String> = [
    "mkv", "mp4", "mov", "mp3", "wav", "m4a", "m4v", "avi",
  ]
  let id = SourceID.iina
  var onEvent: ((SourceID, SourceEvent) -> Void)?
  private let channel: NowPlayingChannel
  /// After a reopen: seek here once the channel shows the file again.
  private var pendingSeek = PendingSeek()
  private var location: (title: String, path: String)?
  /// IINA has reported since it started: only then can it hide or leave.
  private var seen = false

  init(channel: NowPlayingChannel) {
    self.channel = channel
  }

  func start() {
    watchTermination(of: Self.bundleID) { [weak self] in
      guard let self, self.seen else { return }
      self.seen = false
      self.onEvent?(self.id, .left)
    }
    refresh()
  }

  func refresh() {
    take(channel.info)
  }

  /// A change of the channel.
  func take(_ info: ChannelInfo?) {
    guard isRunning(Self.bundleID) else {
      if seen { onEvent?(id, .left) }
      seen = false
      return
    }
    guard let info, info.bundleID == Self.bundleID, let title = info.title, !title.isEmpty else {
      if seen { onEvent?(id, .hidden) }
      return
    }
    seen = true
    if let position = pendingSeek.take(title: title, at: ProcessInfo.processInfo.systemUptime) {
      channel.seek(to: position)
    }
    let song = Song(
      title: title, artist: (info.artist?.isEmpty ?? true) ? nil : info.artist, source: "IINA",
      trackID: nil, duration: info.duration, sourceID: id, location: path(of: title, pid: info.pid))
    let wall = Date().timeIntervalSince1970
    let report = SourceReport(
      song: song, state: info.playing && info.rate > 0 ? .playing : .paused,
      position: info.position(atWallClock: wall), readAt: ProcessInfo.processInfo.systemUptime)
    onEvent?(id, .report(report))
    onEvent?(id, .artwork(nil))
  }

  /// The file IINA has open for `title`, read once per title.
  private func path(of title: String, pid: pid_t) -> String? {
    if let location, location.title == title { return location.path }
    let files = openFiles(of: pid).filter {
      Self.mediaExtensions.contains(URL(fileURLWithPath: $0).pathExtension.lowercased())
    }
    let path =
      files.first { URL(fileURLWithPath: $0).lastPathComponent == title }
      ?? files.first {
        URL(fileURLWithPath: $0).deletingPathExtension().lastPathComponent == title
      } ?? (files.count == 1 ? files[0] : nil)
    if let path { location = (title, path) }
    return path
  }

  func play() { channel.send("play") }
  func pause() { channel.send("pause") }
  func skip() { channel.send("next") }

  func back() {
    // D112: at 0:03 or earlier the previous one, otherwise the start again.
    let position = channel.info?.position(atWallClock: Date().timeIntervalSince1970)
    switch backAction(reading: { position }) {
    case .previousSong: channel.send("previous")
    case .restartSong: channel.seek(to: 0)
    case nil: break
    }
  }

  func seek(to seconds: TimeInterval) { channel.seek(to: seconds) }
  func bringForward() { activate(bundleID: Self.bundleID) }

  func reopen(_ song: Song, at position: TimeInterval?) {
    guard let path = song.location else {
      activate(bundleID: Self.bundleID)
      return
    }
    if let position {
      pendingSeek.set(
        title: song.title, position: position, at: ProcessInfo.processInfo.systemUptime)
    }
    open(path, inApp: Self.bundleID)
  }
}

// MARK: - QuickTime Player

/// QuickTime Player's part (D5), through its AppleScript dictionary. QuickTime
/// sends no notifications, so it is read once a second, and only while it is
/// running; with QuickTime quit nothing runs.
final class QuickTimeSource: SourcePart {
  static let bundleID = "com.apple.QuickTimePlayerX"
  let id = SourceID.quickTime
  var onEvent: ((SourceID, SourceEvent) -> Void)?
  private let queue = DispatchQueue(label: "notch-island.quicktime")
  private var timer: Timer?
  private let channel: NowPlayingChannel

  init(channel: NowPlayingChannel) {
    self.channel = channel
  }

  func start() {
    let center = NSWorkspace.shared.notificationCenter
    center.addObserver(
      forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main
    ) { [weak self] note in
      let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
      if app?.bundleIdentifier == Self.bundleID { self?.follow(true) }
    }
    watchTermination(of: Self.bundleID) { [weak self] in
      guard let self else { return }
      self.follow(false)
      self.onEvent?(self.id, .left)
    }
    follow(isRunning(Self.bundleID))
  }

  private func follow(_ running: Bool) {
    timer?.invalidate()
    timer = nil
    guard let interval = PollPolicy.quickTime(isOpen: running) else { return }
    let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in self?.refresh() }
    RunLoop.main.add(timer, forMode: .common)
    self.timer = timer
    refresh()
  }

  func refresh(after delay: TimeInterval) {
    queue.asyncAfter(deadline: .now() + delay) { [weak self] in self?.read() }
  }

  func refresh() { refresh(after: 0) }

  /// Read QuickTime now. A read that failed says nothing about what QuickTime
  /// does: no report, and a few fresh reads. Taken as "stopped", it would drop
  /// QuickTime from the card and bring it back as the newest source (D48).
  private func read(retries: Int = 3) {
    let now = ProcessInfo.processInfo.systemUptime
    guard isRunning(Self.bundleID) else { return }
    guard let report = QuickTimeRead.report(id: id, documents: Self.readDocuments(), at: now)
    else {
      if retries > 0 {
        queue.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.read(retries: retries - 1) }
      }
      return
    }
    DispatchQueue.main.async {
      // QuickTime may have quit while it was being read: a read that ends
      // after the quit must not put it back on the card.
      guard isRunning(Self.bundleID) else { return }
      self.onEvent?(self.id, .report(report))
      self.onEvent?(self.id, .artwork(nil))
    }
  }

  /// The documents, read through Scripting Bridge addressed to the running
  /// QuickTime Player's process: a read sent as QuickTime quits fails, where
  /// a script addressed by name would start QuickTime again. A read must never
  /// start a QuickTime Player that just quit. Nil when the read failed.
  private static func readDocuments() -> [QuickTimeDocument]? {
    guard
      let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
        .first(where: { !$0.isTerminated }),
      let app = SBApplication(processIdentifier: running.processIdentifier),
      let documents = (app.value(forKey: "documents") as? SBElementArray)?.get() as? [SBObject]
    else { return nil }
    return documents.map { doc in
      let path = (doc.value(forKey: "file") as? URL)?.path ?? ""
      let name =
        path.isEmpty
        ? (doc.value(forKey: "name") as? String ?? "") : (path as NSString).lastPathComponent
      return QuickTimeDocument(
        name: name, path: path, duration: (doc.value(forKey: "duration") as? NSNumber)?.doubleValue,
        playing: (doc.value(forKey: "playing") as? NSNumber)?.boolValue == true,
        currentTime: (doc.value(forKey: "currentTime") as? NSNumber)?.doubleValue)
    }
  }

  private func command(_ verb: String) {
    queue.async { [weak self] in
      _ = runAppleScript(QuickTimeScripts.command(verb), label: "QuickTime Player")
      self?.refresh(after: 0.15)
    }
  }

  private static let playingDocument = """
    (first document whose playing is true)
    """

  func play() { command("play front document") }
  func pause() { command("pause \(Self.playingDocument)") }

  /// Skip goes to QuickTime as a press of its own skip control (D46): the
  /// system's next-track command, which QuickTime answers itself.
  func skip() {
    sendIfQuickTimeIsOnTheChannel("next")
    refresh(after: 0.3)
  }

  /// A system command reaches whichever app the channel shows; sent only when
  /// that is QuickTime Player, so no other app is ever skipped.
  private func sendIfQuickTimeIsOnTheChannel(_ command: String) {
    guard channel.info?.bundleID == Self.bundleID else { return }
    channel.send(command)
  }

  func back() {
    queue.async { [weak self] in
      guard let self else { return }
      let read = {
        runAppleScript(
          """
          if application "QuickTime Player" is not running then error "not running"
          tell application "QuickTime Player" to get current time of front document
          """, label: "QuickTime Player")?.doubleValue
      }
      switch backAction(reading: read) {
      case .previousSong:
        DispatchQueue.main.async { self.sendIfQuickTimeIsOnTheChannel("previous") }
      case .restartSong:
        _ = runAppleScript(
          QuickTimeScripts.command("set current time of front document to 0"),
          label: "QuickTime Player")
      case nil: break
      }
      self.refresh(after: 0.15)
    }
  }

  func seek(to seconds: TimeInterval) {
    command(String(format: "set current time of front document to %.3f", max(0, seconds)))
  }

  func bringForward() { activate(bundleID: Self.bundleID) }

  func reopen(_ song: Song, at position: TimeInterval?) {
    guard let path = song.location, path.allSatisfy({ $0 != "\"" && $0 != "\\" }) else {
      activate(bundleID: Self.bundleID)
      return
    }
    let seek = position.map { String(format: "set current time of d to %.3f\n", $0) } ?? ""
    queue.async { [weak self] in
      _ = runAppleScript(
        """
        tell application "QuickTime Player"
          set d to open (POSIX file "\(path)")
          \(seek)play d
        end tell
        """, label: "QuickTime Player")
      self?.refresh(after: 0.2)
    }
  }
}
