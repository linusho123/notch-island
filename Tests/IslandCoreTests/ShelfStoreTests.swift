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
}
