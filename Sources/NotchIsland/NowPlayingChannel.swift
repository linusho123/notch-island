import AppKit
import Foundation
import IslandCore

/// The door into the system now-playing service, which IINA publishes to and
/// which has no other door into IINA (DESIGN). macOS 15.4 and later deny the
/// service to third-party apps, so the island's adapter library is loaded by
/// the Apple-signed `/usr/bin/perl`; it streams one JSON line per change and
/// takes commands on its input. Event-driven: the adapter writes only when the
/// service tells it something changed. Confined to the IINA part, so a closed
/// gap costs one source.
final class NowPlayingChannel {
  /// Called on the main thread with each change of the channel; nil when the
  /// channel is no longer known (the adapter ended).
  var onChange: ((ChannelInfo?) -> Void)?
  var info: ChannelInfo? { model.info }
  private var model = ChannelModel()

  private var process: Process?
  private var input: FileHandle?

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
      DispatchQueue.main.async { self?.adapterEnded() }
    }
    do {
      try process.run()
    } catch {
      NSLog("notch-island: could not start the now-playing adapter: %@", "\(error)")
      return
    }
    self.process = process
    input = inPipe.fileHandleForWriting
    model.started(at: ProcessInfo.processInfo.systemUptime)
  }

  /// The adapter died: the channel is no longer known, so what was read from
  /// it (IINA) has no face. It starts again after a back-off, and not at all
  /// once it keeps failing or says it cannot work.
  private func adapterEnded() {
    process = nil
    input = nil
    let (effects, decision) = model.ended(at: ProcessInfo.processInfo.systemUptime)
    apply(effects)
    switch decision {
    case .restart(let delay):
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.start() }
    case .giveUp:
      NSLog("notch-island: the now-playing adapter keeps failing; IINA is not followed")
    }
  }

  private func apply(_ effects: [ChannelEffect]) {
    for effect in effects {
      switch effect {
      case .changed(let info): onChange?(info)
      case .dead: break  // the adapter exits next; the model gives up on it
      }
    }
  }

  /// Send a command to the app the channel shows now.
  func send(_ command: String) {
    guard let input, let data = (command + "\n").data(using: .utf8) else { return }
    try? input.write(contentsOf: data)
  }

  func seek(to seconds: TimeInterval) { send(String(format: "seek %.3f", max(0, seconds))) }

  private func take(_ data: Data) {
    apply(
      model.take(data) { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier })
  }
}
