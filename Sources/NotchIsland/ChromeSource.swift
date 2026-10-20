import AppKit
import Foundation
import IslandCore

/// Chrome's part (D88, D126): the companion extension reports, per
/// youtube.com or soundcloud.com tab, whether it counts and what it plays. It
/// reaches the island through its native-messaging host (this same binary,
/// started by Chrome, see `ChromeHost`), which relays over a socket only this
/// user can open. Each counting tab is its own source on the card.
final class ChromeBridge {
  /// A tab part appeared; the app wires it like any other part.
  var onTabPart: ((ChromeTabPart) -> Void)?
  private(set) var parts: [Int: ChromeTabPart] = [:]
  /// Tabs that closed while they counted: where they were, to reopen (D117).
  private var closed: [Int: ChromeTab] = [:]
  private var listener: Int32 = -1
  private var acceptSource: DispatchSourceRead?
  private var connection: FileHandle?
  private var buffer = Data()
  let socketPath: String

  init(directory: URL) {
    socketPath = directory.appendingPathComponent("chrome.sock").path
  }

  func start() {
    try? FileManager.default.createDirectory(
      atPath: (socketPath as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    unlink(socketPath)
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0, var address = Self.address(socketPath) else { return }
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard bound == 0, chmod(socketPath, 0o600) == 0, listen(fd, 2) == 0 else {
      close(fd)
      return
    }
    listener = fd
    let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: .main)
    source.setEventHandler { [weak self] in self?.accept() }
    source.resume()
    acceptSource = source
  }

  static func address(_ path: String) -> sockaddr_un? {
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let bytes = Array(path.utf8)
    guard bytes.count < MemoryLayout.size(ofValue: address.sun_path) else { return nil }
    withUnsafeMutableBytes(of: &address.sun_path) { raw in
      for (i, b) in bytes.enumerated() { raw[i] = b }
    }
    return address
  }

  private func accept() {
    let fd = Darwin.accept(listener, nil, nil)
    guard fd >= 0 else { return }
    // Only this user's own processes: the host Chrome started for them.
    var uid: uid_t = 0
    var gid: gid_t = 0
    guard getpeereid(fd, &uid, &gid) == 0, uid == getuid() else {
      close(fd)
      return
    }
    connection?.closeFile()
    buffer = Data()
    let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
    handle.readabilityHandler = { [weak self] h in
      let data = h.availableData
      DispatchQueue.main.async {
        if data.isEmpty {
          h.readabilityHandler = nil
          self?.connectionClosed(h)
        } else {
          self?.take(data)
        }
      }
    }
    connection = handle
  }

  private func connectionClosed(_ handle: FileHandle) {
    guard handle === connection else { return }
    connection = nil
    // Chrome or its extension went away: every tab leaves.
    for id in Array(parts.keys) { leave(id) }
  }

  private func take(_ data: Data) {
    buffer.append(data)
    guard buffer.count < NativeMessaging.maxMessage * 2 else {
      buffer = Data()
      return
    }
    while let newline = buffer.firstIndex(of: 0x0A) {
      let line = Data(buffer[buffer.startIndex..<newline])
      buffer.removeSubrange(buffer.startIndex...newline)
      guard let message = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
        message["type"] as? String == "tabs"
      else { continue }
      let tabs = ((message["tabs"] as? [Any]) ?? []).compactMap(ChromeTab.parse)
      for gone in ((message["closed"] as? [Any]) ?? []).compactMap(ChromeTab.parse) {
        closed[gone.tab] = gone
      }
      apply(tabs)
    }
  }

  private func apply(_ tabs: [ChromeTab]) {
    let now = ProcessInfo.processInfo.systemUptime
    let seen = Set(tabs.map(\.tab))
    for id in Array(parts.keys) where !seen.contains(id) { leave(id) }
    for tab in tabs {
      let part = parts[tab.tab] ?? makePart(tab.tab)
      let song = Song(
        title: tab.title, artist: tab.artist, source: tab.site, trackID: nil,
        duration: tab.duration, sourceID: part.id, location: tab.url)
      part.onEvent?(
        part.id,
        .report(
          SourceReport(
            song: song, state: tab.playing ? .playing : .paused, position: tab.position,
            readAt: now)))
      part.onEvent?(part.id, .artwork(nil))
    }
  }

  private func makePart(_ tab: Int) -> ChromeTabPart {
    let part = ChromeTabPart(tab: tab, bridge: self)
    parts[tab] = part
    onTabPart?(part)
    return part
  }

  private func leave(_ tab: Int) {
    guard let part = parts.removeValue(forKey: tab) else { return }
    part.onEvent?(part.id, .left)
  }

  /// A command to the extension for one tab.
  func send(_ command: String, tab: Int, position: TimeInterval? = nil) {
    var message: [String: Any] = ["command": command, "tab": tab]
    if let position { message["position"] = position }
    guard let connection, let data = try? JSONSerialization.data(withJSONObject: message) else {
      return
    }
    try? connection.write(contentsOf: data + Data([0x0A]))
  }

  /// Reopen a closed tab where it left off (D117); false if it is not known.
  func reopen(tab: Int, at position: TimeInterval?) -> Bool {
    guard closed[tab] != nil else { return false }
    send("reopen", tab: tab, position: position)
    closed[tab] = nil
    return true
  }
}

/// One youtube.com or soundcloud.com tab on the card.
final class ChromeTabPart: SourcePart {
  let tab: Int
  let id: SourceID
  var onEvent: ((SourceID, SourceEvent) -> Void)?
  private weak var bridge: ChromeBridge?
  private var lastPosition: (TimeInterval, TimeInterval)?

  init(tab: Int, bridge: ChromeBridge) {
    self.tab = tab
    self.id = .chromeTab(tab)
    self.bridge = bridge
  }

  func start() {}
  func refresh() {}
  func play() { bridge?.send("play", tab: tab) }
  func pause() { bridge?.send("pause", tab: tab) }
  func skip() { bridge?.send("next", tab: tab) }
  func back() { bridge?.send("previous", tab: tab) }
  func seek(to seconds: TimeInterval) { bridge?.send("seek", tab: tab, position: seconds) }
  /// The exact tab comes to the front, in a front Chrome window (D26).
  func bringForward() {
    bridge?.send("focus", tab: tab)
    activate(bundleID: "com.google.Chrome")
  }
  func reopen(_ song: Song, at position: TimeInterval?) {
    _ = bridge?.reopen(tab: tab, at: position)
  }
}

/// The companion extension's native-messaging host: this binary, started by
/// Chrome with the caller's origin as its first argument. It answers only the
/// companion extension, and relays between Chrome (length-framed JSON on
/// standard input and output) and the running island (JSON lines on its
/// socket). Without a running island it ends at once.
enum ChromeHost {
  static func isHostLaunch(_ arguments: [String]) -> Bool {
    arguments.count > 1 && arguments[1].hasPrefix("chrome-extension://")
  }

  static func run(origin: String) -> Never {
    guard NativeMessaging.isAllowedOrigin(origin) else { exit(1) }
    let directory = FileManager.default.urls(
      for: .applicationSupportDirectory, in: .userDomainMask)[
        0
      ]
      .appendingPathComponent("notch-island", isDirectory: true)
    let path = directory.appendingPathComponent("chrome.sock").path
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0, var address = ChromeBridge.address(path) else { exit(0) }
    let connected = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard connected == 0 else { exit(0) }
    let island = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
    // Island to Chrome.
    Thread.detachNewThread {
      var lines = Data()
      while true {
        let data = island.availableData
        if data.isEmpty { exit(0) }
        lines.append(data)
        while let newline = lines.firstIndex(of: 0x0A) {
          let line = Data(lines[lines.startIndex..<newline])
          lines.removeSubrange(lines.startIndex...newline)
          FileHandle.standardOutput.write(NativeMessaging.frame(line))
        }
      }
    }
    // Chrome to the island.
    var buffer = Data()
    while true {
      let data = FileHandle.standardInput.availableData
      if data.isEmpty { exit(0) }
      buffer.append(data)
      guard let messages = NativeMessaging.unframe(&buffer) else { exit(1) }
      for message in messages {
        guard (try? JSONSerialization.jsonObject(with: message)) != nil else { continue }
        island.write(message + Data([0x0A]))
      }
    }
  }
}
