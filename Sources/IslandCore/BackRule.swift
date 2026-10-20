import Foundation

/// What a click on back does (D112): at three seconds in or earlier, `0:03`
/// itself included, it goes to the previous song; later it restarts the song.
public enum BackAction: Equatable, Sendable {
  case previousSong
  case restartSong
}

/// The back rule, from the position the playing app really reports at the
/// click. A position reads as the whole seconds shown on the island, so
/// anything that shows as `0:03` (3.0 up to, not including, 4.0) is "at 0:03".
public func backAction(atPosition position: TimeInterval) -> BackAction {
  guard position.isFinite else { return .previousSong }
  return position.rounded(.down) <= 3 ? .previousSong : .restartSong
}

/// Back from a position read that can fail: a failed read is read once more,
/// and if the position is still unknown nothing is sent (D124: no guessing).
public func backAction(reading read: () -> TimeInterval?) -> BackAction? {
  guard let position = read() ?? read() else { return nil }
  return backAction(atPosition: position)
}

/// A playback time as the island shows it: `1:40`, `0:03`, `1:12:05`.
public func formatPlaybackTime(_ seconds: TimeInterval) -> String {
  let total = seconds.isFinite ? max(0, Int(seconds.rounded(.down))) : 0
  let hours = total / 3600
  let minutes = (total % 3600) / 60
  let secs = total % 60
  if hours > 0 {
    return String(format: "%d:%02d:%02d", hours, minutes, secs)
  }
  return String(format: "%d:%02d", minutes, secs)
}
