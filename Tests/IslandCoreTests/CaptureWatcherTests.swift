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

    var items: [ShelfItem] = []
    for _ in 0..<20 {
      watcher.scanForNewCaptures()
      items = store.items()
      if items.count == 1 { break }
      Thread.sleep(forTimeInterval: 0.05)
    }

    #expect(items.count == 1)
    #expect(items.first?.title == "Screenshot 2026-10-18 at 10.15.02.png")
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

  @Test("Injected location provider update causes watcher to follow and re-arm (SF7, M4)")
  func watcherFollowsLocationProviderChange() throws {
    let dir1 = makeTempDir()
    let dir2 = makeTempDir()
    let stagingDir = makeTempDir()
    defer {
      try? FileManager.default.removeItem(at: dir1)
      try? FileManager.default.removeItem(at: dir2)
      try? FileManager.default.removeItem(at: stagingDir)
    }

    final class ProviderBox: @unchecked Sendable {
      var current: URL
      init(_ url: URL) { self.current = url }
    }
    let box = ProviderBox(dir1)

    let store = ShelfStore(directory: dir1)
    let watcher = CaptureWatcher(directory: dir1, store: store, locationProvider: { box.current })
    watcher.start()
    defer { watcher.stop() }

    // Change location provider to dir2
    box.current = dir2
    watcher.checkLocation()

    #expect(watcher.directory == dir2)

    // Add a capture in dir2
    let stagedShot = stagingDir.appendingPathComponent("Screenshot 2026-10-18 at 10.15.02.png")
    try Data("new-shot-dir2".utf8).write(to: stagedShot)
    let val = "bplist00"
    setxattr(stagedShot.path, CaptureDetector.screenCaptureAttr, val, val.utf8.count, 0, 0)

    let newShot = dir2.appendingPathComponent("Screenshot 2026-10-18 at 10.15.02.png")
    try FileManager.default.moveItem(at: stagedShot, to: newShot)

    var items: [ShelfItem] = []
    for _ in 0..<20 {
      watcher.scanForNewCaptures()
      items = store.items()
      if items.count == 1 { break }
      Thread.sleep(forTimeInterval: 0.05)
    }

    #expect(items.count == 1)
    #expect(items.first?.title == "Screenshot 2026-10-18 at 10.15.02.png")
  }

  @Test("Watcher arms when directory appears if missing at start (SF7, m9)")
  func watcherRearmsWhenDirectoryAppears() throws {
    let tempParent = makeTempDir()
    let lateDir = tempParent.appendingPathComponent("late-folder")
    let stagingDir = makeTempDir()
    defer {
      try? FileManager.default.removeItem(at: tempParent)
      try? FileManager.default.removeItem(at: stagingDir)
    }

    let store = ShelfStore(directory: tempParent)
    let watcher = CaptureWatcher(directory: lateDir, store: store)
    watcher.start()
    defer { watcher.stop() }

    // lateDir does not exist yet; creating it now
    try FileManager.default.createDirectory(at: lateDir, withIntermediateDirectories: true)
    watcher.checkLocation()

    // Add capture to lateDir
    let stagedShot = stagingDir.appendingPathComponent("Screenshot 2026-10-18 at 10.15.02.png")
    try Data("late-shot".utf8).write(to: stagedShot)
    let val = "bplist00"
    setxattr(stagedShot.path, CaptureDetector.screenCaptureAttr, val, val.utf8.count, 0, 0)

    let newShot = lateDir.appendingPathComponent("Screenshot 2026-10-18 at 10.15.02.png")
    try FileManager.default.moveItem(at: stagedShot, to: newShot)

    var items: [ShelfItem] = []
    for _ in 0..<20 {
      watcher.scanForNewCaptures()
      items = store.items()
      if items.count == 1 { break }
      Thread.sleep(forTimeInterval: 0.05)
    }

    #expect(items.count == 1)
    #expect(items.first?.title == "Screenshot 2026-10-18 at 10.15.02.png")
  }

  @Test("Recording detection retries for about 5 seconds after file appears (SF9, m1)")
  func recordingDetectionRetriesForAboutFiveSeconds() throws {
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

    // Place a .mov without capture metadata initially
    let stagedRecording = stagingDir.appendingPathComponent(
      "Screen Recording 2026-10-18 at 10.15.02.mov")
    try Data("recording-bytes".utf8).write(to: stagedRecording)

    let watchedRecording = tempDir.appendingPathComponent(
      "Screen Recording 2026-10-18 at 10.15.02.mov")
    try FileManager.default.moveItem(at: stagedRecording, to: watchedRecording)

    // Watcher scans and sees file without metadata, starting its retry window
    watcher.scanForNewCaptures()
    #expect(store.isEmpty)

    // Wait 0.6 seconds (exceeding the old 0.3s window, but within 5s)
    Thread.sleep(forTimeInterval: 0.6)

    // Metadata is written late (e.g. ReplayKit/macOS finishing writing metadata)
    let val = "bplist00"
    setxattr(watchedRecording.path, CaptureDetector.screenCaptureAttr, val, val.utf8.count, 0, 0)

    // Wait for the retry loop to pick it up (up to 1.0s)
    var items: [ShelfItem] = []
    for _ in 0..<20 {
      items = store.items()
      if items.count == 1 { break }
      Thread.sleep(forTimeInterval: 0.05)
    }

    #expect(items.count == 1)
    #expect(items.first?.title == "Screen Recording 2026-10-18 at 10.15.02.mov")
  }

  @Test("A changed screenshot location is followed on the change, with no poll (D79)")
  func locationFollowedOnItsSignal() throws {
    let dir1 = makeTempDir()
    let dir2 = makeTempDir()
    let signals = makeTempDir()
    defer {
      for d in [dir1, dir2, signals] { try? FileManager.default.removeItem(at: d) }
    }
    let prefs = signals.appendingPathComponent("com.apple.screencapture.plist")
    try Data("desktop".utf8).write(to: prefs)
    final class Box: @unchecked Sendable {
      var current: URL
      init(_ u: URL) { current = u }
    }
    let box = Box(dir1)
    let store = ShelfStore(directory: signals)
    let watcher = CaptureWatcher(
      directory: dir1, store: store, locationProvider: { box.current }, locationSignals: [prefs])
    watcher.start()
    defer { watcher.stop() }
    box.current = dir2
    try Data("moved".utf8).write(to: prefs, options: .atomic)
    let deadline = Date().addingTimeInterval(2)
    while watcher.directory != dir2 && Date() < deadline { Thread.sleep(forTimeInterval: 0.02) }
    #expect(watcher.directory == dir2)
  }
}
