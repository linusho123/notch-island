/// The acceptance harness's input guard (BUILD-PLAN, Sharing the Mac): while
/// a UI run goes, any keyboard or trackpad input the harness did not make
/// itself stops the run. The harness tags every event it posts with `tag` in
/// the event's source user data (`CGEventField.eventSourceUserData`); real
/// input from the keyboard and trackpad arrives without it.
public enum InputGuard {
  /// The harness's mark on its own events ("NOTCHIS" in ASCII).
  public static let tag: Int64 = 0x4E4F_5443_4849_53

  public enum Origin: Equatable, Sendable {
    /// An event the harness posted itself.
    case harness
    /// Keyboard, pointer or trackpad input the harness did not make.
    case real
    /// Not input at all (a tap notice, the null event, a system notice).
    case notInput
  }

  /// Keyboard (keys, modifiers), pointer (buttons, moves, drags), scroll,
  /// tablet and trackpad gesture event types, as CGEventType raw values.
  static let inputTypes: Set<UInt32> = [
    1, 2, 3, 4, 5, 6, 7,  // left/right down and up, moved, dragged
    10, 11, 12,  // key down, key up, modifiers changed
    22, 23, 24,  // scroll wheel, tablet pointer, tablet proximity
    25, 26, 27,  // other button down, up, dragged
    18, 19, 20, 29, 30, 31, 32, 33, 34, 37,  // trackpad gestures, pressure, touches
  ]

  /// The system-defined event type, and its subtypes that are input: 7 an
  /// extra mouse button, 8 a media or special key.
  static let systemDefined: UInt32 = 14
  static let systemDefinedInputSubtypes: Set<Int> = [7, 8]

  /// Where an event seen by the guard's tap came from.
  public static func origin(type: UInt32, userData: Int64, subtype: Int?) -> Origin {
    let isInput: Bool
    if type == systemDefined {
      isInput = subtype.map { systemDefinedInputSubtypes.contains($0) } ?? false
    } else {
      isInput = inputTypes.contains(type)
    }
    guard isInput else { return .notInput }
    return userData == tag ? .harness : .real
  }

  /// How much shorter than the harness's own quiet the idle clock must read
  /// before it counts as input: an event the harness posted just before the
  /// tap saw it, and the clock's own polling, stay inside it.
  public static let idleSlackMs: Double = 300

  /// The second signal, for input no event tap sees (keys typed into a
  /// password field): the system's HIDIdleTime counts from the last input of
  /// any kind. Whether or not the harness's events reset it, it is never
  /// clearly shorter than the time since the harness's last event unless
  /// someone else made input.
  public static func idleShowsRealInput(hidIdleMs: Double, msSinceHarnessEvent: Double) -> Bool {
    hidIdleMs + idleSlackMs < msSinceHarnessEvent
  }

  /// The file the harness stamps each event's time into just before it posts
  /// it (milliseconds since 1970), named by the waiter for the run.
  public static let postStampVariable = "NOTCH_ISLAND_POST_STAMP"

  /// The quiet since the harness's last event: from the later of the last
  /// one the tap saw and the last one the harness stamped as posted. An event
  /// can reset the idle clock and reach the tap late (a busy Mac) or not at
  /// all (a fresh process's first event is sometimes dropped).
  public static func msSinceHarnessEvent(now: Double, lastSeenMs: Double, lastPostedMs: Double?)
    -> Double
  {
    now - max(lastSeenMs, lastPostedMs ?? lastSeenMs)
  }
}
