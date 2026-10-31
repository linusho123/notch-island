import Foundation

/// Calls back when a file or folder changes, is replaced, appears or goes, on
/// file-system events only, never on a timer (D79). Each path is watched
/// itself while it exists, and through its parent folder, so a file replaced
/// atomically (as preferences are written) or created later is seen too.
public final class PathWatch: @unchecked Sendable {
  private let paths: [URL]
  private let onChange: @Sendable () -> Void
  private let queue = DispatchQueue(label: "notch-island.path-watch")
  private var sources: [String: DispatchSourceFileSystemObject] = [:]
  private var running = false

  public init(_ paths: [URL], onChange: @escaping @Sendable () -> Void) {
    self.paths = paths
    self.onChange = onChange
  }

  deinit {
    // Never waits on `queue`: the last reference may go on it.
    for source in sources.values { source.cancel() }
  }

  public func start() {
    queue.sync {
      guard !running else { return }
      running = true
      for path in paths {
        arm(path.deletingLastPathComponent().path, isParent: true)
        arm(path.path, isParent: false)
      }
    }
  }

  public func stop() {
    queue.sync {
      running = false
      for source in sources.values { source.cancel() }
      sources = [:]
    }
  }

  /// Opens a source on `path` (on `queue`); a missing path is armed again on
  /// its parent's next event.
  private func arm(_ path: String, isParent: Bool) {
    guard sources[path] == nil else { return }
    let fd = open(path, O_EVTONLY)
    guard fd >= 0 else { return }
    let source = DispatchSource.makeFileSystemObjectSource(
      fileDescriptor: fd, eventMask: [.write, .extend, .attrib, .delete, .rename], queue: queue)
    source.setEventHandler { [weak self] in
      guard let self, self.running else { return }
      let gone = !source.data.isDisjoint(with: [.delete, .rename])
      if gone {
        source.cancel()
        self.sources[path] = nil
      }
      // A parent's event may be a watched path appearing or replaced: the
      // children are armed again, on their new files.
      if isParent {
        for child in self.paths where child.deletingLastPathComponent().path == path {
          self.sources[child.path]?.cancel()
          self.sources[child.path] = nil
          self.arm(child.path, isParent: false)
        }
      }
      if gone { self.arm(path, isParent: isParent) }
      // Off `queue`: the callback may stop this watch and start another.
      let onChange = self.onChange
      DispatchQueue.global(qos: .utility).async { onChange() }
    }
    source.setCancelHandler { close(fd) }
    source.resume()
    sources[path] = source
  }
}
