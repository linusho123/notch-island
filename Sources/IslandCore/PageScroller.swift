import Foundation

/// The open island's two pages, one size, scrolled between (D29, D30).
public enum IslandPage: Equatable, Sendable {
  case music
  case shelf
}

/// Turns scroll events into page changes: scrolling down reaches the shelf and
/// up returns (D30), from a two-finger scroll or a mouse wheel alike (D76).
///
/// `deltaY` is AppKit's `scrollingDeltaY`: negative scrolls the content up,
/// showing what lies below. A two-finger scroll is continuous and changes the
/// page once per gesture, after a short travel; a mouse wheel moves in notches
/// and each notch counts.
public struct PageScroller: Sendable {
  public private(set) var page: IslandPage = .music
  /// Points of two-finger travel that turn the page.
  public var threshold: Double

  private var travel: Double = 0
  private var turnedThisGesture = false

  public init(threshold: Double = 24) {
    self.threshold = threshold
  }

  /// Back to the music page (the island closed).
  public mutating func reset() {
    page = .music
    travel = 0
    turnedThisGesture = false
  }

  /// Turn directly to a page (e.g. drop target opened to the shelf) (D33).
  public mutating func show(_ target: IslandPage) {
    page = target
    travel = 0
    turnedThisGesture = false
  }

  /// One scroll event. `continuous` is a trackpad (or Magic Mouse) scroll;
  /// `gestureBegan` starts a new two-finger gesture; `momentum` events after
  /// the fingers lift never turn a page. Returns true when the page changed.
  @discardableResult
  public mutating func scroll(
    deltaY: Double, continuous: Bool, gestureBegan: Bool = false, momentum: Bool = false
  ) -> Bool {
    guard !momentum, deltaY.isFinite, deltaY != 0 else { return false }
    if !continuous {
      return turn(down: deltaY < 0)
    }
    if gestureBegan {
      travel = 0
      turnedThisGesture = false
    }
    guard !turnedThisGesture else { return false }
    travel += deltaY
    guard abs(travel) >= threshold else { return false }
    turnedThisGesture = true
    let down = travel < 0
    travel = 0
    return turn(down: down)
  }

  private mutating func turn(down: Bool) -> Bool {
    let next: IslandPage = down ? .shelf : .music
    guard next != page else { return false }
    page = next
    return true
  }
}
