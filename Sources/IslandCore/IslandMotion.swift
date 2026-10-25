import CoreGraphics
import Foundation

/// How a moving part of the island travels toward where it rests (D137,
/// D139): a damped spring, solved exactly rather than stepped, so a sample
/// at any moment is the same however often frames are drawn.
public enum SpringCurve: Equatable, Sendable {
  /// Underdamped: it passes its resting place by a little and settles.
  case bouncy(damping: Double, frequency: Double)
  /// Critically damped: it comes to rest without passing it.
  case critical(frequency: Double)

  /// The offset from the resting place and the speed, `t` seconds after
  /// starting at offset `y0` with speed `v0`.
  public func state(y0: Double, v0: Double, t: Double) -> (y: Double, v: Double) {
    switch self {
    case .bouncy(let z, let w):
      let wd = w * (1 - z * z).squareRoot()
      let e = exp(-z * w * t)
      let c = cos(wd * t)
      let s = sin(wd * t)
      let y = e * (y0 * c + (v0 + z * w * y0) / wd * s)
      let v = e * (v0 * c - (w * w * y0 + z * w * v0) / wd * s)
      return (y, v)
    case .critical(let w):
      let e = exp(-w * t)
      let b = v0 + w * y0
      return ((y0 + b * t) * e, (v0 - w * b * t) * e)
    }
  }

  /// Its natural frequency, for the size of a motion's remaining swing.
  public var frequency: Double {
    switch self {
    case .bouncy(_, let w), .critical(let w): return w
    }
  }
}

/// One value moving between 0 (the plain notch, a folded wing) and 1 (the
/// open panel, a wing that is out), driven frame by frame from the island's
/// own state. Turning back mid-way starts the new motion from where the value
/// is and how fast it is going, so it never jumps.
public struct MotionValue: Sendable {
  public private(set) var target: Double
  private var startTime: TimeInterval = 0
  private var y0: Double = 0
  private var v0: Double = 0
  private var curve: SpringCurve = IslandMotion.opening
  /// Settled exactly at the target.
  private var resting = true

  public init(at value: Double = 0) {
    target = value
  }

  /// Head for `target` from now on, along `curve`.
  public mutating func retarget(to newTarget: Double, curve: SpringCurve, at time: TimeInterval) {
    let (x, v) = sample(at: time)
    target = newTarget
    self.curve = curve
    startTime = time
    y0 = x - newTarget
    v0 = v
    resting = abs(y0) < 1e-9 && abs(v0) < 1e-9
  }

  /// The value and its speed at `time`.
  public func sample(at time: TimeInterval) -> (x: Double, v: Double) {
    guard !resting else { return (target, 0) }
    let t = max(0, time - startTime)
    let (y, v) = curve.state(y0: y0, v0: v0, t: t)
    return (target + y, v)
  }

  /// How far the value may still swing from its target at `time`: its
  /// offset and its speed taken together.
  public func swing(at time: TimeInterval) -> Double {
    guard !resting else { return 0 }
    let (x, v) = sample(at: time)
    let y = x - target
    let w = curve.frequency
    return (y * y + (v / w) * (v / w)).squareRoot()
  }

  /// Whether the motion has come to rest by `time` (and, once it has, rest
  /// exactly at the target).
  public mutating func settle(at time: TimeInterval) -> Bool {
    if resting { return true }
    if swing(at: time) < IslandMotion.restSwing {
      resting = true
      y0 = 0
      v0 = 0
    }
    return resting
  }

  public var isResting: Bool { resting }
}

/// The island's motions (D137, D138, D139). Opening springs out of the notch
/// in about 0.4 s and passes its resting place by a little; closing shrinks
/// back in about 0.3 s with no bounce. The wing uses the same two.
public enum IslandMotion {
  /// The opening spring: about 2 % overshoot, settled in about 0.4 s.
  public static let opening = SpringCurve.bouncy(damping: 0.78, frequency: 18)
  /// The closing: no overshoot, within half a point of the notch by 0.3 s.
  public static let closing = SpringCurve.critical(frequency: 27)
  /// The most an edge may pass its resting place, in points (D138: four).
  public static let maxOvershoot: CGFloat = 3.5
  /// A swing this small (of the whole travel) counts as at rest.
  public static let restSwing = 0.002
  /// The open panel's content fades in once the swing is this small.
  public static let contentSwing = 0.012

  /// A length travelling from `closed` to `open` with progress `p`, its
  /// overshoot past `open` held to `maxOvershoot` points and never below
  /// `closed`.
  public static func length(closed: CGFloat, open: CGFloat, progress p: Double) -> CGFloat {
    let raw = closed + (open - closed) * CGFloat(p)
    let lo = min(closed, open)
    let hi = max(closed, open)
    return min(max(raw, lo), hi + maxOvershoot)
  }

  /// The wing's width at progress `p` toward `full` (D139): grown out of the
  /// notch's edge with the opening's spring, never wider than `room`, its
  /// free gap, even mid-bounce.
  public static func wingWidth(full: CGFloat, room: CGFloat, progress p: Double) -> CGFloat {
    min(length(closed: 0, open: full, progress: p), max(room, 0))
  }
}

/// The island's shape (D140, D136): the plain notch, and below the menu bar
/// strip a card of its own, centred under the notch, its top edge `gap`
/// points below the notch's bottom edge, with nothing drawn between them.
/// Opening, the card grows down out of the notch: it starts as a sliver as
/// wide as the notch at the strip's bottom edge and each of its four edges
/// travels to its open place, so it widens only below the strip and the
/// only part of the island inside the strip is the notch. Closing, it
/// shrinks back up into the notch the same way. Rects here are top-left
/// based (y grows down).
public struct IslandShape: Equatable, Sendable {
  /// The camera housing.
  public var notch: CGRect
  /// The menu bar strip's bottom edge (at least the notch's).
  public var stripBottom: CGFloat
  /// The open card's size.
  public var openCard: CGSize

  /// The space between the notch's bottom edge and the open card's top (D140: about 8).
  public static let gap: CGFloat = 8
  /// The card's corner radius, all four corners.
  public static let cornerRadius: CGFloat = 22

  public init(notch: CGRect, stripBottom: CGFloat, openCard: CGSize) {
    self.notch = notch
    self.stripBottom = max(stripBottom, notch.maxY)
    self.openCard = openCard
  }

  /// The open card where it rests: centred under the notch, `gap` below it,
  /// and never inside the menu bar strip.
  public var openFrame: CGRect {
    let top = max(notch.maxY + Self.gap, stripBottom)
    return CGRect(
      x: notch.midX - openCard.width / 2, y: top, width: openCard.width, height: openCard.height)
  }

  /// Where the card starts from and shrinks back to: the notch's width, no
  /// height, at the strip's bottom edge right under the notch.
  public var closedFrame: CGRect {
    CGRect(x: notch.minX, y: stripBottom, width: notch.width, height: 0)
  }

  /// The card at progress `p`: each edge travels from its closed place to its
  /// open one, passing it by at most `IslandMotion.maxOvershoot`; nothing
  /// while closed.
  public func card(progress p: Double) -> CGRect? {
    let from = closedFrame
    let to = openFrame
    let top = IslandMotion.length(closed: from.minY, open: to.minY, progress: p)
    let bottom = IslandMotion.length(closed: from.maxY, open: to.maxY, progress: p)
    let half = IslandMotion.length(closed: from.width / 2, open: to.width / 2, progress: p)
    guard bottom - top >= 0.5 else { return nil }
    return CGRect(x: notch.midX - half, y: top, width: 2 * half, height: bottom - top)
  }

  /// Everything drawn at progress `p`: the notch, then the card if any.
  public func parts(progress p: Double) -> [CGRect] {
    [notch] + (card(progress: p).map { [$0] } ?? [])
  }

  /// The card's outline in its own coordinates: a rect with all four corners
  /// rounded, the radius held to what the size allows mid-motion.
  public static func cardPath(size: CGSize) -> CGPath {
    let r = max(0, min(cornerRadius, size.width / 2, size.height / 2))
    return CGPath(
      roundedRect: CGRect(origin: .zero, size: size), cornerWidth: r, cornerHeight: r,
      transform: nil)
  }

  /// Whether `p` (top-left based) is on the drawn shape at `progress`: the
  /// notch with its rounded bottom corners, its top edge counted one point
  /// past (the pointer pushed against the top of the screen is on the
  /// notch), or inside the card's rounded rect. Nothing else: not the gap,
  /// not the strip beside the notch, not the card's corners.
  public func contains(_ p: CGPoint, progress: Double) -> Bool {
    let notchHit = CGRect(
      x: notch.minX, y: notch.minY - 1, width: notch.width, height: notch.height + 1)
    if notchHit.contains(p) {
      let r = min(NotchGeometry.closedBottomRadius, notch.width / 2, notch.height)
      guard r > 0, p.y > notch.maxY - r else { return true }
      let cx: CGFloat
      if p.x < notch.minX + r {
        cx = notch.minX + r
      } else if p.x > notch.maxX - r {
        cx = notch.maxX - r
      } else {
        return true
      }
      let dx = p.x - cx
      let dy = p.y - (notch.maxY - r)
      return dx * dx + dy * dy <= r * r
    }
    guard let card = card(progress: progress), card.contains(p) else { return false }
    let local = CGPoint(x: p.x - card.minX, y: p.y - card.minY)
    return Self.cardPath(size: card.size).contains(local)
  }
}
