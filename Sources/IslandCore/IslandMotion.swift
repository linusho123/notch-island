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

/// The island drawn as one shape (D135): a neck exactly as wide as the notch
/// filling the menu bar strip, and below the strip the panel, joined to the
/// neck by curved shoulders. Rects here are top-left based (y grows down).
public struct IslandShape: Equatable, Sendable {
  /// The camera housing.
  public var notch: CGRect
  /// The menu bar strip's bottom edge (at least the notch's).
  public var stripBottom: CGFloat
  /// The open panel's size below the strip, shoulders included.
  public var openBody: CGSize

  public static let shoulderRadius: CGFloat = 10
  public static let topCornerRadius: CGFloat = 12
  public static let bottomRadius: CGFloat = 22

  public init(notch: CGRect, stripBottom: CGFloat, openBody: CGSize) {
    self.notch = notch
    self.stripBottom = max(stripBottom, notch.maxY)
    self.openBody = openBody
  }

  /// The neck: the notch's own width, never more, down to the strip's bottom
  /// while anything hangs below it; the notch itself when closed.
  public func neck(progress p: Double) -> CGRect {
    let bottom = p > 0 ? stripBottom : notch.maxY
    return CGRect(x: notch.minX, y: notch.minY, width: notch.width, height: bottom - notch.minY)
  }

  /// The part below the strip, centred under the notch: nothing while closed.
  public func body(progress p: Double) -> CGRect? {
    let w = IslandMotion.length(closed: notch.width, open: openBody.width, progress: p)
    let h = IslandMotion.length(closed: 0, open: openBody.height, progress: p)
    guard h >= 0.5 else { return nil }
    return CGRect(x: notch.midX - w / 2, y: stripBottom, width: w, height: h)
  }

  /// The body's outline in its own coordinates (origin top-left, y down):
  /// the neck's continuation at the top, concave shoulders out to the panel's
  /// top edge, rounded outer corners.
  public static func bodyPath(size: CGSize, neckWidth: CGFloat) -> CGPath {
    let path = CGMutablePath()
    let w = size.width
    let h = size.height
    let side = max(0, (w - neckWidth) / 2)
    let nl = side
    let nr = w - side
    let rs = min(shoulderRadius, side, h / 3)
    let rc = min(topCornerRadius, max(0, side - rs), max(0, (h - rs) / 3))
    let rb = min(bottomRadius, w / 2, max(0, h - rs - rc))
    path.move(to: CGPoint(x: nl, y: 0))
    path.addLine(to: CGPoint(x: nr, y: 0))
    if rs > 0 {
      path.addArc(
        center: CGPoint(x: nr + rs, y: 0), radius: rs, startAngle: .pi, endAngle: .pi / 2,
        clockwise: true)
    }
    path.addLine(to: CGPoint(x: w - rc, y: rs))
    if rc > 0 {
      path.addArc(
        center: CGPoint(x: w - rc, y: rs + rc), radius: rc, startAngle: -.pi / 2, endAngle: 0,
        clockwise: false)
    }
    path.addLine(to: CGPoint(x: w, y: h - rb))
    if rb > 0 {
      path.addArc(
        center: CGPoint(x: w - rb, y: h - rb), radius: rb, startAngle: 0, endAngle: .pi / 2,
        clockwise: false)
    }
    path.addLine(to: CGPoint(x: rb, y: h))
    if rb > 0 {
      path.addArc(
        center: CGPoint(x: rb, y: h - rb), radius: rb, startAngle: .pi / 2, endAngle: .pi,
        clockwise: false)
    }
    path.addLine(to: CGPoint(x: 0, y: rs + rc))
    if rc > 0 {
      path.addArc(
        center: CGPoint(x: rc, y: rs + rc), radius: rc, startAngle: .pi, endAngle: 3 * .pi / 2,
        clockwise: false)
    }
    path.addLine(to: CGPoint(x: nl - rs, y: rs))
    if rs > 0 {
      path.addArc(
        center: CGPoint(x: nl - rs, y: 0), radius: rs, startAngle: .pi / 2, endAngle: 0,
        clockwise: true)
    }
    path.closeSubpath()
    return path
  }

  /// Whether `p` (top-left based) is on the drawn shape at progress `progress`.
  /// The top edge counts, one point past it too: the pointer pushed against
  /// the top of the screen is on the notch.
  public func contains(_ p: CGPoint, progress: Double, neckBottomRadius: CGFloat) -> Bool {
    let neck = neck(progress: progress)
    let neckHit = CGRect(x: neck.minX, y: neck.minY - 1, width: neck.width, height: neck.height + 1)
    if neckHit.contains(p) {
      // Rounded bottom corners of the closed notch.
      let r = min(neckBottomRadius, neck.width / 2, neck.height)
      guard r > 0, p.y > neck.maxY - r else { return true }
      let cx: CGFloat
      if p.x < neck.minX + r {
        cx = neck.minX + r
      } else if p.x > neck.maxX - r {
        cx = neck.maxX - r
      } else {
        return true
      }
      let dx = p.x - cx
      let dy = p.y - (neck.maxY - r)
      return dx * dx + dy * dy <= r * r
    }
    guard let body = body(progress: progress), body.contains(p) else { return false }
    let local = CGPoint(x: p.x - body.minX, y: p.y - body.minY)
    return Self.bodyPath(size: body.size, neckWidth: notch.width).contains(local)
  }
}
