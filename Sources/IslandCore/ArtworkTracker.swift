import Foundation

/// Decides when a track's cover art is read from the player. A track is done
/// only once its art was read; a failed read is tried again, a bounded number
/// of times.
public struct ArtworkTracker: Sendable {
  public let maxAttempts: Int
  /// The last track whose art was read; `.some(nil)` is "no track".
  private var done: String??
  private var attemptKey: String??
  private var attempts = 0

  public init(maxAttempts: Int = 3) {
    self.maxAttempts = maxAttempts
  }

  /// Whether to read the art of the track `key` now.
  public mutating func shouldRead(_ key: String?) -> Bool {
    if let done, done == key { return false }
    if let attemptKey, attemptKey == key {
      guard attempts < maxAttempts else { return false }
    } else {
      attemptKey = .some(key)
      attempts = 0
    }
    attempts += 1
    return true
  }

  /// The read for `key` finished: `succeeded` says whether it worked.
  public mutating func finished(_ key: String?, succeeded: Bool) {
    if succeeded { done = .some(key) }
  }
}
