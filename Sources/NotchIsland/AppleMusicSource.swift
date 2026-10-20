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

  func start() {
    DistributedNotificationCenter.default().addObserver(
      self, selector: #selector(playerInfoChanged(_:)),
      name: Notification.Name("com.apple.Music.playerInfo"), object: nil)
    watchTermination(of: Self.bundleID) { [weak self] in
      guard let self else { return }
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
  func refresh(after delay: TimeInterval) {
    queue.asyncAfter(deadline: .now() + delay) { [weak self] in
      guard let self else { return }
      guard self.isRunning else {
        DispatchQueue.main.async { self.onEvent?(self.id, .left) }
        return
      }
      let now = ProcessInfo.processInfo.systemUptime
      let report =
        self.readReport() ?? SourceReport(song: nil, state: .stopped, position: nil, readAt: now)
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
      }
    }
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
        self.run("tell application \"Music\" to get player position")?.doubleValue
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
  /// After Music quit mid-song, it resumes where it was (D117).
  func reopen(_ song: Song, at position: TimeInterval?) {
    guard let id = song.trackID, id.allSatisfy({ $0.isHexDigit }) else {
      command("play", "play")
      return
    }
    // A Music that was quit is started by the first command, and while it
    // loads it takes a play without playing: the play is sent again until
    // Music itself says it plays, for ten seconds at most.
    let play = """
      repeat 40 times
        try
          play (first track of library playlist 1 whose persistent ID is "\(id)")
        end try
        delay 0.25
        if player state is playing then exit repeat
      end repeat
      """
    guard let position, position > 0 else {
      command("play", play)
      return
    }
    let seek = String(format: "%.3f", position)
    command(
      "play",
      """
      \(play)
      -- A play still on its way may start the song over: the position is
      -- set until it holds on two reads in a row.
      set held to 0
      repeat 12 times
        if player position < \(seek) - 1 then
          set player position to \(seek)
          set held to 0
        else
          set held to held + 1
          if held is 2 then exit repeat
        end if
        delay 0.3
      end repeat
      """)
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
    let script = """
      tell application "Music"
        set ps to player state as string
        if ps is "stopped" then return {ps}
        set t to current track
        set loc to ""
        try
          set l to location of t
          set loc to POSIX path of l
        end try
        return {ps, name of t, artist of t, duration of t, player position, persistent ID of t, album of t, loc}
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
    // A downloaded file Music plays (D5): an untagged file, no artist and no
    // album. The source line reads "Music" and the title is the file's name.
    let isFile = artist.isEmpty && album.isEmpty && !location.isEmpty
    if isFile { title = (location as NSString).lastPathComponent }
    let song = Song(
      title: title, artist: artist.isEmpty ? nil : artist,
      source: isFile ? Self.fileSourceName : Self.sourceName,
      trackID: list.atIndex(6)?.stringValue, duration: list.atIndex(4)?.doubleValue,
      sourceID: id, location: location.isEmpty ? nil : location)
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
