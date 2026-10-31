import Foundation

/// Play on Apple Music's last song after Music quit (D31, D117): the song is
/// started again in its own playlist, where a streamed song lives (it is in
/// no library), else in the library. Music, once started by the first try,
/// takes a play without playing while it loads, so the app tries again, one
/// short try at a time: Music's own reports are read between tries, and a
/// newer play takes over from an older one.
public enum MusicReopen {
  /// Tries a quarter second apart: ten seconds at most.
  public static let tries = 40
  public static let tryGap: TimeInterval = 0.25

  /// What one try found.
  public enum Try: String, Equatable, Sendable {
    /// The song plays.
    case mine
    /// Something else plays: the visionary started it, so nothing is touched.
    case other
    /// Nothing plays yet.
    case waiting
  }

  public enum Step: Equatable, Sendable {
    case tryAgain
    case holdPosition
    case done
  }

  /// After a try (nil when the script failed, as while Music starts).
  public static func next(after result: Try?, triesLeft: Int, position: TimeInterval?) -> Step {
    switch result {
    case .mine: return (position ?? 0) > 0 ? .holdPosition : .done
    case .other: return .done
    case .waiting, nil: return triesLeft > 1 ? .tryAgain : .done
    }
  }

  /// One try, for `tell application "Music"`; nil when the track id is not
  /// Music's own (a persistent ID is hex), so nothing else reaches the script.
  public static func attemptScript(trackID: String?, collectionID: String?) -> String? {
    guard let trackID, isMusicID(trackID) else { return nil }
    let library = "play (first track of library playlist 1 whose persistent ID is \"\(trackID)\")"
    let play: String
    if let collectionID, isMusicID(collectionID) {
      play = """
        try
          play (first track of (first playlist whose persistent ID is "\(collectionID)") whose persistent ID is "\(trackID)")
        on error
          try
            \(library)
          end try
        end try
        """
    } else {
      play = """
        try
          \(library)
        end try
        """
    }
    let answer = """
      if player state is playing then
        if persistent ID of current track is "\(trackID)" then return "mine"
        return "other"
      end if
      """
    return """
      \(answer)
      \(play)
      delay \(tryGap)
      \(answer)
      return "waiting"
      """
  }

  /// Once the song plays: a play still on its way may start it over, so the
  /// position is set until it holds on two reads in a row, and never on
  /// another song.
  public static func holdScript(trackID: String?, position: TimeInterval) -> String? {
    guard let trackID, isMusicID(trackID), position.isFinite, position > 0 else { return nil }
    let seek = String(format: "%.3f", position)
    return """
      set held to 0
      repeat 12 times
        if persistent ID of current track is not "\(trackID)" then exit repeat
        if player position < \(seek) - 1 then
          set player position to \(seek)
          set held to 0
        else
          set held to held + 1
          if held is 2 then exit repeat
        end if
        delay 0.3
      end repeat
      """
  }

  static func isMusicID(_ id: String) -> Bool {
    !id.isEmpty && id.allSatisfy(\.isHexDigit)
  }
}
