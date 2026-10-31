import AppKit
import Foundation
import IslandCore

/// The Apple Music source part. It listens to the player-info notification
/// Music broadcasts on every track or state change, reads the rest through
/// Music's AppleScript dictionary, and carries the island's clicks to Music.
/// It never reports a guess: every report is read back from Music itself.
final class AppleMusicSource: SourcePart {
  static let sourceName = "Apple Music"
  /// Music playing a downloaded file (D5, D119): the source line reads "Music".
  static let fileSourceName = "Music"
  static let bundleID = "com.apple.Music"
  let id = SourceID.appleMusic

  /// Called on the main thread with what Music says, and with its art.
  var onEvent: ((SourceID, SourceEvent) -> Void)?

  private let queue = DispatchQueue(label: "notch-island.apple-music")
  private var artwork = ArtworkTracker()
  private var playheadTimer: Timer?

  func start() {
    DistributedNotificationCenter.default().addObserver(
      self, selector: #selector(playerInfoChanged(_:)),
      name: Notification.Name("com.apple.Music.playerInfo"), object: nil)
    watchTermination(of: Self.bundleID) { [weak self] in
      guard let self else { return }
      self.watchPlayhead(playing: false)
      self.onEvent?(self.id, .left)
    }
    refresh()
  }

  @objc private func playerInfoChanged(_ note: Notification) {
    refresh()
  }

  private var isRunning: Bool {
    !NSRunningApplication.runningApplications(withBundleIdentifier: Self.bundleID).isEmpty
  }

  func refresh() { refresh(after: 0) }

  /// Read Music's state now. Music is never launched just to be read: a quit
  /// Music has left the card (D117).
  func refresh(after delay: TimeInterval, retries: Int = 3) {
    queue.asyncAfter(deadline: .now() + delay) { [weak self] in
      guard let self else { return }
      guard self.isRunning else {
        DispatchQueue.main.async {
          self.watchPlayhead(playing: false)
          self.onEvent?(self.id, .left)
        }
        return
      }
      // A read that failed (Music busy, the script timed out) says nothing
      // about what Music does: no report, and a few fresh reads. Taken
      // as "stopped", it would drop Music from the card and bring it back as
      // the newest source (D48).
      guard let report = self.readReport() else {
        if retries > 0 { self.refresh(after: 0.5, retries: retries - 1) }
        return
      }
      let art = self.readArtworkIfNew(report)
      DispatchQueue.main.async {
        // Music may have quit while it was being read: a read that ends after
        // the quit must not put it back on the card.
        guard self.isRunning else {
          self.onEvent?(self.id, .left)
          return
        }
        self.onEvent?(self.id, .report(report))
        if let art { self.onEvent?(self.id, .artwork(art.image)) }
        self.watchPlayhead(playing: report.state == .playing)
      }
    }
  }

  /// While Music plays, its playhead is looked at now and then (D133): a move
  /// made in Music's own window announces nothing, and a resume after Music
  /// quits would otherwise start from the island's own estimate. Nothing runs
  /// while Music is paused, stopped or quit.
  private func watchPlayhead(playing: Bool) {
    guard let interval = PollPolicy.musicPlayhead(isPlaying: playing) else {
      playheadTimer?.invalidate()
      playheadTimer = nil
      return
    }
    guard playheadTimer == nil else { return }
    let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in self?.refresh() }
    RunLoop.main.add(timer, forMode: .common)
    playheadTimer = timer
  }

  // MARK: Commands

  func pause() { command("pause", "pause") }
  func play() { command("play", "play") }
  func skip() { command("skip", "next track") }

  /// Back (D112): reads where Music really is at the click, then goes to the
  /// previous song at 0:03 or earlier, or restarts the song.
  func back() {
    queue.async { [weak self] in
      guard let self else { return }
      let action = backAction(reading: {
        self.run(
          """
          if application "Music" is not running then error "not running"
          tell application "Music" to get player position
          """)?.doubleValue
      })
      // A position still unknown after a second read: send nothing (D124).
      switch action {
      case .previousSong: self.send("back", "previous track")
      case .restartSong: self.send("back", "set player position to 0")
      case nil: break
      }
      self.refresh(after: 0.15)
    }
  }

  func seek(to seconds: TimeInterval) {
    let value = String(format: "%.3f", max(0, seconds))
    command("seek", "set player position to \(value)")
  }

  /// Play the last song again when nothing plays (D31): this may open Music.
  /// After Music quit mid-song, it resumes where it was (D117). A streamed
  /// song is found in its playlist, being in no library.
  func reopen(_ song: Song, at position: TimeInterval?) {
    guard
      let attempt = MusicReopen.attemptScript(
        trackID: song.trackID, collectionID: song.collectionID)
    else {
      command("play", "play")
      return
    }
    queue.async { [weak self] in
      guard let self else { return }
      // A newer play takes over: an older one stops at its next try.
      self.reopens += 1
      self.tryReopen(
        attempt, song: song, position: position, run: self.reopens, triesLeft: MusicReopen.tries)
    }
  }

  /// Reopens begun, the latest the one that may go on (read on `queue` only).
  private var reopens = 0

  /// One short try on `queue`, the next a moment later: Music's own reports
  /// are read between tries, so music started in Music meanwhile shows at once.
  private func tryReopen(
    _ attempt: String, song: Song, position: TimeInterval?, run: Int, triesLeft: Int
  ) {
    guard run == reopens, !TestInput.musicIgnores("play") else { return }
    let result = self.run("tell application \"Music\"\n\(attempt)\nend tell")
      .flatMap { $0.stringValue }.flatMap(MusicReopen.Try.init(rawValue:))
    switch MusicReopen.next(after: result, triesLeft: triesLeft, position: position) {
    case .tryAgain:
      queue.asyncAfter(deadline: .now() + MusicReopen.tryGap) { [weak self] in
        self?.tryReopen(attempt, song: song, position: position, run: run, triesLeft: triesLeft - 1)
      }
      return
    case .holdPosition:
      if let position, let hold = MusicReopen.holdScript(trackID: song.trackID, position: position)
      {
        _ = self.run("tell application \"Music\"\n\(hold)\nend tell")
      }
    case .done:
      break
    }
    refresh(after: 0.15)
  }

  /// Bring Music's window to the front (the source line or art, D26).
  func bringForward() { activate(bundleID: Self.bundleID) }

  private func command(_ name: String, _ verb: String) {
    queue.async { [weak self] in
      self?.send(name, verb)
      self?.refresh(after: 0.15)
    }
  }

  /// Send one command to Music. In a test build the harness may make Music
  /// ignore it, standing in for an app that does not act on it (D124).
  private func send(_ name: String, _ verb: String) {
    if TestInput.musicIgnores(name) { return }
    _ = run("tell application \"Music\"\n\(verb)\nend tell")
  }

  // MARK: Reading Music

  private func readReport() -> SourceReport? {
    // Checked again inside the script, just before it speaks to Music: a
    // read must never start a Music that just quit.
    let script = """
      if application "Music" is not running then return {"stopped"}
      tell application "Music"
        set ps to player state as string
        if ps is "stopped" then return {ps}
        set t to current track
        set loc to ""
        try
          set l to location of t
          set loc to POSIX path of l
        end try
        set pl to ""
        try
          set pl to persistent ID of current playlist
        end try
        return {ps, name of t, artist of t, duration of t, player position, persistent ID of t, album of t, loc, pl}
      end tell
      """
    guard let list = run(script), list.numberOfItems >= 1 else { return nil }
    let now = ProcessInfo.processInfo.systemUptime
    let stateText = list.atIndex(1)?.stringValue ?? "stopped"
    let state: PlayerState =
      switch stateText {
      case "playing", "fast forwarding", "rewinding": .playing
      case "paused": .paused
      default: .stopped
      }
    guard state != .stopped, list.numberOfItems >= 6 else {
      return SourceReport(song: nil, state: .stopped, position: nil, readAt: now)
    }
    var title = list.atIndex(2)?.stringValue ?? ""
    let artist = list.atIndex(3)?.stringValue ?? ""
    let album = list.numberOfItems >= 7 ? (list.atIndex(7)?.stringValue ?? "") : ""
    let location = list.numberOfItems >= 8 ? (list.atIndex(8)?.stringValue ?? "") : ""
    let playlist = list.numberOfItems >= 9 ? (list.atIndex(9)?.stringValue ?? "") : ""
    // A downloaded file Music plays (D5): an untagged file, no artist and no
    // album. The source line reads "Music" and the title is the file's name.
    let isFile = artist.isEmpty && album.isEmpty && !location.isEmpty
    if isFile { title = (location as NSString).lastPathComponent }
    let song = Song(
      title: title, artist: artist.isEmpty ? nil : artist,
      source: isFile ? Self.fileSourceName : Self.sourceName,
      trackID: list.atIndex(6)?.stringValue, duration: list.atIndex(4)?.doubleValue,
      sourceID: id, location: location.isEmpty ? nil : location,
      collectionID: playlist.isEmpty ? nil : playlist)
    return SourceReport(
      song: song, state: state, position: list.atIndex(5)?.doubleValue, readAt: now)
  }

  private struct Artwork { var image: NSImage? }

  private func readArtworkIfNew(_ report: SourceReport) -> Artwork? {
    let key = report.song?.trackID
    guard artwork.shouldRead(key) else { return nil }
    guard key != nil else {
      artwork.finished(key, succeeded: true)
      return Artwork(image: nil)
    }
    let script = """
      if application "Music" is not running then error "Music is not running"
      tell application "Music"
        if (count of artworks of current track) is 0 then return ""
        return raw data of artwork 1 of current track
      end tell
      """
    // Done only when Music answered; a failed read is tried again later.
    let result = run(script)
    artwork.finished(key, succeeded: result != nil)
    return Artwork(image: result.flatMap { NSImage(data: $0.data) })
  }

  private func run(_ source: String) -> NSAppleEventDescriptor? {
    var error: NSDictionary?
    let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
    if let error {
      NSLog("notch-island: Apple Music script failed: %@", error)
      return nil
    }
    return result
  }
}
