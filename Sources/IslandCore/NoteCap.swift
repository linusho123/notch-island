import Foundation

/// Enforces the 140-character cap on notes and reminders (D62, D104, D123).
///
/// Text is the visionary's data: never silently lost. The cap stops typing
/// and refuses the rest of a paste. It never truncates text that was already
/// kept. Multi-codepoint characters (emoji, combining marks) are counted as
/// extended grapheme clusters as the visionary sees them, never split.
public enum NoteCap {
  /// The maximum allowed length of a note in user-perceived characters (D62).
  public static let maximumLength = 140

  /// Applies the 140-character cap when inserting `inserted` into `current`
  /// replacing the grapheme range `range`. If `range` is nil, `inserted`
  /// replaces the entire `current` string.
  ///
  /// Text outside `range` is already kept and is never cut. Only as many
  /// characters from `inserted` as fit within the remaining room up to 140
  /// are taken; the rest of `inserted` is refused.
  public static func apply(
    current: String,
    inserting inserted: String,
    replacing range: Range<String.Index>? = nil
  ) -> String {
    let targetRange = range ?? (current.startIndex..<current.endIndex)
    let prefix = current[..<targetRange.lowerBound]
    let suffix = current[targetRange.upperBound...]
    let taken = allowedInsertion(current: current, inserting: inserted, replacing: targetRange)
    return String(prefix) + taken + String(suffix)
  }

  /// Returns only the portion of `inserted` that can be inserted into `current`
  /// replacing `range` without exceeding `maximumLength`.
  public static func allowedInsertion(
    current: String,
    inserting inserted: String,
    replacing range: Range<String.Index>? = nil
  ) -> String {
    let targetRange = range ?? (current.startIndex..<current.endIndex)
    let prefix = current[..<targetRange.lowerBound]
    let suffix = current[targetRange.upperBound...]
    let keptCount = prefix.count + suffix.count
    let room = max(0, maximumLength - keptCount)
    return String(inserted.prefix(room))
  }

  /// Applies the 140-character cap when typing or appending at the end of `current`.
  public static func apply(current: String, appending appended: String) -> String {
    apply(current: current, inserting: appended, replacing: current.endIndex..<current.endIndex)
  }

  /// Applies the 140-character cap to new text from scratch.
  public static func capped(_ text: String) -> String {
    apply(current: "", inserting: text)
  }
}
