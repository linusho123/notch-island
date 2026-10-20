import Foundation

/// What the progress bar shows just after a seek. Music applies a seek a
/// moment after it is sent, and a position read in between is still the old
/// one; showing it would flash the dot back to where the song was. So the
/// clicked position is held until Music reports one near it, or for `bound`
/// seconds at most, after which Music's real position wins (D124: the island
/// never shows a state the app is not in for longer than that).
public struct SeekHold: Equatable, Sendable {
  /// How long a seek that Music does not confirm is held.
  public static let bound: TimeInterval = 1.0
  /// How near to the (carried-on) target Music's position confirms the seek.
  public static let tolerance: TimeInterval = 1.0

  private var target: TimeInterval?
  private var startedAt: TimeInterval = 0
  private var playing = false

  public init() {}

  /// The bar was let go at `target`; `playing` says whether the song plays on.
  public mutating func begin(target: TimeInterval, at time: TimeInterval, playing: Bool) {
    self.target = target
    self.startedAt = time
    self.playing = playing
  }

  /// Drop the hold (a different song, nothing playing).
  public mutating func cancel() {
    target = nil
  }

  public var isHolding: Bool { target != nil }

  /// The position to show at `time`, given the position Music really reports.
  public mutating func shown(real: TimeInterval, at time: TimeInterval) -> TimeInterval {
    guard let target else { return real }
    let elapsed = max(0, time - startedAt)
    let held = playing ? target + elapsed : target
    if elapsed > Self.bound || abs(real - held) <= Self.tolerance {
      self.target = nil
      return real
    }
    return held
  }
}
