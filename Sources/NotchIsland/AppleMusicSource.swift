import AppKit
import Foundation
import IslandCore

/// The Apple Music source part. It listens to the player-info notification
/// Music broadcasts on every track or state change, reads the rest through
/// Music's AppleScript dictionary, and carries the island's clicks to Music.
/// It never reports a guess: every report is read back from Music itself.
final class AppleMusicSource {
  static let sourceName = "Apple Music"
  static let bundleID = "com.apple.Music"

  /// Called on the main thread with each report read from Music.
  var onReport: ((SourceReport) -> Void)?
  /// Called on the main thread with the current track's cover art, or nil.
  var onArtwork: ((NSImage?) -> Void)?

  private let queue = DispatchQueue(label: "notch-island.apple-music")
  private var artwork = ArtworkTracker()

  func start() {
    DistributedNotificationCenter.default().addObserver(
      self, selector: #selector(playerInfoChanged(_:)),
      name: Notification.Name("com.apple.Music.playerInfo"), object: nil)
    refresh()
  }

  @objc private func playerInfoChanged(_ note: Notification) {
    refresh()
  }

  private var isRunning: Bool {
    !NSRunningApplication.runningApplications(withBundleIdentifier: Self.bundleID).isEmpty
  }

  /// Read Music's state now. Music is never launched just to be read.
  func refresh(after delay: TimeInterval = 0) {
    queue.asyncAfter(deadline: .now() + delay) { [weak self] in
      guard let self else { return }
      let report = self.isRunning ? self.readReport() : nil
      let art = report.flatMap { self.readArtworkIfNew($0) }
      DispatchQueue.main.async {
        let now = ProcessInfo.processInfo.systemUptime
        self.onReport?(
          report ?? SourceReport(song: nil, state: .stopped, position: nil, readAt: now))
        if let art { self.onArtwork?(art.image) }
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

  /// Play the last song again when nothing plays (D31); this may open Music.
  func play(song: Song) {
    guard let id = song.trackID, id.allSatisfy({ $0.isHexDigit }) else {
      command("play", "play")
      return
    }
    command("play", "play (first track of library playlist 1 whose persistent ID is \"\(id)\")")
  }

  /// Bring Music's window to the front (the source line or art, D26).
  func bringForward() {
    guard
      let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: Self.bundleID)
    else { return }
    let config = NSWorkspace.OpenConfiguration()
    config.activates = true
    NSWorkspace.shared.openApplication(at: url, configuration: config) { _, _ in }
  }

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
    _ = run("tell application \"Music\" to \(verb)")
  }

  // MARK: Reading Music

  private func readReport() -> SourceReport? {
    let script = """
      tell application "Music"
        set ps to player state as string
        if ps is "stopped" then return {ps}
        set t to current track
        return {ps, name of t, artist of t, duration of t, player position, persistent ID of t}
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
    let title = list.atIndex(2)?.stringValue ?? ""
    let artist = list.atIndex(3)?.stringValue
    let song = Song(
      title: title, artist: (artist?.isEmpty ?? true) ? nil : artist, source: Self.sourceName,
      trackID: list.atIndex(6)?.stringValue, duration: list.atIndex(4)?.doubleValue)
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
