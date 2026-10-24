import Foundation

/// Chrome's native messaging: each message is a 32-bit length in the
/// machine's byte order (little-endian here), then that many bytes of JSON.
/// The companion extension's host (D126) reads and writes it on its standard
/// input and output.
public enum NativeMessaging {
  /// The companion extension's id (from the key in its manifest).
  public static let extensionID = "iibgeapdjhifkjdbhpehkdpjejakjnfh"
  /// Chrome allows a message up to 1 MB to the host; nothing larger is taken.
  public static let maxMessage = 1 << 20

  /// The host is started by Chrome with the caller's origin as its first
  /// argument. Only the companion extension may talk to the island.
  public static func isAllowedOrigin(_ origin: String) -> Bool {
    origin == "chrome-extension://\(extensionID)/"
  }

  public static func frame(_ json: Data) -> Data {
    var length = UInt32(json.count).littleEndian
    var out = Data(bytes: &length, count: 4)
    out.append(json)
    return out
  }

  /// Take whole messages off the front of `buffer`. Returns nil when a
  /// message announces a length over the limit: the stream is not trusted.
  public static func unframe(_ buffer: inout Data) -> [Data]? {
    var messages: [Data] = []
    while buffer.count >= 4 {
      let bytes = [UInt8](buffer.prefix(4))
      let length =
        Int(bytes[0]) | Int(bytes[1]) << 8 | Int(bytes[2]) << 16 | Int(bytes[3]) << 24
      guard length <= maxMessage else { return nil }
      guard buffer.count >= 4 + length else { break }
      let start = buffer.startIndex
      messages.append(Data(buffer[(start + 4)..<(start + 4 + length)]))
      buffer.removeSubrange(start..<(start + 4 + length))
    }
    return messages
  }
}

/// One youtube.com or soundcloud.com tab the companion extension reports as
/// counting (D88), or one that closed while it counted (D117).
public struct ChromeTab: Equatable, Sendable {
  public var tab: Int
  public var site: String
  public var title: String
  public var artist: String?
  public var duration: TimeInterval?
  public var position: TimeInterval?
  public var playing: Bool
  public var url: String?
  /// The song played unheard (muted) before the tab counted: it joined the
  /// card mid-song, which is no new song (D122).
  public var joinedMidSong: Bool

  public init(
    tab: Int, site: String, title: String, artist: String?, duration: TimeInterval?,
    position: TimeInterval?, playing: Bool, url: String?, joinedMidSong: Bool = false
  ) {
    self.tab = tab
    self.site = site
    self.title = title
    self.artist = artist
    self.duration = duration
    self.position = position
    self.playing = playing
    self.url = url
    self.joinedMidSong = joinedMidSong
  }

  /// Read one tab out of the extension's message; anything malformed, or a
  /// site the island does not follow, is dropped.
  public static func parse(_ object: Any) -> ChromeTab? {
    guard let d = object as? [String: Any],
      let tab = (d["tab"] as? NSNumber)?.intValue,
      let site = d["site"] as? String, ["YouTube", "SoundCloud"].contains(site)
    else { return nil }
    let title = (d["title"] as? String) ?? ""
    return ChromeTab(
      tab: tab, site: site, title: String(title.prefix(300)),
      artist: (d["artist"] as? String).map { String($0.prefix(200)) },
      duration: (d["duration"] as? NSNumber)?.doubleValue,
      position: (d["position"] as? NSNumber)?.doubleValue,
      playing: (d["playing"] as? Bool) ?? false,
      url: (d["url"] as? String).map { String($0.prefix(2000)) },
      joinedMidSong: (d["joinedMidSong"] as? Bool) ?? false)
  }
}
