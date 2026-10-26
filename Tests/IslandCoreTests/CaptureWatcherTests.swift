import Foundation
import IslandCore
import Testing

@Suite("CaptureWatcherTests")
struct CaptureWatcherTests {
  private func makeTempDir() -> URL {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("capture-test-\(UUID().uuidString)")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  @Test("A file with kMDItemIsScreenCapture is detected as a macOS capture")
  func screenshotWithXattrIsDetected() throws {
    let tempDir = makeTempDir()
    defer { try? FileManager.default.removeItem(at: tempDir) }

    let file = tempDir.appendingPathComponent("Screenshot 2026-10-18 at 10.15.02.png")
    try Data("image-data".utf8).write(to: file)

    // Set kMDItemIsScreenCapture xattr
    let path = file.path
    let val = "bplist00"
    setxattr(path, CaptureDetector.screenCaptureAttr, val, val.utf8.count, 0, 0)

    #expect(CaptureDetector.isMacOSCapture(url: file))
  }

  @Test("A file without capture metadata is rejected (another tool or normal file)")
  func regularFileIsRejected() throws {
    let tempDir = makeTempDir()
    defer { try? FileManager.default.removeItem(at: tempDir) }

    let file = tempDir.appendingPathComponent("Screenshot 2026-10-18 at 10.15.02.png")
    try Data("image-data-from-other-tool".utf8).write(to: file)

    #expect(!CaptureDetector.isMacOSCapture(url: file))
  }

  @Test("CaptureWatcher ignores existing files present before start")
  func watcherIgnoresPreexistingFiles() throws {
    let tempDir = makeTempDir()
    defer { try? FileManager.default.removeItem(at: tempDir) }

    let store = ShelfStore(directory: tempDir)
    let preExisting = tempDir.appendingPathComponent("preexisting.png")
    try Data("pre".utf8).write(to: preExisting)
    let val = "bplist00"
    setxattr(preExisting.path, CaptureDetector.screenCaptureAttr, val, val.utf8.count, 0, 0)

    let watcher = CaptureWatcher(directory: tempDir, store: store)
    watcher.start()
    defer { watcher.stop() }

    watcher.scanForNewCaptures()
    #expect(store.isEmpty)
  }

  @Test("CaptureWatcher parks newly added macOS captures")
  func watcherParksNewCaptures() throws {
    let tempDir = makeTempDir()
    let stagingDir = makeTempDir()
    defer {
      try? FileManager.default.removeItem(at: tempDir)
      try? FileManager.default.removeItem(at: stagingDir)
    }

    let store = ShelfStore(directory: tempDir)
    let watcher = CaptureWatcher(directory: tempDir, store: store)
    watcher.start()
    defer { watcher.stop() }

    let stagedShot = stagingDir.appendingPathComponent("Screenshot 2026-10-18 at 10.15.02.png")
    try Data("new-shot".utf8).write(to: stagedShot)
    let val = "bplist00"
    setxattr(stagedShot.path, CaptureDetector.screenCaptureAttr, val, val.utf8.count, 0, 0)

    let newShot = tempDir.appendingPathComponent("Screenshot 2026-10-18 at 10.15.02.png")
    try FileManager.default.moveItem(at: stagedShot, to: newShot)

    watcher.scanForNewCaptures()

    let items = store.items()
    #expect(items.count == 1)
    #expect(items[0].title == "Screenshot 2026-10-18 at 10.15.02.png")
  }

  @Test("CaptureWatcher ignores newly added non-captures")
  func watcherIgnoresNonCaptures() throws {
    let tempDir = makeTempDir()
    defer { try? FileManager.default.removeItem(at: tempDir) }

    let store = ShelfStore(directory: tempDir)
    let watcher = CaptureWatcher(directory: tempDir, store: store)
    watcher.start()
    defer { watcher.stop() }

    let otherFile = tempDir.appendingPathComponent("notes.txt")
    try Data("notes".utf8).write(to: otherFile)

    watcher.scanForNewCaptures()
    #expect(store.isEmpty)
  }
}
