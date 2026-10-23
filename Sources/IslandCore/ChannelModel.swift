import Foundation

/// What the system's shared now-playing channel shows: one app at a time.
public struct ChannelInfo: Equatable, Sendable {
  public var bundleID: String?
  public var pid: pid_t
  public var title: String?
  public var artist: String?
  public var duration: TimeInterval?
  /// The elapsed time the channel reported, and the wall-clock time it holds for.
  public var elapsed: TimeInterval?
  public var timestamp: TimeInterval?
  public var rate: Double
  public var playing: Bool
  /// Wall-clock time of the read.
  public var readAt: TimeInterval

  public init(
    bundleID: String?, pid: pid_t, title: String?, artist: String?, duration: TimeInterval?,
    elapsed: TimeInterval?, timestamp: TimeInterval?, rate: Double, playing: Bool,
    readAt: TimeInterval
  ) {
    self.bundleID = bundleID
    self.pid = pid
    self.title = title
    self.artist = artist
    self.duration = duration
    self.elapsed = elapsed
    self.timestamp = timestamp
    self.rate = rate
    self.playing = playing
    self.readAt = readAt
  }

  /// The position now, carried on from the channel's timestamp while it plays.
  public func position(atWallClock now: TimeInterval) -> TimeInterval? {
    guard let elapsed else { return nil }
    guard playing, rate > 0, let timestamp else { return elapsed }
    return elapsed + rate * max(0, now - timestamp)
  }
}

/// What the adapter's stream does to the channel.
public enum ChannelEffect: Equatable, Sendable {
  /// The channel's state changed: a new info, or nil when it is no longer known.
  case changed(ChannelInfo?)
  /// The adapter says it cannot work (MediaRemote denied or changed).
  case dead
}

/// What to do about an adapter process that ended.
public enum RespawnDecision: Equatable, Sendable {
  case restart(after: TimeInterval)
  case giveUp
}

/// The shared now-playing channel as the island knows it: the adapter's
/// lines in, the channel's info out, and the respawn policy for an adapter
/// that ends. When the adapter ends the channel is no longer known: the info
/// is dropped, so a source read from it (IINA) has no face rather than
/// staying "playing" forever (P2 fix M3).
public struct ChannelModel: Sendable {
  public private(set) var info: ChannelInfo?
  private var buffer = Data()
  private var startedAt: TimeInterval?
  private var quickExits = 0
  private var broken = false
  /// An adapter that ran at least this long was healthy.
  static let healthyRun: TimeInterval = 30
  /// Exits sooner than this after the start count as the adapter failing.
  static let quickRun: TimeInterval = 5
  static let maxQuickExits = 4

  public init() {}

  public mutating func started(at time: TimeInterval) { startedAt = time }

  /// Take bytes from the adapter. `bundleID` names the app of a process id.
  public mutating func take(_ data: Data, bundleID: (pid_t) -> String?) -> [ChannelEffect] {
    buffer.append(data)
    var effects: [ChannelEffect] = []
    while let newline = buffer.firstIndex(of: 0x0A) {
      let line = buffer[buffer.startIndex..<newline]
      buffer.removeSubrange(buffer.startIndex...newline)
      guard let object = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any]
      else { continue }
      switch object["type"] as? String {
      case "error":
        broken = true
        effects.append(.dead)
      case "nowPlaying":
        let pid = (object["pid"] as? NSNumber)?.int32Value ?? 0
        let info = ChannelInfo(
          bundleID: pid > 0 ? bundleID(pid) : nil, pid: pid, title: object["title"] as? String,
          artist: object["artist"] as? String,
          duration: (object["duration"] as? NSNumber)?.doubleValue,
          elapsed: (object["elapsed"] as? NSNumber)?.doubleValue,
          timestamp: (object["timestamp"] as? NSNumber)?.doubleValue,
          rate: (object["rate"] as? NSNumber)?.doubleValue ?? 0,
          playing: (object["playing"] as? NSNumber)?.boolValue ?? false,
          readAt: (object["now"] as? NSNumber)?.doubleValue ?? Date().timeIntervalSince1970)
        self.info = info
        effects.append(.changed(info))
      default: continue
      }
    }
    return effects
  }

  /// The adapter process ended at `time`. The channel is no longer known;
  /// a quick, repeated end is a failing adapter: back off, then give up. An
  /// adapter that reported an error is not started again.
  public mutating func ended(at time: TimeInterval) -> (
    effects: [ChannelEffect], decision: RespawnDecision
  ) {
    var effects: [ChannelEffect] = []
    if info != nil {
      info = nil
      effects.append(.changed(nil))
    }
    buffer = Data()
    let ran = time - (startedAt ?? time)
    startedAt = nil
    if ran >= Self.healthyRun { quickExits = 0 }
    if ran < Self.quickRun { quickExits += 1 }
    if broken || quickExits > Self.maxQuickExits { return (effects, .giveUp) }
    let delay = min(2 * pow(2, Double(max(0, quickExits - 1))), 30)
    return (effects, .restart(after: delay))
  }
}
