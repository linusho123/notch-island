import Foundation

/// How often a source is checked on a timer, where its app tells the island
/// nothing itself. Everything else runs on events (DESIGN).
public enum PollPolicy {
  /// Music announces track and state changes but not a playhead moved in its
  /// own window, so while it plays the playhead is looked at now and then
  /// (D133): a resume is then off by at most about this much.
  public static func musicPlayhead(isPlaying: Bool) -> TimeInterval? {
    isPlaying ? 12 : nil
  }

  /// QuickTime Player sends nothing: about once a second while it is open,
  /// and not at all once it quits (D132).
  public static func quickTime(isOpen: Bool) -> TimeInterval? { isOpen ? 1 : nil }
}
