import Foundation

/// A separate worker holds the screenshot child and its private artifact.
/// The helper keeps a pipe open; EOF cancels even when it died by SIGKILL.
public final class OwnedCapture: @unchecked Sendable {
  private let lock = NSLock()
  private var cancelled = false
  private var child: Process?

  public init() {}

  private func cancel() {
    lock.lock()
    cancelled = true
    let running = child
    if let running, running.isRunning { running.terminate() }
    lock.unlock()
    Thread.sleep(forTimeInterval: 0.2)
    lock.lock()
    if let running, running.isRunning { kill(running.processIdentifier, SIGKILL) }
    lock.unlock()
  }

  public func run(
    executable: URL, arguments: (URL) -> [String], parent: URL,
    owner: FileHandle
  ) throws -> Data? {
    let directory = parent.appendingPathComponent("capture-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appendingPathComponent("shot.png")
    let process = Process()
    process.executableURL = executable
    process.arguments = arguments(file)
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    DispatchQueue.global().async { [self] in
      _ = owner.readDataToEndOfFile()
      cancel()
    }
    lock.lock()
    if cancelled {
      lock.unlock()
      return nil
    }
    do {
      try process.run()
      child = process
    } catch {
      lock.unlock()
      throw error
    }
    lock.unlock()
    process.waitUntilExit()
    lock.lock()
    child = nil
    let wasCancelled = cancelled
    lock.unlock()
    guard !wasCancelled, process.terminationStatus == 0 else { return nil }
    return try Data(contentsOf: file)
  }
}
