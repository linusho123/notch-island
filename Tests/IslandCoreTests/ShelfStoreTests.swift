import Foundation
import Testing

@testable import IslandCore

/// A test clock that can be advanced explicitly without real-time delays.
final class TestClock: @unchecked Sendable {
  var now: Date

  init(_ now: Date = Date()) {
    self.now = now
  }

  func advance(by seconds: TimeInterval) {
    now = now.addingTimeInterval(seconds)
  }
}

/// The shelf store: bookmark pointers, ageing clocks, capture stacks,
/// restart survival, and file integrity (D36, D57, D58, D59, D65, D66, D92, D102, D106, D116, D118).
struct ShelfStoreTests {

  // MARK: - Helper to build scratch sandbox for test isolation

  private func makeScratchDirectory() throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private func createTempFile(in dir: URL, named name: String, content: String = "test-content")
    throws -> URL
  {
    let file = dir.appendingPathComponent(name)
    try content.write(to: file, atomically: true, encoding: .utf8)
    return file
  }

  // MARK: - Rule 1: File item follows moves and leaves when trashed or deleted (D36, D58, D106)

  @Test func aFileItemFollowsItsFileWhenItMovesD36D58() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let docFolder = dir.appendingPathComponent("Documents", isDirectory: true)
    let archiveFolder = dir.appendingPathComponent("Archive", isDirectory: true)
    try FileManager.default.createDirectory(at: docFolder, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: archiveFolder, withIntermediateDirectories: true)

    let file = try createTempFile(in: docFolder, named: "tax-return.pdf", content: "tax data 2026")
    try store.parkFile(at: file)

    #expect(store.count == 1)
    #expect(store.items()[0].title == "tax-return.pdf")

    // Move file to Archive
    let movedFile = archiveFolder.appendingPathComponent("tax-return.pdf")
    try FileManager.default.moveItem(at: file, to: movedFile)

    // Store resolves bookmark to the new place
    let items = store.items()
    #expect(items.count == 1)
    #expect(items[0].title == "tax-return.pdf")
    #expect(
      items[0].urls.first?.standardizedFileURL.resolvingSymlinksInPath()
        == movedFile.standardizedFileURL.resolvingSymlinksInPath())
  }

  @Test func aFolderItemFollowsItsFolderWhenItMovesD58D65() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let folder = dir.appendingPathComponent("Taxes 2026", isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    _ = try createTempFile(in: folder, named: "w2.pdf", content: "w2")

    try store.parkFile(at: folder)
    #expect(store.count == 1)
    #expect(store.items()[0].isFolder)
    #expect(store.items()[0].title == "Taxes 2026")

    let archive = dir.appendingPathComponent("Archive", isDirectory: true)
    try FileManager.default.createDirectory(at: archive, withIntermediateDirectories: true)
    let movedFolder = archive.appendingPathComponent("Taxes 2026", isDirectory: true)
    try FileManager.default.moveItem(at: folder, to: movedFolder)

    let items = store.items()
    #expect(items.count == 1)
    #expect(items[0].isFolder)
    #expect(
      items[0].urls.first?.standardizedFileURL.resolvingSymlinksInPath()
        == movedFolder.standardizedFileURL.resolvingSymlinksInPath())
  }

  @Test func aParkedFileLeavesTheShelfWhenMovedToTheTrashD58D106() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let file = try createTempFile(in: dir, named: "tax-return.pdf", content: "tax data")
    try store.parkFile(at: file)
    #expect(store.count == 1)

    // Move to Trash
    var trashedURL: NSURL?
    try FileManager.default.trashItem(at: file, resultingItemURL: &trashedURL)

    defer {
      if let t = trashedURL as URL? {
        try? FileManager.default.removeItem(at: t)
      }
    }

    #expect(store.items().isEmpty)
    #expect(store.count == 0)
  }

  @Test func isInTrashRecognizesVolumeTrashes() {
    let volumeTrashFile = URL(fileURLWithPath: "/Volumes/External/.Trashes/501/tax-return.pdf")
    #expect(FilePointer.isInTrash(volumeTrashFile))
  }

  @Test func aParkedFileLeavesTheShelfWhenDeletedD36D58D106() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let file = try createTempFile(in: dir, named: "tax-return.pdf", content: "tax data")
    try store.parkFile(at: file)
    #expect(store.count == 1)

    try FileManager.default.removeItem(at: file)

    #expect(store.items().isEmpty)
    #expect(store.count == 0)
  }

  // MARK: - Rule 2: 24-hour ageing clock (D57, D65)

  @Test func aParkedScreenshotAgesOffAfterTwentyFourHoursD57() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")

    // Landed at 11:58 pm (23:58:00) on Day 0
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    let screenshot = try createTempFile(
      in: dir, named: "Screenshot 2026-10-18 at 23.58.00.png", content: "image-bytes")
    try store.parkCapture(at: screenshot, landedAt: t0)
    #expect(store.count == 1)

    // 12:01 am next morning (3 minutes = 180 seconds later): still on shelf
    clock.advance(by: 180)
    #expect(store.count == 1)

    // 11:57 pm next night (23 hours 59 minutes = 86340 seconds later from t0): still on shelf
    clock.now = t0.addingTimeInterval(86340)
    #expect(store.count == 1)

    // 11:59 pm next night (24 hours 1 minute = 86460 seconds later from t0): gone from shelf
    clock.now = t0.addingTimeInterval(86460)
    #expect(store.count == 0)

    // Original file still exists on disk unchanged
    #expect(FileManager.default.fileExists(atPath: screenshot.path))
    let bytes = try String(contentsOf: screenshot, encoding: .utf8)
    #expect(bytes == "image-bytes")
  }

  @Test func aParkedFileAgesOffAfterTwentyFourHoursD57() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")

    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    let file = try createTempFile(in: dir, named: "tax-return.pdf", content: "pdf-bytes")
    try store.parkFile(at: file, landedAt: t0)
    #expect(store.count == 1)

    // 23 hours 59 minutes later: still on shelf
    clock.now = t0.addingTimeInterval(86340)
    #expect(store.count == 1)

    // 24 hours later: gone from shelf
    clock.now = t0.addingTimeInterval(86400)
    #expect(store.count == 0)

    #expect(FileManager.default.fileExists(atPath: file.path))
  }

  @Test func aParkedLinkNeverAgesOffTheShelfD65() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")

    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    let linkURL = URL(string: "https://gov.uk/renew-adult-passport")!
    store.parkLink(linkURL, landedAt: t0)
    #expect(store.count == 1)
    #expect(store.items()[0].title == "gov.uk/renew-adult-passport")

    // 7 days later: still on shelf
    clock.advance(by: 7 * 86400)
    #expect(store.count == 1)

    // 30 days later: still on shelf
    clock.advance(by: 23 * 86400)
    #expect(store.count == 1)
  }

  @Test func notesAndRemindersNeverAgeOffTheShelfD57D59() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")

    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    store.addNote(text: "idea: notch app shows lyrics", landedAt: t0)
    store.addNote(text: "renew passport", isReminder: true, landedAt: t0)
    #expect(store.count == 2)

    // 30 days later: still on shelf
    clock.advance(by: 30 * 86400)
    #expect(store.count == 2)
  }

  // MARK: - Rule 3: Restart survival (D59)

  @Test func afterARestartTheWholeShelfComesBackWithOriginalLandingTimesD59() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")

    // 9:00 am Day 0
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)

    let store1 = ShelfStore(file: storeFile, clock: { clock.now })

    store1.addNote(text: "Note 1", landedAt: t0)
    store1.addNote(text: "Note 2", landedAt: t0)
    store1.addNote(text: "Note 3", landedAt: t0)
    store1.addNote(text: "Reminder 1", isReminder: true, landedAt: t0)

    let file1 = try createTempFile(in: dir, named: "tax-return.pdf", content: "tax")
    let file2 = try createTempFile(in: dir, named: "boarding-pass.pdf", content: "flight")
    try store1.parkFile(at: file1, landedAt: t0)
    try store1.parkFile(at: file2, landedAt: t0)

    #expect(store1.count == 6)

    // 2:00 pm restart (5 hours = 18000 seconds later)
    clock.advance(by: 18000)

    // Fresh store instance loads from disk
    let store2 = ShelfStore(file: storeFile, clock: { clock.now })
    let reloadedItems = store2.items()
    #expect(reloadedItems.count == 6)

    let taxItem = reloadedItems.first(where: { $0.title == "tax-return.pdf" })
    #expect(taxItem != nil)
    #expect(taxItem?.landedAt == t0)

    // 9:00 am next day (24 hours after original park): files age out, notes & reminders remain
    clock.now = t0.addingTimeInterval(86400)
    let nextDayItems = store2.items()
    #expect(nextDayItems.count == 4)  // 3 notes + 1 reminder
    #expect(!nextDayItems.contains(where: { $0.title == "tax-return.pdf" }))
  }

  @Test func aFileMovedWhileAppWasQuitResolvesOnReloadD58D59() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")

    let store1 = ShelfStore(file: storeFile)
    let file = try createTempFile(in: dir, named: "doc.txt", content: "data")
    try store1.parkFile(at: file)

    // App is quit; file moves on disk
    let movedFile = dir.appendingPathComponent("new-doc.txt")
    try FileManager.default.moveItem(at: file, to: movedFile)

    // Relaunch app
    let store2 = ShelfStore(file: storeFile)
    let items = store2.items()
    #expect(items.count == 1)
    #expect(
      items[0].urls.first?.standardizedFileURL.resolvingSymlinksInPath()
        == movedFile.standardizedFileURL.resolvingSymlinksInPath())
  }

  @Test func aFileTrashedWhileAppWasQuitLeavesTheShelfOnReloadD58D106() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")

    let store1 = ShelfStore(file: storeFile)
    let file = try createTempFile(in: dir, named: "doc.txt", content: "data")
    try store1.parkFile(at: file)

    // App is quit; file moved to trash
    var trashedURL: NSURL?
    try FileManager.default.trashItem(at: file, resultingItemURL: &trashedURL)
    defer {
      if let t = trashedURL as URL? {
        try? FileManager.default.removeItem(at: t)
      }
    }

    // Relaunch app
    let store2 = ShelfStore(file: storeFile)
    #expect(store2.items().isEmpty)
  }

  // MARK: - Rule 4: The store never moves, copies or deletes a pointed-at file (D36, D66)

  @Test func theStoreNeverMovesCopiesOrDeletesAPointedAtFileD36() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let originalContent = "Exact byte-for-byte original file contents 1234567890!@#$%"
    let file = try createTempFile(in: dir, named: "original.pdf", content: originalContent)
    let originalPath = file.path

    try store.parkFile(at: file)

    // Query items, reload, save
    _ = store.items()
    store.reload()
    _ = store.items()

    // Verify file is unchanged byte for byte and path for path
    #expect(FileManager.default.fileExists(atPath: originalPath))
    let contentAfterQuery = try String(contentsOf: file, encoding: .utf8)
    #expect(contentAfterQuery == originalContent)

    // Removing item from shelf does not delete the file
    let id = try #require(store.items().first?.id)
    store.remove(id: id)
    #expect(store.isEmpty)

    #expect(FileManager.default.fileExists(atPath: originalPath))
    let contentAfterRemoval = try String(contentsOf: file, encoding: .utf8)
    #expect(contentAfterRemoval == originalContent)
  }

  @Test func removingAStackLeavesAllCapturesOnDiskD66() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let t0 = Date()
    let s1 = try createTempFile(in: dir, named: "s1.png", content: "s1")
    let s2 = try createTempFile(in: dir, named: "s2.png", content: "s2")
    let s3 = try createTempFile(in: dir, named: "s3.png", content: "s3")
    let r1 = try createTempFile(in: dir, named: "r1.mov", content: "r1")

    try store.parkCapture(at: s1, landedAt: t0)
    try store.parkCapture(at: s2, landedAt: t0.addingTimeInterval(5))
    try store.parkCapture(at: s3, landedAt: t0.addingTimeInterval(10))
    try store.parkCapture(at: r1, landedAt: t0.addingTimeInterval(15))

    #expect(store.count == 1)
    let stackItem = store.items()[0]
    #expect(stackItem.title == "3 screenshots, 1 recording")

    // Remove the stack
    store.remove(id: stackItem.id)
    #expect(store.isEmpty)

    // All original files are still on disk
    #expect(FileManager.default.fileExists(atPath: s1.path))
    #expect(FileManager.default.fileExists(atPath: s2.path))
    #expect(FileManager.default.fileExists(atPath: s3.path))
    #expect(FileManager.default.fileExists(atPath: r1.path))
  }

  // MARK: - Rule 5: Stacks, 60s rule, labels, and operations (D118, D65, D92, D102, D103, D116)

  @Test func capturesWithinSixtySecondsJoinAStackD118() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    let s1 = try createTempFile(in: dir, named: "s1.png")
    let s2 = try createTempFile(in: dir, named: "s2.png")
    let s3 = try createTempFile(in: dir, named: "s3.png")

    // First screenshot
    try store.parkCapture(at: s1, landedAt: t0)
    #expect(store.count == 1)
    #expect(!store.items()[0].isStack)

    // 10s gap: joins stack
    clock.advance(by: 10)
    try store.parkCapture(at: s2, landedAt: clock.now)
    #expect(store.count == 1)
    #expect(store.items()[0].isStack)
    #expect(store.items()[0].title == "2 screenshots")

    // 60s gap from last capture: joins stack
    clock.advance(by: 60)
    try store.parkCapture(at: s3, landedAt: clock.now)
    #expect(store.count == 1)
    #expect(store.items()[0].title == "3 screenshots")
  }

  @Test func capturesWithinSixtySecondsJoinStackEvenWithInterveningFileD118() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    let s1 = try createTempFile(in: dir, named: "s1.png")
    let f1 = try createTempFile(in: dir, named: "doc.pdf")
    let s2 = try createTempFile(in: dir, named: "s2.png")

    // First screenshot
    try store.parkCapture(at: s1, landedAt: t0)
    #expect(store.count == 1)

    // Intervening file parked 10s later
    clock.advance(by: 10)
    try store.parkFile(at: f1, landedAt: clock.now)
    #expect(store.count == 2)

    // Second screenshot parked 45s after the first screenshot (35s after file, gap <= 60s from s1)
    clock.advance(by: 35)
    try store.parkCapture(at: s2, landedAt: clock.now)

    let items = store.items()
    #expect(items.count == 2)
    let stacks = items.filter { $0.isStack }
    #expect(stacks.count == 1)
    #expect(stacks[0].title == "2 screenshots")
  }

  @Test func aCaptureSixtyOneSecondsAfterThePreviousStartsANewItemD118() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    let s1 = try createTempFile(in: dir, named: "s1.png")
    let s2 = try createTempFile(in: dir, named: "s2.png")

    try store.parkCapture(at: s1, landedAt: t0)
    // 61s gap: starts a new item
    clock.advance(by: 61)
    try store.parkCapture(at: s2, landedAt: clock.now)

    #expect(store.count == 2)
    #expect(store.items()[0].title == "s1.png")
    #expect(store.items()[1].title == "s2.png")
  }

  @Test func mixedScreenshotAndRecordingStackLabelsD118() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    let s1 = try createTempFile(in: dir, named: "s1.png")
    let r1 = try createTempFile(in: dir, named: "r1.mov")

    try store.parkCapture(at: s1, landedAt: t0)
    // Screen recording 30s later: joins stack
    clock.advance(by: 30)
    try store.parkCapture(at: r1, landedAt: clock.now)

    #expect(store.count == 1)
    #expect(store.items()[0].title == "1 screenshot, 1 recording")

    // Another recording 61s after r1: starts new item
    clock.advance(by: 61)
    let r2 = try createTempFile(in: dir, named: "r2.mov")
    try store.parkCapture(at: r2, landedAt: clock.now)

    #expect(store.count == 2)
    #expect(store.items()[0].title == "1 screenshot, 1 recording")
    #expect(store.items()[1].title == "r2.mov")
  }

  @Test func thirtyScreenshotsInARowAndAThirtyFirstHaveNoMaximumD118() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    for i in 1...30 {
      let file = try createTempFile(in: dir, named: "shot\(i).png")
      try store.parkCapture(at: file, landedAt: clock.now)
      clock.advance(by: 2)
    }

    #expect(store.count == 1)
    #expect(store.items()[0].title == "30 screenshots")

    // 31st screenshot
    let file31 = try createTempFile(in: dir, named: "shot31.png")
    try store.parkCapture(at: file31, landedAt: clock.now)

    #expect(store.count == 1)
    #expect(store.items()[0].title == "31 screenshots")
  }

  @Test func aStackDragsOutAsOneGroupD118() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let t0 = Date()
    let s1 = try createTempFile(in: dir, named: "s1.png")
    let s2 = try createTempFile(in: dir, named: "s2.png")
    let s3 = try createTempFile(in: dir, named: "s3.png")
    let r1 = try createTempFile(in: dir, named: "r1.mov")

    try store.parkCapture(at: s1, landedAt: t0)
    try store.parkCapture(at: s2, landedAt: t0.addingTimeInterval(2))
    try store.parkCapture(at: s3, landedAt: t0.addingTimeInterval(4))
    try store.parkCapture(at: r1, landedAt: t0.addingTimeInterval(6))

    let stack = store.items()[0]
    #expect(stack.urls.count == 4)
  }

  @Test func aStackExpandsIntoItsIndividualCapturesD118() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    let s1 = try createTempFile(in: dir, named: "s1.png")
    let s2 = try createTempFile(in: dir, named: "s2.png")
    let s3 = try createTempFile(in: dir, named: "s3.png")
    let r1 = try createTempFile(in: dir, named: "r1.mov")

    try store.parkCapture(at: s1, landedAt: t0)
    clock.advance(by: 5)
    try store.parkCapture(at: s2, landedAt: clock.now)
    clock.advance(by: 5)
    try store.parkCapture(at: s3, landedAt: clock.now)
    clock.advance(by: 5)
    try store.parkCapture(at: r1, landedAt: clock.now)

    let stackId = store.items()[0].id
    let expanded = store.expandStack(id: stackId)
    #expect(expanded)

    let items = store.items()
    #expect(items.count == 4)
    #expect(items[0].title == "s1.png")
    #expect(items[1].title == "s2.png")
    #expect(items[2].title == "s3.png")
    #expect(items[3].title == "r1.mov")
    #expect(items[3].landedAt == t0.addingTimeInterval(15))
  }

  @Test func droppingMultipleFilesParksAsOneStackD65() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let f1 = try createTempFile(in: dir, named: "f1.pdf")
    let f2 = try createTempFile(in: dir, named: "f2.pdf")
    let f3 = try createTempFile(in: dir, named: "f3.pdf")

    let stackItem = try store.parkFiles(at: [f1, f2, f3])
    #expect(stackItem != nil)
    #expect(store.count == 1)
    #expect(store.items()[0].isStack)
    #expect(store.items()[0].urls.count == 3)
  }

  @Test func droppedHighlightedTextIsRefusedD65D102() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let f = try createTempFile(in: dir, named: "tax-return.pdf")
    try store.parkFile(at: f)
    #expect(store.count == 1)

    let accepted = store.parkDroppedText("renew passport before May")
    #expect(!accepted)
    #expect(store.count == 1)
    #expect(store.items()[0].title == "tax-return.pdf")
  }

  @Test func acceptedDropRemovesItemRefusedDropLeavesItD92D103D116() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let f = try createTempFile(in: dir, named: "tax-return.pdf")
    try store.parkFile(at: f)
    let link = store.parkLink(URL(string: "https://example.com")!, title: "Example")
    let itemId = store.items()[0].id
    let linkId = link.id

    // Refused drop: file and link stay
    store.itemRefused(id: itemId)
    store.itemRefused(id: linkId)
    #expect(store.count == 2)
    #expect(store.items().contains { $0.id == linkId })

    // Accepted drop removes both
    let removed = store.itemAccepted(id: itemId)
    #expect(removed)
    let removedLink = store.itemAccepted(id: linkId)
    #expect(removedLink)
    #expect(store.isEmpty)

    // Original file still on disk
    #expect(FileManager.default.fileExists(atPath: f.path))
  }

  @Test func stackAgeingShrinksAndSurvivorKeepsItsOwnClockD57D118() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)
    let store = ShelfStore(file: storeFile, clock: { clock.now })

    let s1 = try createTempFile(in: dir, named: "s1.png")
    let s2 = try createTempFile(in: dir, named: "s2.png")
    let s3 = try createTempFile(in: dir, named: "s3.png")

    try store.parkCapture(at: s1, landedAt: t0)
    clock.advance(by: 10)
    let t1 = clock.now
    try store.parkCapture(at: s2, landedAt: t1)
    clock.advance(by: 10)
    let t2 = clock.now
    try store.parkCapture(at: s3, landedAt: t2)

    #expect(store.count == 1)
    #expect(store.items()[0].isStack)
    #expect(store.items()[0].title == "3 screenshots")

    // Advance to 24h after s1: s1 expires, stack shrinks to 2 screenshots (s2, s3)
    clock.now = t0.addingTimeInterval(86400)
    let items = store.items()
    #expect(items.count == 1)
    #expect(items[0].isStack)
    #expect(items[0].title == "2 screenshots")
    // The surviving stack keeps the clock of its oldest survivor (s2)
    #expect(items[0].landedAt == t1)

    // Advance to 24h after s2: s2 expires, stack shrinks to 1 capture (s3)
    clock.now = t1.addingTimeInterval(86400)
    let items2 = store.items()
    #expect(items2.count == 1)
    #expect(!items2[0].isStack)
    #expect(items2[0].title == "s3.png")
    #expect(items2[0].landedAt == t2)

    // At 24h after s3: aged off
    clock.now = t2.addingTimeInterval(86400)
    #expect(store.count == 0)
  }

  @Test func restartPreservesCaptureStackFileStackAndLinkD59() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)

    let store1 = ShelfStore(file: storeFile, clock: { clock.now })
    let s1 = try createTempFile(in: dir, named: "s1.png")
    let s2 = try createTempFile(in: dir, named: "s2.png")
    try store1.parkCapture(at: s1, landedAt: t0)
    try store1.parkCapture(at: s2, landedAt: t0.addingTimeInterval(10))

    let f1 = try createTempFile(in: dir, named: "f1.pdf")
    let f2 = try createTempFile(in: dir, named: "f2.pdf")
    try store1.parkFiles(at: [f1, f2], landedAt: t0.addingTimeInterval(20))

    let linkURL = URL(string: "https://example.com/guide")!
    store1.parkLink(linkURL, title: "Guide", landedAt: t0.addingTimeInterval(30))

    #expect(store1.count == 3)

    // Restart
    clock.advance(by: 3600)
    let store2 = ShelfStore(file: storeFile, clock: { clock.now })
    let items = store2.items()
    #expect(items.count == 3)

    let capStack = items.first(where: {
      if case .captureStack = $0.kind { return true }
      return false
    })
    #expect(capStack != nil)
    #expect(capStack?.landedAt == t0)

    let fileStack = items.first(where: {
      if case .fileStack = $0.kind { return true }
      return false
    })
    #expect(fileStack != nil)
    #expect(fileStack?.landedAt == t0.addingTimeInterval(20))

    let linkItem = items.first(where: {
      if case .link = $0.kind { return true }
      return false
    })
    #expect(linkItem != nil)
    #expect(linkItem?.landedAt == t0.addingTimeInterval(30))
    #expect(linkItem?.title == "Guide")
  }

  @Test func corruptShelfJsonIsPreservedInCorruptFileAndNotOverwrittenD59() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let corruptContent = "{ this is corrupt json data that cannot be decoded as [ShelfItem] }"
    try corruptContent.write(to: storeFile, atomically: true, encoding: .utf8)

    let store = ShelfStore(file: storeFile)
    #expect(store.isEmpty)

    // Park a new file
    let doc = try createTempFile(in: dir, named: "new-doc.pdf", content: "valid")
    try store.parkFile(at: doc)
    #expect(store.count == 1)

    // Verify original corrupt bytes survived in shelf.json.corrupt-*
    let dirContents = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    let corruptFiles = dirContents.filter { $0.hasPrefix("shelf.json.corrupt-") }
    #expect(corruptFiles.count == 1)
    if let corruptFile = corruptFiles.first {
      let savedBytes = try String(
        contentsOf: dir.appendingPathComponent(corruptFile), encoding: .utf8)
      #expect(savedBytes == corruptContent)
    }

    // And shelf.json now exists with only the new item
    #expect(FileManager.default.fileExists(atPath: storeFile.path))
    #expect(store.items()[0].title == "new-doc.pdf")
  }

  @Test("A parked item on an unmounted volume stays and keeps ageing (SF8, M2, Q3)")
  func unmountedVolumeKeepsItemAndAgesD58Q3() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let dummy = try createTempFile(in: dir, named: "external-doc.txt", content: "data")

    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)

    let store = ShelfStore(
      file: storeFile,
      clock: { clock.now },
      fileResolver: { _ in .volumeMissing }
    )

    try store.parkFile(at: dummy)
    // Remove the file to simulate volume / file missing on disk
    try FileManager.default.removeItem(at: dummy)

    // With fake resolver reporting .volumeMissing, item must be KEPT
    let itemsBefore24h = store.items()
    #expect(itemsBefore24h.count == 1)

    // After 24 hours on clock, item ages off (Q3: still ages on 24h clock)
    clock.advance(by: 24 * 3600)
    let itemsAfter24h = store.items()
    #expect(itemsAfter24h.count == 0)
  }

  @Test("Updating a note's text saves correction in place (D63)")
  func updateNoteTextInPlaceD63() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    // Add three items: note 1, note 2, note 3
    let n1 = store.addNote(text: "first note")
    let n2 = store.addNote(text: "idea: notch app shwos lyrics")
    let n3 = store.addNote(text: "third note")

    #expect(store.count == 3)
    #expect(store.items()[1].id == n2.id)

    // Correct note 2 in place
    let updated = store.updateNoteText(id: n2.id, text: "idea: notch app shows lyrics")
    #expect(updated == true)

    let items = store.items()
    #expect(items.count == 3)
    #expect(items[0].id == n1.id)
    #expect(items[1].id == n2.id)
    #expect(items[1].title == "✎ idea: notch app shows lyrics")
    #expect(items[2].id == n3.id)

    // Verify persistence across reload (D59)
    store.reload()
    let reloaded = store.items()
    #expect(reloaded.count == 3)
    #expect(reloaded[1].id == n2.id)
    #expect(reloaded[1].title == "✎ idea: notch app shows lyrics")
  }

  @Test("Emptying a note's text removes the note (D63)")
  func emptyingNoteRemovesItD63() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let n1 = store.addNote(text: "keep me")
    let n2 = store.addNote(text: "idea: notch app shows lyrics")
    #expect(store.count == 2)

    // Empty note 2's text
    let updated = store.updateNoteText(id: n2.id, text: "")
    #expect(updated == true)

    let items = store.items()
    #expect(items.count == 1)
    #expect(items[0].id == n1.id)

    // Verify persistence across reload (D59)
    store.reload()
    #expect(store.count == 1)
    #expect(store.items()[0].id == n1.id)
  }

  @Test("Toggling a note to a reminder and back keeps text and position (D39)")
  func toggleNoteKindKeepsTextAndPositionD39() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let n1 = store.addNote(text: "first note")
    let n2 = store.addNote(text: "idea: notch app shows lyrics")
    let n3 = store.addNote(text: "third note")

    #expect(store.count == 3)
    #expect(store.items()[1].title == "✎ idea: notch app shows lyrics")

    // Toggle note 2 to a reminder
    let toggledToReminder = store.toggleNoteKind(id: n2.id)
    #expect(toggledToReminder == true)

    let items1 = store.items()
    #expect(items1.count == 3)
    #expect(items1[0].id == n1.id)
    #expect(items1[1].id == n2.id)
    // No ✎ prefix for reminders
    #expect(items1[1].title == "idea: notch app shows lyrics")
    #expect(items1[1].noteText == "idea: notch app shows lyrics")
    if case .note(_, let isReminder) = items1[1].kind {
      #expect(isReminder == true)
    } else {
      #expect(Bool(false), "item 1 is not a note")
    }
    #expect(items1[2].id == n3.id)

    // Toggle back to plain note
    let toggledBack = store.toggleNoteKind(id: n2.id)
    #expect(toggledBack == true)

    let items2 = store.items()
    #expect(items2.count == 3)
    #expect(items2[0].id == n1.id)
    #expect(items2[1].id == n2.id)
    #expect(items2[1].title == "✎ idea: notch app shows lyrics")
    #expect(items2[1].noteText == "idea: notch app shows lyrics")
    if case .note(_, let isReminder) = items2[1].kind {
      #expect(isReminder == false)
    } else {
      #expect(Bool(false), "item 1 is not a note")
    }
    #expect(items2[2].id == n3.id)

    // Verify survival across disk reload (D59)
    store.reload()
    let reloaded = store.items()
    #expect(reloaded.count == 3)
    #expect(reloaded[1].id == n2.id)
    #expect(reloaded[1].title == "✎ idea: notch app shows lyrics")
  }

  @Test("Check-off removes only reminders at once (D40)")
  func checkOffRemovesOnlyRemindersD40() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let plain = store.addNote(text: "plain note", isReminder: false)
    let reminder = store.addNote(text: "renew passport", isReminder: true)

    #expect(store.count == 2)

    // Checking off a plain note is refused and removes nothing (D40)
    let checkOffPlain = store.checkOffReminder(id: plain.id)
    #expect(checkOffPlain == false)
    #expect(store.count == 2)

    // Checking off a reminder removes it at once
    let checkOffReminder = store.checkOffReminder(id: reminder.id)
    #expect(checkOffReminder == true)
    #expect(store.count == 1)
    #expect(store.items()[0].id == plain.id)

    // Survives reload
    store.reload()
    #expect(store.count == 1)
    #expect(store.items()[0].id == plain.id)
  }

  @Test("Notes and reminders never age off even after 7 days (D2, D57)")
  func notesAndRemindersNeverAgeOffD57() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    let clock = TestClock(t0)

    let store = ShelfStore(file: storeFile, clock: { clock.now })
    _ = store.addNote(text: "idea: notch app shows lyrics", isReminder: false)
    _ = store.addNote(text: "renew passport", isReminder: true)

    #expect(store.count == 2)

    // Advance clock 7 days into future
    clock.advance(by: 7 * 24 * 3600)

    let items = store.items()
    #expect(items.count == 2)
    #expect(items[0].title == "✎ idea: notch app shows lyrics")
    #expect(items[1].title == "renew passport")
  }

  @Test("Dragging a note or reminder out keeps it on the shelf on accepted drop (D93)")
  func itemAcceptedKeepsNotesAndRemindersD93() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    let dummyFile = try createTempFile(in: dir, named: "doc.pdf")
    try store.parkFile(at: dummyFile)
    let note = store.addNote(text: "idea: notch app shows lyrics", isReminder: false)
    let reminder = store.addNote(text: "renew passport", isReminder: true)

    #expect(store.count == 3)

    // Accepted drop for note does not remove it
    let noteDropResult = store.itemAccepted(id: note.id)
    #expect(noteDropResult == false)
    #expect(store.count == 3)

    // Accepted drop for reminder does not remove it
    let reminderDropResult = store.itemAccepted(id: reminder.id)
    #expect(reminderDropResult == false)
    #expect(store.count == 3)

    // Accepted drop for file removes it
    let fileItem = store.items().first { $0.title == "doc.pdf" }!
    let fileDropResult = store.itemAccepted(id: fileItem.id)
    #expect(fileDropResult == true)
    #expect(store.count == 2)
  }

  @Test("Notes preserve exact literal prefixes through create, reload, edit, and toggle (M2)")
  func literalPrefixesPreservedThroughLifecycleM2() throws {
    let dir = try makeScratchDirectory()
    let storeFile = dir.appendingPathComponent("shelf.json")
    let store = ShelfStore(file: storeFile)

    // Note typed with literal "✎ sketch"
    let n1 = store.addNote(text: "✎ sketch")
    #expect(n1.noteText == "✎ sketch")
    #expect(n1.title == "✎ ✎ sketch")

    // Edit a note to nonempty "✎ "
    let n2 = store.addNote(text: "some note")
    let edited = store.updateNoteText(id: n2.id, text: "✎ ")
    #expect(edited == true)
    #expect(store.count == 2)
    let item2 = store.items().first { $0.id == n2.id }
    #expect(item2?.noteText == "✎ ")

    // Toggle note with literal prefix keeps raw text
    let toggled = store.toggleNoteKind(id: n1.id)
    #expect(toggled == true)
    let item1 = store.items().first { $0.id == n1.id }
    #expect(item1?.noteText == "✎ sketch")
    #expect(item1?.title == "✎ sketch")

    // Reload preserves raw text
    store.reload()
    let reloaded1 = store.items().first { $0.id == n1.id }
    #expect(reloaded1?.noteText == "✎ sketch")
  }
}
