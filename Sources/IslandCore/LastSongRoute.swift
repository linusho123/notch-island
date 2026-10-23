import Foundation

/// Where play on the kept last song goes (D31, D117, D124).
public enum LastSongRoute: Equatable, Sendable {
  /// A live source part reopens it.
  case part(SourceID)
  /// Chrome opens this page (youtube.com or soundcloud.com only).
  case openPage(URL)
  /// Nothing is known to reopen it from: play does nothing.
  case nothing
}

public enum LastSongRouting {
  /// `liveParts` are the parts that exist now; `closedTabKnown` says the
  /// extension still holds the closed tab to reopen. A song from one source
  /// never starts another source (D124): a Chrome song whose tab part is
  /// gone reopens its page in Chrome, or does nothing.
  public static func route(
    _ song: Song, liveParts: Set<SourceID>, closedTabKnown: Bool, resumeAt: TimeInterval?
  ) -> LastSongRoute {
    guard let id = song.sourceID else { return .part(.appleMusic) }
    if liveParts.contains(id) { return .part(id) }
    guard id.rawValue.hasPrefix("chrome-tab:") else { return .nothing }
    if closedTabKnown { return .part(id) }
    guard let location = song.location, let url = reopenURL(location, at: resumeAt) else {
      return .nothing
    }
    return .openPage(url)
  }

  /// Whether a page is one the island follows: youtube.com or soundcloud.com
  /// (and their subdomains), over http or https.
  public static func site(of url: URL) -> String? {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
      let host = url.host?.lowercased()
    else { return nil }
    func isHost(_ name: String) -> Bool { host == name || host.hasSuffix("." + name) }
    if isHost("youtube.com") { return "YouTube" }
    if isHost("soundcloud.com") { return "SoundCloud" }
    return nil
  }

  /// The same page from `position`: `t=<s>s` on YouTube, `#t=m:ss` on
  /// SoundCloud (as the extension's own reopen does). Nil for any other page.
  public static func reopenURL(_ location: String, at position: TimeInterval?) -> URL? {
    guard let url = URL(string: location), let site = site(of: url),
      var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { return nil }
    let seconds = max(0, Int((position ?? 0).rounded(.down)))
    if site == "YouTube" {
      var items = (parts.queryItems ?? []).filter { $0.name != "t" }
      items.append(URLQueryItem(name: "t", value: "\(seconds)s"))
      parts.queryItems = items
    } else {
      parts.fragment = String(format: "t=%d:%02d", seconds / 60, seconds % 60)
    }
    return parts.url
  }
}
