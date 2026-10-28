import CoreGraphics
import Foundation
import IslandCore

/// The test-only input the acceptance harness feeds. It exists only in a build
/// made with `-DISLAND_TEST_INPUT`; in the installed app every member is an
/// empty answer, and the app reads only the real system. It replaces inputs,
/// never what the island shows: no acceptance check reads it back.
enum TestInput {
  #if ISLAND_TEST_INPUT
    /// Where the island keeps its data (the last song) instead of Application
    /// Support: the scratch folder of one scenario. Read once, at launch.
    static let dataDirectory: URL? = {
      guard let dir = read()?["dataDirectory"] as? String else { return nil }
      return URL(fileURLWithPath: dir, isDirectory: true)
    }()

    /// Commands Apple Music is to ignore, standing in for an app that does not
    /// act on what the island sends it (D124): "pause", "play", "seek". Read
    /// at each command, since a scenario arranges it after the island is open.
    static func musicIgnores(_ command: String) -> Bool {
      guard let ignores = read()?["musicIgnores"] as? [String] else { return false }
      return ignores.contains(command)
    }

    /// What the left button reads as, when the scenario arranges a mouse-up
    /// that never arrived ("released" while the real button is down). Read at
    /// each poll of the open island; nil leaves the real reading.
    static var leftButtonReading: Bool? {
      switch read()?["leftButton"] as? String {
      case "released": return false
      case "held": return true
      default: return nil
      }
    }

    /// The output device the source line names, standing in for the system's
    /// default output (a Bluetooth speaker `JBL Flip 5`, BUILD-PLAN Q2):
    /// `{"name": "JBL Flip 5", "builtIn": false}`. Absent, the real device.
    static var outputDevice: OutputDevice? {
      guard let device = read()?["outputDevice"] as? [String: Any],
        let name = device["name"] as? String
      else { return nil }
      return OutputDevice(name: name, isBuiltIn: device["builtIn"] as? Bool ?? false)
    }

    /// The free gap left of the notch, in points, standing in for the one
    /// measured from the menu bar (a gap of an exact width, BUILD-PLAN
    /// acceptance bars). Read at each notice; absent, the measured gap.
    static var leftGap: CGFloat? {
      (read()?["leftGap"] as? NSNumber).map { CGFloat($0.doubleValue) }
    }

    /// Where the island and its Chrome host meet, when the scratch data
    /// folder's path is too long for a socket. Read once, at launch.
    static let chromeSocket: String? = read()?["chromeSocket"] as? String

    /// Injected clock date for testing 24-hour ageing and stacking (D57, D118).
    static var clockDate: Date? {
      if let str = read()?["clockDate"] as? String {
        let f = ISO8601DateFormatter()
        if let d = f.date(from: str) { return d }
        f.formatOptions.insert(.withFractionalSeconds)
        return f.date(from: str)
      } else if let ts = (read()?["clockTimestamp"] as? NSNumber)?.doubleValue {
        return Date(timeIntervalSince1970: ts)
      }
      return nil
    }

    /// Scratch screenshot directory for testing captures (D64).
    static var screenshotDirectory: URL? {
      if let dir = read()?["screenshotDirectory"] as? String {
        return URL(fileURLWithPath: dir, isDirectory: true)
      }
      return nil
    }

    /// Seeding shelf items in Givens (D59, D66).
    static var seedShelf: [[String: Any]]? {
      read()?["seedShelf"] as? [[String: Any]]
    }

    /// Clearing the shelf in Givens.
    static var clearShelf: Bool {
      read()?["clearShelf"] as? Bool ?? false
    }

    private static var watchers: [() -> Void] = []
    private static var source: DispatchSourceFileSystemObject?

    /// Call `action` on the main thread whenever the harness rewrites the
    /// test input (a Given or a When changing an injected input).
    static func onChange(_ action: @escaping () -> Void) {
      watchers.append(action)
      guard source == nil,
        let path = ProcessInfo.processInfo.environment["NOTCH_ISLAND_TEST_INPUT"]
      else { return }
      let fd = open(path, O_EVTONLY)
      guard fd >= 0 else { return }
      let watch = DispatchSource.makeFileSystemObjectSource(
        fileDescriptor: fd, eventMask: [.write, .extend, .attrib], queue: .main)
      watch.setEventHandler {
        for action in watchers { action() }
      }
      watch.setCancelHandler { close(fd) }
      watch.resume()
      source = watch
    }

    /// The harness's clean-up: unregister the login item and exit.
    static var loginStatusAndExit: Bool {
      CommandLine.arguments.contains("--test-login-status-and-exit")
    }
    static var unregisterLoginAndExit: Bool {
      CommandLine.arguments.contains("--test-unregister-login-and-exit")
    }

    private static func read() -> [String: Any]? {
      guard let path = ProcessInfo.processInfo.environment["NOTCH_ISLAND_TEST_INPUT"],
        let data = try? Data(contentsOf: URL(fileURLWithPath: path))
      else { return nil }
      return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
  #else
    static let dataDirectory: URL? = nil
    static func musicIgnores(_ command: String) -> Bool { false }
    static let unregisterLoginAndExit = false
    static let loginStatusAndExit = false
    static var leftButtonReading: Bool? { nil }
    static var outputDevice: OutputDevice? { nil }
    static var leftGap: CGFloat? { nil }
    static let chromeSocket: String? = nil
    static var clockDate: Date? { nil }
    static var screenshotDirectory: URL? { nil }
    static var seedShelf: [[String: Any]]? { nil }
    static var clearShelf: Bool { false }
    static func onChange(_ action: @escaping () -> Void) {}
  #endif
}
