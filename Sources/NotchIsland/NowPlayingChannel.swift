import AppKit
import Foundation

/// What the system's shared now-playing channel shows: one app at a time.
struct ChannelInfo: Equatable {
  var bundleID: String?
  var pid: pid_t
  var title: String?
  var artist: String?
  var duration: TimeInterval?
  /// The elapsed time the channel reported, and the wall-clock time it holds for.
  var elapsed: TimeInterval?
  var timestamp: TimeInterval?
  var rate: Double
  var playing: Bool
  /// Wall-clock time of the read.
  var readAt: TimeInterval

  /// The position now, carried on from the channel's timestamp while it plays.
  func position(atWallClock now: TimeInterval) -> TimeInterval? {
    guard let elapsed else { return nil }
    guard playing, rate > 0, let timestamp else { return elapsed }
    return elapsed + rate * max(0, now - timestamp)
  }
}

/// The door into the system now-playing service, which IINA publishes to and
/// which has no other door into IINA (DESIGN). macOS 15.4 and later deny the
/// service to third-party apps, so the island's adapter library is loaded by
/// the Apple-signed `/usr/bin/perl`; it streams one JSON line per change and
/// takes commands on its input. Event-driven: the adapter writes only when the
/// service tells it something changed. Confined to the IINA part, so a closed
/// gap costs one source.
final class NowPlayingChannel {
  /// Called on the main thread with each change of the channel.
  var onChange: ((ChannelInfo) -> Void)?
  private(set) var info: ChannelInfo?

  private var process: Process?
  private var input: FileHandle?
  private var buffer = Data()

  private static let script = """
    use DynaLoader;
    my $lib = DynaLoader::dl_load_file($ARGV[0], 0) or die DynaLoader::dl_error();
    my $run = DynaLoader::dl_find_symbol($lib, "notch_island_now_playing_run") or die "no entry";
    DynaLoader::dl_install_xsub("main::run", $run);
    &main::run();
    """

  private static var adapterPath: String? {
    Bundle.main.url(forResource: "now-playing-adapter", withExtension: "dylib")?.path
  }

  func start() {
    guard process == nil, let adapter = Self.adapterPath else {
      if Self.adapterPath == nil { NSLog("notch-island: the now-playing adapter is missing") }
      return
    }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
    process.arguments = ["-e", Self.script, adapter]
    let out = Pipe()
    let inPipe = Pipe()
    process.standardOutput = out
    process.standardInput = inPipe
    process.standardError = FileHandle.nullDevice
    out.fileHandleForReading.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      DispatchQueue.main.async { self?.take(data) }
    }
    process.terminationHandler = { [weak self] _ in
      DispatchQueue.main.async {
        guard let self else { return }
        self.process = nil
        self.input = nil
        // The adapter died: start it again in a moment.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.start() }
      }
    }
    do {
      try process.run()
    } catch {
      NSLog("notch-island: could not start the now-playing adapter: %@", "\(error)")
      return
    }
    self.process = process
    input = inPipe.fileHandleForWriting
  }

  /// Send a command to the app the channel shows now.
  func send(_ command: String) {
    guard let input, let data = (command + "\n").data(using: .utf8) else { return }
    try? input.write(contentsOf: data)
  }

  func seek(to seconds: TimeInterval) { send(String(format: "seek %.3f", max(0, seconds))) }

  private func take(_ data: Data) {
    buffer.append(data)
    while let newline = buffer.firstIndex(of: 0x0A) {
      let line = buffer[buffer.startIndex..<newline]
      buffer.removeSubrange(buffer.startIndex...newline)
      guard
        let object = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any],
        object["type"] as? String == "nowPlaying"
      else { continue }
      let pid = (object["pid"] as? NSNumber)?.int32Value ?? 0
      let info = ChannelInfo(
        bundleID: pid > 0 ? NSRunningApplication(processIdentifier: pid)?.bundleIdentifier : nil,
        pid: pid,
        title: object["title"] as? String,
        artist: object["artist"] as? String,
        duration: (object["duration"] as? NSNumber)?.doubleValue,
        elapsed: (object["elapsed"] as? NSNumber)?.doubleValue,
        timestamp: (object["timestamp"] as? NSNumber)?.doubleValue,
        rate: (object["rate"] as? NSNumber)?.doubleValue ?? 0,
        playing: (object["playing"] as? NSNumber)?.boolValue ?? false,
        readAt: (object["now"] as? NSNumber)?.doubleValue ?? Date().timeIntervalSince1970)
      self.info = info
      onChange?(info)
    }
  }
}
