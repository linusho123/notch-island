import Foundation

/// How the island feels under the pointer. Both times are held to be felt on
/// the real machine and tuned there (D51, D52), so they are configuration,
/// never constants buried in the code that uses them.
public struct IslandTiming: Equatable, Sendable {
  /// How long the pointer must rest on the closed notch before it opens (D51).
  public var rest: TimeInterval
  /// How long the pointer may be off the open island before it closes (D52).
  public var grace: TimeInterval
  /// How far, in points, the pointer may drift and still count as resting. A
  /// sweep across the notch keeps moving further than this, so it never rests.
  public var restRadius: Double

  public static let standard = IslandTiming(rest: 0.3, grace: 0.5, restRadius: 8)

  public init(rest: TimeInterval, grace: TimeInterval, restRadius: Double) {
    self.rest = rest
    self.grace = grace
    self.restRadius = restRadius
  }
}

/// The island's two pointer states (the wing arrives with the new-song notice).
public enum IslandState: Equatable, Sendable {
  case closed
  case open
}

/// The pointer rules of the island as a pure state machine: a rest opens it, a
/// sweep does not (D51, D99); a click opens it at once (D74); it closes after a
/// grace off the island, never while a drag that began on it is under way
/// (D52). Time is passed in, so the rules are tested without a clock.
public struct HoverMachine: Sendable {
  public private(set) var state: IslandState = .closed
  public var timing: IslandTiming

  private var restAnchor: (x: Double, y: Double, time: TimeInterval)?
  private var graceStart: TimeInterval?
  private var dragging = false

  public init(timing: IslandTiming = .standard) {
    self.timing = timing
  }

  /// The pointer is at (x, y) at `time`; `inside` says whether that point is
  /// on the island's drawn shape as it stands (the notch while closed, the
  /// panel while open).
  public mutating func pointer(x: Double, y: Double, inside: Bool, at time: TimeInterval) {
    switch state {
    case .closed:
      guard inside else {
        restAnchor = nil
        return
      }
      if let anchor = restAnchor {
        let dx = x - anchor.x
        let dy = y - anchor.y
        if (dx * dx + dy * dy).squareRoot() > timing.restRadius {
          restAnchor = (x, y, time)
        }
      } else {
        restAnchor = (x, y, time)
      }
    case .open:
      if inside {
        graceStart = nil
      } else if !dragging, graceStart == nil {
        graceStart = time
      }
    }
  }

  /// A primary click on the closed notch opens the island at once.
  public mutating func click(at time: TimeInterval) {
    if state == .closed { open() }
  }

  /// A secondary click shows the Quit menu; it never opens the island, so a
  /// rest that had begun is forgotten.
  public mutating func secondaryClick() {
    restAnchor = nil
  }

  /// A drag began on the open island; it holds the island open until let go.
  public mutating func dragBegan() {
    guard state == .open else { return }
    dragging = true
    graceStart = nil
  }

  /// The drag was let go; `inside` says whether the pointer is on the island.
  public mutating func dragEnded(inside: Bool, at time: TimeInterval) {
    guard dragging else { return }
    dragging = false
    if state == .open, !inside { graceStart = time }
  }

  public var isDragging: Bool { dragging }

  /// When the machine next needs a `tick`, if ever.
  public var nextDeadline: TimeInterval? {
    switch state {
    case .closed: return restAnchor.map { $0.time + timing.rest }
    case .open: return dragging ? nil : graceStart.map { $0 + timing.grace }
    }
  }

  /// Let time pass to `time`; returns true when the state changed.
  @discardableResult
  public mutating func tick(at time: TimeInterval) -> Bool {
    guard let deadline = nextDeadline, time >= deadline else { return false }
    switch state {
    case .closed: open()
    case .open: close()
    }
    return true
  }

  /// Close at once (the island is quitting, or the screen went away).
  public mutating func close() {
    state = .closed
    restAnchor = nil
    graceStart = nil
    dragging = false
  }

  private mutating func open() {
    state = .open
    restAnchor = nil
    graceStart = nil
  }
}
