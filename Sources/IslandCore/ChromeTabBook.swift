import Foundation

/// The Chrome tabs the island follows, kept per connection. Each Chrome with
/// the companion extension (two profiles, say) has its own connection and its
/// own tab ids, which collide across Chromes; a tab is known by connection and
/// tab together, and one Chrome going away or reconnecting never drops the
/// other's tabs (P2 fix S4).
public struct ChromeTabBook: Sendable {
  private var tabs: [Int: Set<Int>] = [:]

  public init() {}

  /// The source id of a tab of a connection.
  public static func id(connection: Int, tab: Int) -> SourceID {
    .chromeTab(tab, connection: connection)
  }

  /// A connection reports the tabs that count now. Returns the ids of that
  /// connection's tabs that no longer do; another Chrome's tabs never go.
  public mutating func apply(connection: Int, tabs seen: [Int]) -> [SourceID] {
    let before = tabs[connection] ?? []
    tabs[connection] = Set(seen)
    return before.subtracting(seen).sorted().map { Self.id(connection: connection, tab: $0) }
  }

  /// A connection ended: every tab it held goes.
  public mutating func close(connection: Int) -> [SourceID] {
    let gone = apply(connection: connection, tabs: [])
    tabs[connection] = nil
    return gone
  }

  public var ids: Set<SourceID> {
    var out = Set<SourceID>()
    for (connection, set) in tabs {
      for tab in set { out.insert(Self.id(connection: connection, tab: tab)) }
    }
    return out
  }
}
