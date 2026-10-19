import Foundation

public enum PlayerState: String, Codable, Equatable, Sendable {
  case playing
  case paused
  case stopped
}

/// A song as the island shows it and as it is kept as the last song.
public struct Song: Codable, Equatable, Sendable {
  public var title: String
  public var artist: String?
  /// The source line's app part ("Apple Music").
  public var source: String
  /// The source app's own id for the track, so play can start it again.
  public var trackID: String?
  public var duration: TimeInterval?

  public init(
    title: String, artist: String?, source: String, trackID: String?, duration: TimeInterval?
  ) {
    self.title = title
    self.artist = artist
    self.source = source
    self.trackID = trackID
    self.duration = duration
  }
}

/// What one source reports, read from the app itself.
public struct SourceReport: Equatable, Sendable {
  public var song: Song?
  public var state: PlayerState
  /// The position the app reported, and when it was read.
  public var position: TimeInterval?
  public var readAt: TimeInterval

  public init(song: Song?, state: PlayerState, position: TimeInterval?, readAt: TimeInterval) {
    self.song = song
    self.state = state
    self.position = position
    self.readAt = readAt
  }

  /// The position now: the read position, carried on while the app plays.
  public func position(at time: TimeInterval) -> TimeInterval? {
    guard var position else { return nil }
    if state == .playing { position += max(0, time - readAt) }
    if let duration = song?.duration, duration > 0 { position = min(position, duration) }
    return position
  }
}

/// What the music page shows.
public struct MusicPage: Equatable, Sendable {
  public enum Content: Equatable, Sendable {
    /// Before any song has ever played (D90).
    case nothingPlayedYet
    /// A song the app is playing or has paused.
    case current(Song)
    /// Nothing is playing or paused: the last song, paused and ready (D31).
    case lastSong(Song)
  }

  public var content: Content
  /// The app is really playing: the middle button shows pause, otherwise play.
  public var isPlaying: Bool
  /// Back, play/pause and skip can be clicked.
  public var controlsEnabled: Bool

  public init(content: Content, isPlaying: Bool, controlsEnabled: Bool) {
    self.content = content
    self.isPlaying = isPlaying
    self.controlsEnabled = controlsEnabled
  }

  public var song: Song? {
    switch content {
    case .nothingPlayedYet: return nil
    case .current(let song), .lastSong(let song): return song
    }
  }
}

/// The now-playing hub, P1's minimal one: it holds one source and the last
/// song. It never guesses: what it shows comes from the source's reports.
public struct NowPlayingHub: Sendable {
  public private(set) var report: SourceReport?
  public private(set) var lastSong: Song?

  public init(lastSong: Song?) {
    self.lastSong = lastSong
  }

  /// Take a report from the source. Returns true when the last song changed
  /// and should be kept.
  @discardableResult
  public mutating func update(_ report: SourceReport) -> Bool {
    self.report = report
    guard report.state != .stopped, let song = report.song, song != lastSong else { return false }
    lastSong = song
    return true
  }

  public var page: MusicPage {
    if let report, report.state != .stopped, let song = report.song {
      return MusicPage(
        content: .current(song), isPlaying: report.state == .playing, controlsEnabled: true)
    }
    if let lastSong {
      return MusicPage(content: .lastSong(lastSong), isPlaying: false, controlsEnabled: true)
    }
    return MusicPage(content: .nothingPlayedYet, isPlaying: false, controlsEnabled: false)
  }

  /// The position to show now, when there is a current song.
  public func position(at time: TimeInterval) -> TimeInterval? {
    guard let report, report.state != .stopped else { return nil }
    return report.position(at: time)
  }
}

/// Keeps the last song across restarts, as a small JSON file.
public struct LastSongStore: Sendable {
  public let file: URL

  public init(directory: URL) {
    file = directory.appendingPathComponent("last-song.json")
  }

  public func load() -> Song? {
    guard let data = try? Data(contentsOf: file) else { return nil }
    return try? JSONDecoder().decode(Song.self, from: data)
  }

  public func save(_ song: Song) throws {
    try FileManager.default.createDirectory(
      at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    let data = try JSONEncoder().encode(song)
    try data.write(to: file, options: .atomic)
  }
}
