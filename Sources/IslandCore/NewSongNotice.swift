import CoreGraphics
import Foundation

/// Decides when a new song starts in a source (D115, D78), so the hub can
/// hand the island its notice. A song starts when a source plays a song other
/// than the last one it played; a pause and resume, or the same song read
/// again, is no new song. A source the island first sees mid-song (it was
/// already playing when the island started) is not one either: only a song
/// the app's own playhead puts near its start.
public struct NewSongDetector: Sendable {
  /// A source first seen playing this close to the song's start just started it.
  public static let freshStart: TimeInterval = 5
  /// A start is back-dated by the app's own playhead, by this much at most.
  public static let maxBackDate: TimeInterval = 1.5

  private struct Key: Equatable, Sendable {
    var title: String
    var artist: String?
    var trackID: String?
  }

  private var lastPlayed: [SourceID: Key] = [:]
  /// Sources that went out of view: their next report is read like a first sighting.
  private var unseen: Set<SourceID> = []

  public init() {}

  /// Take a source's report. Returns when the new song started (the island's
  /// clock, back-dated by the app's own playhead), or nil when no new song
  /// started.
  public mutating func take(_ id: SourceID, _ report: SourceReport) -> TimeInterval? {
    guard report.state == .playing, let song = report.song, !song.title.isEmpty else { return nil }
    let key = Key(title: song.title, artist: song.artist, trackID: song.trackID)
    let before = lastPlayed[id]
    lastPlayed[id] = key
    let firstSighting = before == nil || unseen.contains(id)
    unseen.remove(id)
    if before == key || report.joinedMidSong { return nil }
    let position = report.position
    if firstSighting, let position, position > Self.freshStart { return nil }
    return report.readAt - min(max(position ?? 0, 0), Self.maxBackDate)
  }

  /// The source went out of view (hidden behind another source).
  public mutating func hidden(_ id: SourceID) { unseen.insert(id) }

  /// The source's app quit or its tab closed: its next song starts afresh.
  public mutating func forget(_ id: SourceID) {
    lastPlayed[id] = nil
    unseen.remove(id)
  }
}

/// What the wing shows in the free gap (D114).
public enum WingFit: Equatable, Sendable {
  /// Not even the art fits: nothing pops.
  case none
  /// The art alone, the wing this wide.
  case artOnly(width: CGFloat)
  /// The art and the title as drawn (shortened with an ellipsis as needed).
  case artAndTitle(title: String, width: CGFloat)

  public var width: CGFloat? {
    switch self {
    case .none: return nil
    case .artOnly(let w), .artAndTitle(_, let w): return w
    }
  }
}

/// The wing's layout, right-aligned against the notch's left edge, inside the
/// menu bar strip. The title is drawn in the system font at `titleSize`.
public enum WingLayout {
  /// Kept clear between the last menu (or status icon) and the wing.
  public static let menuMargin: CGFloat = 2
  public static let leadingPad: CGFloat = 6
  public static let art: CGFloat = 20
  public static let artTitleSpacing: CGFloat = 6
  /// Between the title (or the art alone) and the notch.
  public static let trailingPad: CGFloat = 2
  public static let artTrailingPad: CGFloat = 6
  public static let titleSize: CGFloat = 12

  /// The wing's width with the art alone.
  public static var artOnlyWidth: CGFloat { leadingPad + art + artTrailingPad }
  /// The wing's width besides the title's own.
  public static var titleOverhead: CGFloat { leadingPad + art + artTitleSpacing + trailingPad }

  /// The wing for `title` in a free gap `gap` points wide; `measure` gives a
  /// string's width in the title's font.
  public static func fit(title: String, gap: CGFloat, measure: (String) -> CGFloat) -> WingFit {
    let room = gap - menuMargin
    guard room >= artOnlyWidth else { return .none }
    if let shown = shortened(title, toFit: room - titleOverhead, measure: measure) {
      return .artAndTitle(title: shown, width: titleOverhead + measure(shown))
    }
    return .artOnly(width: artOnlyWidth)
  }

  /// As much of `title` as fits in `width`: all of it, or its start and an
  /// ellipsis; nil when not even one letter and the ellipsis fit.
  public static func shortened(_ title: String, toFit width: CGFloat, measure: (String) -> CGFloat)
    -> String?
  {
    guard width > 0, !title.isEmpty else { return nil }
    if measure(title) <= width { return title }
    let letters = Array(title)
    var best: String?
    var lo = 1
    var hi = letters.count - 1
    while lo <= hi {
      let mid = (lo + hi) / 2
      var head = String(letters[0..<mid])
      while head.last == " " { head.removeLast() }
      let candidate = head + "…"
      if !head.isEmpty, measure(candidate) <= width {
        best = candidate
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return best
  }
}

/// The free gap left of the notch on the built-in screen: from the right
/// edge of the last menu or status icon left of the notch to the notch.
/// Everything in global top-left coordinates (Accessibility's).
public enum MenuBarGap {
  /// The gap's width, or nil when the menu bar could not be read (then
  /// nothing may pop: a menu it cannot see it could cover).
  /// `menuItems` are the frontmost app's menu bar items as Accessibility
  /// gives them, on `menuScreen`: when that is another screen (the visionary
  /// works on the external monitor), the built-in screen's menu bar shows
  /// the same menus from its own left edge.
  public static func width(
    notch: CGRect, home: CGRect, menuItems: [CGRect], menuScreen: CGRect?, statusItems: [CGRect]
  ) -> CGFloat? {
    guard !menuItems.isEmpty else { return nil }
    let shift = (menuScreen.map { home.minX - $0.minX }) ?? 0
    let menus = menuItems.map { $0.offsetBy(dx: shift, dy: 0) }
    let strip = CGRect(
      x: home.minX, y: home.minY, width: home.width, height: notch.maxY - home.minY)
    let status = statusItems.filter { $0.intersects(strip) }
    let obstacles = (menus + status).filter { $0.width > 0 && $0.minX < notch.minX }
    let edge = max(obstacles.map(\.maxX).max() ?? home.minX, home.minX)
    return max(0, notch.minX - edge)
  }
}

/// How long the wing stays out: four seconds after the last song started,
/// each new song while it is out holding it four seconds more (D115, D44).
public struct WingHold: Sendable {
  public static let seconds: TimeInterval = 4
  /// A wing comes out within this long of its song's start, or not at all (D134).
  public static let comeWindow: TimeInterval = 1
  public private(set) var foldAt: TimeInterval?
  public private(set) var startedAt: TimeInterval?

  public init() {}

  public mutating func songStarted(at time: TimeInterval) {
    foldAt = time + Self.seconds
    startedAt = time
  }

  /// Whether a wing not yet out may still come out for the last song (D134).
  /// A later app switch or a late read never brings one out.
  public func mayCome(at time: TimeInterval) -> Bool {
    guard let startedAt else { return false }
    return time <= startedAt + Self.comeWindow
  }

  public mutating func fold() { foldAt = nil }

  public func isOut(at time: TimeInterval) -> Bool {
    guard let foldAt else { return false }
    return time < foldAt
  }

  /// Whether a new song pops the wing at all: only while the island is
  /// closed and no app is fullscreen (D125), and only with room for the art.
  public static func pops(fit: WingFit, islandOpen: Bool, fullscreen: Bool) -> Bool {
    fit != .none && !islandOpen && !fullscreen
  }
}
