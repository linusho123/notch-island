import Foundation
import Testing

@testable import IslandCore

/// Tests for the 140-character note capping rule (D62, D104, D123).
struct NoteCapTests {

  @Test("A new note of 1, 139, 140, 141, and 2000 characters (D62, D104)")
  func newNoteLengthCap() {
    let s1 = String(repeating: "a", count: 1)
    #expect(NoteCap.capped(s1) == s1)
    #expect(NoteCap.capped(s1).count == 1)

    let s139 = String(repeating: "b", count: 139)
    #expect(NoteCap.capped(s139) == s139)
    #expect(NoteCap.capped(s139).count == 139)

    let s140 = String(repeating: "c", count: 140)
    #expect(NoteCap.capped(s140) == s140)
    #expect(NoteCap.capped(s140).count == 140)

    let s141 = String(repeating: "d", count: 141)
    let capped141 = NoteCap.capped(s141)
    #expect(capped141.count == 140)
    #expect(capped141 == String(repeating: "d", count: 140))

    let s2000 = String(repeating: "e", count: 2000)
    let capped2000 = NoteCap.capped(s2000)
    #expect(capped2000.count == 140)
    #expect(capped2000 == String(repeating: "e", count: 140))
  }

  @Test("Typing into a note of 130 characters: +1, +10, +11, +500 (D123)")
  func typingInto130CharacterNote() {
    let base = String(repeating: "x", count: 130)

    // + 1 character
    let plus1 = NoteCap.apply(current: base, appending: "y")
    #expect(plus1.count == 131)
    #expect(plus1 == base + "y")

    // + 10 characters
    let add10 = String(repeating: "z", count: 10)
    let plus10 = NoteCap.apply(current: base, appending: add10)
    #expect(plus10.count == 140)
    #expect(plus10 == base + add10)

    // + 11 characters -> stops at 140 (only first 10 added)
    let add11 = String(repeating: "w", count: 11)
    let plus11 = NoteCap.apply(current: base, appending: add11)
    #expect(plus11.count == 140)
    #expect(plus11 == base + String(repeating: "w", count: 10))

    // + 500 characters -> stops at 140 (only first 10 added)
    let add500 = String(repeating: "v", count: 500)
    let plus500 = NoteCap.apply(current: base, appending: add500)
    #expect(plus500.count == 140)
    #expect(plus500 == base + String(repeating: "v", count: 10))
  }

  @Test(
    "A paste into the middle of a note preserves both ends and never cuts kept text (D62, D104)")
  func pasteIntoMiddleOfNote() {
    let prefix = "start: "  // 7 chars
    let suffix = " :end"  // 5 chars
    let current = prefix + suffix  // 12 chars
    let middleIndex = current.index(current.startIndex, offsetBy: 7)
    let insertionRange = middleIndex..<middleIndex

    // Paste 200 characters into the middle: room is 140 - 12 = 128 characters
    let pasteText = String(repeating: "M", count: 200)
    let result = NoteCap.apply(current: current, inserting: pasteText, replacing: insertionRange)

    #expect(result.count == 140)
    #expect(result.hasPrefix("start: "))
    #expect(result.hasSuffix(" :end"))
    let middlePart = result.dropFirst(7).dropLast(5)
    #expect(middlePart.count == 128)
    #expect(middlePart == String(repeating: "M", count: 128))
  }

  @Test("Replacing a selection in the middle of a note with a long paste (D62)")
  func replacingSelectionInMiddleOfNote() {
    let prefix = "prefix-"  // 7 chars
    let middle = "REPLACE_ME"  // 10 chars
    let suffix = "-suffix"  // 7 chars
    let current = prefix + middle + suffix  // 24 chars
    let startIdx = current.index(current.startIndex, offsetBy: 7)
    let endIdx = current.index(startIdx, offsetBy: 10)
    let selectionRange = startIdx..<endIdx

    // Kept text: prefix (7) + suffix (7) = 14 chars. Room for replacement = 126 chars.
    let replacement = String(repeating: "R", count: 300)
    let result = NoteCap.apply(current: current, inserting: replacement, replacing: selectionRange)

    #expect(result.count == 140)
    #expect(result.hasPrefix("prefix-"))
    #expect(result.hasSuffix("-suffix"))
    let middlePart = result.dropFirst(7).dropLast(7)
    #expect(middlePart.count == 126)
    #expect(middlePart == String(repeating: "R", count: 126))
  }

  @Test(
    "Multi-codepoint characters (emoji, combining marks) counted as visionary sees them, never split (D62)"
  )
  func multiCodepointCharacters() {
    // 👨‍👩‍👧‍👦 is a family emoji consisting of 7 unicode scalars and 11 UTF-16 code units, but 1 Character
    let familyEmoji = "👨‍👩‍👧‍👦"
    #expect(familyEmoji.count == 1)

    // 139 standard characters + 1 family emoji = 140 characters
    let text139 = String(repeating: "a", count: 139)
    let noteWithEmoji = NoteCap.apply(current: text139, appending: familyEmoji)
    #expect(noteWithEmoji.count == 140)
    #expect(noteWithEmoji.hasSuffix(familyEmoji))

    // Trying to add another emoji when already at 140 refuses it completely
    let refusedEmoji = NoteCap.apply(current: noteWithEmoji, appending: "🎉")
    #expect(refusedEmoji.count == 140)
    #expect(refusedEmoji == noteWithEmoji)

    // Combining acute accent: e + combining acute accent (\u{0301}) = 1 Character ("é")
    let combiningE = "e\u{0301}"
    #expect(combiningE.count == 1)
    let noteWithCombining = NoteCap.apply(current: text139, appending: combiningE)
    #expect(noteWithCombining.count == 140)
    #expect(noteWithCombining.hasSuffix(combiningE))

    // Skin-tone emoji: 👍🏽 is 2 unicode scalars, 1 Character
    let thumbSkin = "👍🏽"
    #expect(thumbSkin.count == 1)

    // Flag emoji: 🇺🇸 is 2 regional indicator scalars, 1 Character
    let flag = "🇺🇸"
    #expect(flag.count == 1)

    // A note of 138 characters + 1 thumb + 1 flag = 140 characters
    let text138 = String(repeating: "x", count: 138)
    let mixed = NoteCap.apply(current: text138, appending: thumbSkin + flag + "EXTRA")
    #expect(mixed.count == 140)
    #expect(mixed == text138 + thumbSkin + flag)
  }

  @Test("NoteCap.allowedInsertion computes exact insertable text preserving prefix and suffix (M4)")
  func allowedInsertionPreservesPrefixAndSuffix() {
    let current = "START_TEXT:[MIDDLE]:END_TEXT"
    guard let startRange = current.range(of: "[MIDDLE]") else {
      #expect(Bool(false), "failed to find middle range")
      return
    }
    // Kept characters: "START_TEXT:" (11) + ":END_TEXT" (9) = 20 characters
    // Room = 140 - 20 = 120 characters
    let longInsert = String(repeating: "Z", count: 200)
    let allowed = NoteCap.allowedInsertion(
      current: current, inserting: longInsert, replacing: startRange)
    #expect(allowed.count == 120)
    #expect(allowed == String(repeating: "Z", count: 120))

    let fullResult = NoteCap.apply(current: current, inserting: longInsert, replacing: startRange)
    #expect(fullResult.count == 140)
    #expect(fullResult.hasPrefix("START_TEXT:"))
    #expect(fullResult.hasSuffix(":END_TEXT"))
    #expect(fullResult == "START_TEXT:" + String(repeating: "Z", count: 120) + ":END_TEXT")

    // Multi-codepoint emoji in middle replacement
    let emojiInsert = "🎉🎊🎈" + String(repeating: "Q", count: 200)
    let allowedEmoji = NoteCap.allowedInsertion(
      current: current, inserting: emojiInsert, replacing: startRange)
    #expect(allowedEmoji.count == 120)
    #expect(allowedEmoji.hasPrefix("🎉🎊🎈"))
  }

  @Test("A paste replaces only the selection, in the editor's UTF-16 range (P12)")
  func pasteReplacesOnlySelection() throws {
    let current = "abcdef"
    // Caret in the middle: nothing is replaced, the paste is inserted there.
    let caret = try #require(
      NoteCap.pasteEdit(current: current, pasting: "XY", selection: NSRange(location: 3, length: 0))
    )
    #expect(caret.range == NSRange(location: 3, length: 0))
    #expect(
      (current as NSString).replacingCharacters(in: caret.range, with: caret.text) == "abcXYdef")
    // A selection in the middle: only the selection is replaced; the tail stays.
    let sel = try #require(
      NoteCap.pasteEdit(current: current, pasting: "XY", selection: NSRange(location: 2, length: 2))
    )
    #expect(sel.range == NSRange(location: 2, length: 2))
    #expect((current as NSString).replacingCharacters(in: sel.range, with: sel.text) == "abXYef")
    // The cap counts the kept tail: 130 kept + 10 room.
    let long = String(repeating: "k", count: 130)
    let capped = try #require(
      NoteCap.pasteEdit(
        current: long, pasting: String(repeating: "p", count: 50),
        selection: NSRange(location: 60, length: 0)))
    #expect(capped.text == String(repeating: "p", count: 10))
    // An emoji before the caret shifts UTF-16 offsets: the range stays the selection.
    let emoji = "😀ab"
    let e = try #require(
      NoteCap.pasteEdit(current: emoji, pasting: "Z", selection: NSRange(location: 2, length: 1)))
    #expect((emoji as NSString).replacingCharacters(in: e.range, with: e.text) == "😀Zb")
    // Invalid selection: no edit.
    #expect(
      NoteCap.pasteEdit(current: "ab", pasting: "Z", selection: NSRange(location: 9, length: 1))
        == nil)
  }
}
