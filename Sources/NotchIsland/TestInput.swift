import Foundation

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

    /// The harness's clean-up: unregister the login item and exit.
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
  #endif
}
