import Foundation
import HarnessCore
import Testing

struct OwnedCaptureTests {
  @Test func disconnectKillsDelayedChildAndRemovesOnlyOwnedArtifacts() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: root) }
    let unrelated = root.appendingPathComponent("unrelated.png")
    try Data("keep".utf8).write(to: unrelated)
    let pidFile = root.appendingPathComponent("child.pid")
    let lifetime = Pipe()
    let task = Task.detached {
      try OwnedCapture().run(
        executable: URL(fileURLWithPath: "/usr/bin/perl"),
        arguments: { file in
          [
            "-e",
            "$SIG{TERM}='IGNORE'; open(my $p,'>',$ARGV[1]) or die $!; print $p $$; close $p; "
              + "select(undef,undef,undef,2); open(my $f,'>',$ARGV[0]) or die $!; print $f 'late'; close $f;",
            file.path, pidFile.path,
          ]
        }, parent: root, owner: lifetime.fileHandleForReading)
    }
    for _ in 0..<200 {
      if FileManager.default.fileExists(atPath: pidFile.path) { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    let pid = try #require(Int32(String(contentsOf: pidFile, encoding: .utf8)))
    try lifetime.fileHandleForWriting.close()
    let data = try await task.value
    #expect(data == nil)
    #expect(kill(pid, 0) == -1)
    try await Task.sleep(for: .milliseconds(2100))
    let remaining = try FileManager.default.contentsOfDirectory(atPath: root.path).sorted()
    #expect(remaining == ["child.pid", "unrelated.png"])
    #expect(try Data(contentsOf: unrelated) == Data("keep".utf8))
  }

  @Test func failedLaunchRemovesPrivateDirectory() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: root) }
    let pipe = Pipe()
    defer { try? pipe.fileHandleForWriting.close() }
    #expect(throws: (any Error).self) {
      try OwnedCapture().run(
        executable: URL(fileURLWithPath: "/no-such-capture-tool"), arguments: { [$0.path] },
        parent: root, owner: pipe.fileHandleForReading)
    }
    #expect(try FileManager.default.contentsOfDirectory(atPath: root.path).isEmpty)
  }
}
