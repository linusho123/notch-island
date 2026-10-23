import Foundation

/// One QuickTime Player document as a read of its dictionary gave it.
public struct QuickTimeDocument: Equatable, Sendable {
  public var name: String
  public var path: String
  public var duration: TimeInterval?
  public var playing: Bool
  public var currentTime: TimeInterval?

  public init(
    name: String, path: String, duration: TimeInterval?, playing: Bool, currentTime: TimeInterval?
  ) {
    self.name = name
    self.path = path
    self.duration = duration
    self.playing = playing
    self.currentTime = currentTime
  }
}

/// What one QuickTime read says. A read that failed (a timeout, QuickTime
/// busy) says nothing about what QuickTime does; only a read that succeeded
/// and found no document says "stopped".
public enum QuickTimeRead {
  /// `documents` is nil when the read failed.
  public static func report(
    id: SourceID, documents: [QuickTimeDocument]?, at now: TimeInterval
  ) -> SourceReport? {
    guard let documents else { return nil }
    guard let doc = documents.first(where: \.playing) ?? documents.first, !doc.name.isEmpty
    else { return SourceReport(song: nil, state: .stopped, position: nil, readAt: now) }
    let song = Song(
      title: doc.name, artist: nil, source: "QuickTime Player", trackID: nil,
      duration: doc.duration, sourceID: id, location: doc.path.isEmpty ? nil : doc.path)
    return SourceReport(
      song: song, state: doc.playing ? .playing : .paused, position: doc.currentTime, readAt: now)
  }
}

/// The AppleScript the island sends QuickTime Player by name. A command sent
/// by name starts QuickTime when it is not running, so every one except the
/// reopen of the last song (which is meant to start it) first checks that it
/// runs (P2 fix S3).
public enum QuickTimeScripts {
  public static func command(_ verb: String) -> String {
    """
    if application "QuickTime Player" is not running then error "not running"
    tell application "QuickTime Player" to \(verb)
    """
  }
}
