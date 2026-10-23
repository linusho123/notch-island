import Foundation

/// What the island sends QuickTime Player through the shared now-playing
/// channel (D46): the system's next / previous command, and only when the
/// channel shows QuickTime, so no other app is ever skipped.
public enum QuickTimeCommand {
  public static let bundleID = "com.apple.QuickTimePlayerX"

  public static func skip(on channel: ChannelInfo?) -> String? {
    channel.shows(bundleID) ? "next" : nil
  }

  public static func back(on channel: ChannelInfo?) -> String? {
    channel.shows(bundleID) ? "previous" : nil
  }
}
