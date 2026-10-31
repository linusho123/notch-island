import Foundation
import Testing

@testable import IslandCore

/// D79, as found by the 2026-10-30 audit: the screenshot location was polled
/// once a second for the island's whole life. It is now followed on
/// file-system events only.
struct PathWatchTests {
  private func makeTempDir() -> URL {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("pathwatch-\(UUID().uuidString)", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.resolvingSymlinksInPath()
  }

  /// Waits up to two seconds for the watch to call back.
  private func seen(_ counter: Counter, after before: Int) -> Bool {
    let deadline = Date().addingTimeInterval(2)
    while Date() < deadline {
      if counter.value > before { return true }
      Thread.sleep(forTimeInterval: 0.02)
    }
    return false
  }

  final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    var value: Int {
      lock.lock()
      defer { lock.unlock() }
      return count
    }
    func bump() {
      lock.lock()
      count += 1
      lock.unlock()
    }
  }

  @Test func aFileWrittenInPlaceIsSeen() throws {
    let dir = makeTempDir()
    defer { try? FileManager.default.removeItem(at: dir) }
    let file = dir.appendingPathComponent("input.json")
    try Data("{}".utf8).write(to: file)
    let counter = Counter()
    let watch = PathWatch([file]) { counter.bump() }
    watch.start()
    defer { watch.stop() }
    let before = counter.value
    let handle = try FileHandle(forWritingTo: file)
    handle.write(Data("{\"a\":1}".utf8))
    try handle.close()
    #expect(seen(counter, after: before))
  }

  @Test func aFileReplacedAtomicallyIsSeenAndStillWatched() throws {
    let dir = makeTempDir()
    defer { try? FileManager.default.removeItem(at: dir) }
    let file = dir.appendingPathComponent("com.apple.screencapture.plist")
    try Data("one".utf8).write(to: file)
    let counter = Counter()
    let watch = PathWatch([file]) { counter.bump() }
    watch.start()
    defer { watch.stop() }
    var before = counter.value
    try Data("two".utf8).write(to: file, options: .atomic)
    #expect(seen(counter, after: before))
    // The replaced file is watched too: a later in-place write is seen.
    Thread.sleep(forTimeInterval: 0.1)
    before = counter.value
    let handle = try FileHandle(forWritingTo: file)
    handle.write(Data("three".utf8))
    try handle.close()
    #expect(seen(counter, after: before))
  }

  @Test func aFolderThatAppearsLaterIsSeen() throws {
    let dir = makeTempDir()
    defer { try? FileManager.default.removeItem(at: dir) }
    let late = dir.appendingPathComponent("Screenshots", isDirectory: true)
    let counter = Counter()
    let watch = PathWatch([late]) { counter.bump() }
    watch.start()
    defer { watch.stop() }
    let before = counter.value
    try FileManager.default.createDirectory(at: late, withIntermediateDirectories: true)
    #expect(seen(counter, after: before))
  }

  @Test func nothingChangingCallsNothing() throws {
    let dir = makeTempDir()
    defer { try? FileManager.default.removeItem(at: dir) }
    let file = dir.appendingPathComponent("input.json")
    try Data("{}".utf8).write(to: file)
    let counter = Counter()
    let watch = PathWatch([file]) { counter.bump() }
    watch.start()
    defer { watch.stop() }
    Thread.sleep(forTimeInterval: 1.2)
    #expect(counter.value == 0)
  }
}
