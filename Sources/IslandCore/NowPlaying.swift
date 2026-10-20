import Foundation

public enum PlayerState: String, Codable, Equatable, Sendable {
  case playing
  case paused
  case stopped
}

/// One followed source, as the hub tells them apart: Apple Music (which also
/// covers Music playing a downloaded file), QuickTime Player, IINA, and each
/// youtube.com or soundcloud.com tab in Chrome on its own.
public struct SourceID: Hashable, Codable, Sendable, RawRepresentable, CustomStringConvertible {
  public var rawValue: String
  public init(rawValue: String) { self.rawValue = rawValue }

  public static let appleMusic = SourceID(rawValue: "apple-music")
  public static let quickTime = SourceID(rawValue: "quicktime")
  public static let iina = SourceID(rawValue: "iina")
  public static func chromeTab(_ tab: Int) -> SourceID { SourceID(rawValue: "chrome-tab:\(tab)") }

  public var description: String { rawValue }
}

/// A song as the island shows it and as it is kept as the last song.
public struct Song: Codable, Equatable, Sendable {
  public var title: String
  public var artist: String?
  /// The source line's app or site part ("Apple Music", "YouTube", "IINA").
  public var source: String
  /// The source app's own id for the track, so play can start it again.
  public var trackID: String?
  public var duration: TimeInterval?
  /// Which source played it, so play on the last song reopens that app.
  public var sourceID: SourceID?
  /// The file or page it came from, when the source can say (to reopen it).
  public var location: String?

  public init(
    title: String, artist: String?, source: String, trackID: String?, duration: TimeInterval?,
    sourceID: SourceID? = nil, location: String? = nil
  ) {
    self.title = title
    self.artist = artist
    self.source = source
    self.trackID = trackID
    self.duration = duration
    self.sourceID = sourceID
    self.location = location
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

  /// A song the app is playing or has paused: a face on the card.
  public var isFace: Bool { state != .stopped && song != nil }
}

/// The card's count, shown whenever it has a flip control (D121): "1 of 2".
public struct FlipCount: Equatable, Sendable {
  public var index: Int
  public var count: Int
  public init(index: Int, count: Int) {
    self.index = index
    self.count = count
  }
  public var label: String { "\(index + 1) of \(count)" }
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
  /// Back, skip and seeking can be used.
  public var controlsEnabled: Bool
  /// The middle button (play or pause) can be clicked.
  public var playEnabled: Bool
  /// With more than one face, the flip control's count; nil without a flip.
  public var flip: FlipCount?

  public init(
    content: Content, isPlaying: Bool, controlsEnabled: Bool, playEnabled: Bool? = nil,
    flip: FlipCount? = nil
  ) {
    self.content = content
    self.isPlaying = isPlaying
    self.controlsEnabled = controlsEnabled
    self.playEnabled = playEnabled ?? controlsEnabled
    self.flip = flip
  }

  public var song: Song? {
    switch content {
    case .nothingPlayedYet: return nil
    case .current(let song), .lastSong(let song): return song
    }
  }
}

/// The now-playing hub. It merges the sources into the flip card: the newest
/// source in front, the others a flip away with an `n of m` count, cycling
/// only through the sources the island can see separately (D48, D111, D121);
/// a source that quits leaves (D117), and with nothing playing or paused the
/// last song is kept paused and ready (D31), with where it was when its app
/// quit, so play resumes it there. It never guesses: every face comes from a
/// source's own report.
public struct NowPlayingHub: Sendable {
  /// The faces' latest reports.
  public private(set) var reports: [SourceID: SourceReport] = [:]
  /// When each source joined the card; a hidden source keeps its turn.
  private var joined: [SourceID: Int] = [:]
  private var joins = 0
  /// The face flipped to; nil shows the newest.
  private var flipped: SourceID?
  public private(set) var lastSong: Song?
  /// Where the last song was when its app quit or its tab closed (D117).
  public private(set) var resumeAt: TimeInterval?
  /// A face that just read as stopped: an app that quits says "stopped" a
  /// moment before it is gone, and that must not lose where it was.
  private var justStopped: (id: SourceID, report: SourceReport, at: TimeInterval)?
  /// A hidden source's last report, kept for where it was should it quit.
  private var hiddenReports: [SourceID: SourceReport] = [:]
  /// A source left while none of the others played: the page shows its song
  /// paused and ready, until a source plays (D117).
  public private(set) var showsLastSong = false

  public init(lastSong: Song?, resumeAt: TimeInterval? = nil) {
    self.lastSong = lastSong
    self.resumeAt = resumeAt
  }

  /// The faces, newest first.
  public var faces: [SourceID] {
    reports.keys.sorted { (joined[$0] ?? 0) > (joined[$1] ?? 0) }
  }

  /// The face the card shows.
  public var shownID: SourceID? {
    if showsLastSong { return nil }
    if let flipped, reports[flipped] != nil { return flipped }
    return faces.first
  }

  public var report: SourceReport? { shownID.flatMap { reports[$0] } }

  /// P1's single source: Apple Music.
  @discardableResult
  public mutating func update(_ report: SourceReport) -> Bool {
    update(.appleMusic, report)
  }

  /// Take a source's report. Returns true when the last song changed and
  /// should be kept.
  @discardableResult
  public mutating func update(_ id: SourceID, _ report: SourceReport) -> Bool {
    guard report.isFace, let song = report.song else {
      guard let old = reports[id] else { return false }  // not on the card: nothing changes
      justStopped = (id, old, report.readAt)
      remove(id, keepTurn: false)
      if lastSong?.sourceID == id || (lastSong != nil && lastSong?.sourceID == nil) {
        resumeAt = nil  // stopped: play starts the song again (D31)
      }
      return keepFront()
    }
    if joined[id] == nil {
      joins += 1
      joined[id] = joins
      flipped = nil  // a new source takes the card (D48)
      showsLastSong = false
    }
    if report.state == .playing { showsLastSong = false }
    reports[id] = report
    hiddenReports[id] = nil
    if justStopped?.id == id { justStopped = nil }
    return keepFront()
  }

  /// The source cannot be seen separately for now (IINA behind another app
  /// on the shared now-playing channel, D111): no face, but it keeps its turn.
  public mutating func hide(_ id: SourceID) {
    if let report = reports[id] { hiddenReports[id] = report }
    remove(id, keepTurn: true)
  }

  /// The source's app quit or its tab closed (D117): it leaves the card. If
  /// its song is the last song, where it was is kept for play to resume.
  @discardableResult
  public mutating func leave(_ id: SourceID, at time: TimeInterval) -> Bool {
    var last = reports[id] ?? hiddenReports[id]
    var until = time
    if last == nil, let stopped = justStopped, stopped.id == id, time - stopped.at < 3 {
      last = stopped.report
      until = stopped.at
    }
    if justStopped?.id == id { justStopped = nil }
    hiddenReports[id] = nil
    remove(id, keepTurn: false)
    guard let last, let song = last.song else { return keepFront() }
    // Another source still plays: the newest remaining one shows. None does:
    // this song stays paused and ready, to resume where it was.
    guard !reports.values.contains(where: { $0.state == .playing }) else { return keepFront() }
    let wasLast = lastSong == song
    showsLastSong = true
    lastSong = song
    resumeAt = last.position(at: until)
    return !wasLast || resumeAt != nil
  }

  /// Turn the card to the next face (D48, D111): newest, then older ones,
  /// then round again.
  public mutating func flip() {
    let faces = faces
    guard faces.count > 1, let shown = shownID, let i = faces.firstIndex(of: shown) else { return }
    let next = faces[(i + 1) % faces.count]
    flipped = next == faces.first ? nil : next
  }

  private mutating func remove(_ id: SourceID, keepTurn: Bool) {
    reports[id] = nil
    if !keepTurn { joined[id] = nil }
    if flipped == id { flipped = nil }
  }

  /// The newest face's song is the last song; it plays or is paused now, so
  /// there is nothing to resume.
  private mutating func keepFront() -> Bool {
    guard !showsLastSong, let front = faces.first, let song = reports[front]?.song else {
      return false
    }
    resumeAt = nil
    guard song != lastSong else { return false }
    lastSong = song
    return true
  }

  public var page: MusicPage {
    if let report, let song = report.song {
      let faces = faces
      let flip =
        faces.count > 1
        ? FlipCount(index: faces.firstIndex(of: shownID!) ?? 0, count: faces.count) : nil
      return MusicPage(
        content: .current(song), isPlaying: report.state == .playing, controlsEnabled: true,
        flip: flip)
    }
    if let lastSong {
      // Nothing acts on a guess: only play, which starts the last song again.
      return MusicPage(
        content: .lastSong(lastSong), isPlaying: false, controlsEnabled: false, playEnabled: true)
    }
    return MusicPage(content: .nothingPlayedYet, isPlaying: false, controlsEnabled: false)
  }

  /// The position to show now, when there is a current song.
  public func position(at time: TimeInterval) -> TimeInterval? {
    guard let report, report.state != .stopped else { return nil }
    return report.position(at: time)
  }
}

/// The last song as it is kept: the song, and where it was when its app quit.
public struct KeptSong: Codable, Equatable, Sendable {
  public var song: Song
  public var resumeAt: TimeInterval?
  public init(song: Song, resumeAt: TimeInterval?) {
    self.song = song
    self.resumeAt = resumeAt
  }
}

/// Keeps the last song across restarts, as a small JSON file.
public struct LastSongStore: Sendable {
  public let file: URL

  public init(directory: URL) {
    file = directory.appendingPathComponent("last-song.json")
  }

  public func load() -> Song? { loadKept()?.song }

  public func loadKept() -> KeptSong? {
    guard let data = try? Data(contentsOf: file) else { return nil }
    if let kept = try? JSONDecoder().decode(KeptSong.self, from: data) { return kept }
    // P1 kept the song alone.
    return (try? JSONDecoder().decode(Song.self, from: data)).map {
      KeptSong(song: $0, resumeAt: nil)
    }
  }

  public func save(_ song: Song, resumeAt: TimeInterval? = nil) throws {
    try FileManager.default.createDirectory(
      at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    let data = try JSONEncoder().encode(KeptSong(song: song, resumeAt: resumeAt))
    try data.write(to: file, options: .atomic)
  }
}

/// The audio output the Mac plays through, from the system's default output.
public struct OutputDevice: Equatable, Sendable {
  public var name: String
  public var isBuiltIn: Bool
  public init(name: String, isBuiltIn: Bool) {
    self.name = name
    self.isBuiltIn = isBuiltIn
  }
}

/// The source line (D119, D120): the site for Chrome sources and the app
/// otherwise, adding the speaker only when it is not the built-in one.
public func sourceLine(for song: Song, output: OutputDevice?) -> String {
  guard let output, !output.isBuiltIn, !output.name.isEmpty else { return song.source }
  return "\(song.source) · \(output.name)"
}
