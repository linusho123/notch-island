import Foundation

/// After IINA is reopened on a file, a seek to where it was waits for the
/// file to show on the now-playing channel again. It waits a while and no
/// longer: a seek that never came must not jump a play of the same file an
/// hour later.
public struct PendingSeek: Sendable {
  private var pending: (title: String, position: TimeInterval, at: TimeInterval)?
  public static let lifetime: TimeInterval = 30

  public init() {}

  public mutating func set(title: String, position: TimeInterval, at time: TimeInterval) {
    pending = (title, position, time)
  }

  /// The position to seek to now that `title` shows, once.
  public mutating func take(title: String, at time: TimeInterval) -> TimeInterval? {
    guard let pending, pending.title == title else { return nil }
    self.pending = nil
    return time - pending.at <= Self.lifetime ? pending.position : nil
  }
}
