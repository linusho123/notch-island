// swift-tools-version:6.0
import PackageDescription

// notch-island builds with Swift Package Manager from the Command Line Tools;
// there is no Xcode project. `scripts/build-app.sh` bundles and ad-hoc signs
// the app (`npm run build:app`).
//
// ISLAND_TEST_INPUT: the test-only input the acceptance harness feeds (a
// scratch data folder, an Apple Music that ignores a command) is compiled in
// only when the build passes `-Xswiftc -DISLAND_TEST_INPUT`. The installed
// app is built without it.
//
// Unit tests use swift-testing. The Command Line Tools ship Testing.framework
// but SwiftPM adds no search path for it there, so a plain `swift test` would
// build a runner that runs nothing; the package dependency below gives the
// runner its Testing module, and lib_TestingInterop comes from the tools.
let toolsLib = "/Library/Developer/CommandLineTools/Library/Developer/usr/lib"

let package = Package(
  name: "notch-island",
  platforms: [.macOS(.v14)],
  dependencies: [
    .package(url: "https://github.com/swiftlang/swift-testing", revision: "swift-6.3.3-RELEASE")
  ],
  targets: [
    // The logic below the island's surface: no AppKit, unit-tested.
    .target(name: "IslandCore"),
    .executableTarget(
      name: "NotchIsland",
      dependencies: ["IslandCore"],
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("SwiftUI"),
        .linkedFramework("ServiceManagement"),
        .linkedFramework("CoreAudio"),
        .linkedFramework("ScriptingBridge"),
      ]
    ),
    // The acceptance harness's own helper, never bundled into the app: reads
    // the island and the menu bar through Accessibility, drives the pointer,
    // and reads the screens.
    // What the harness's input guard decides, unit-tested: its own posted
    // events from the visionary's real input (Sharing the Mac).
    .target(name: "HarnessCore"),
    .executableTarget(
      name: "island-harness",
      dependencies: ["HarnessCore"],
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("ApplicationServices"),
        .linkedFramework("AVFoundation"),
        .linkedFramework("ScreenCaptureKit"),
        .linkedFramework("CoreAudio"),
        .linkedFramework("MediaPlayer"),
        .linkedFramework("IOKit"),
      ]
    ),
    .testTarget(
      name: "IslandCoreTests",
      dependencies: ["IslandCore", .product(name: "Testing", package: "swift-testing")],
      linkerSettings: [.unsafeFlags(["-L", toolsLib, "-Xlinker", "-rpath", "-Xlinker", toolsLib])]
    ),
    .testTarget(
      name: "HarnessCoreTests",
      dependencies: ["HarnessCore", .product(name: "Testing", package: "swift-testing")],
      linkerSettings: [.unsafeFlags(["-L", toolsLib, "-Xlinker", "-rpath", "-Xlinker", toolsLib])]
    ),
  ],
  swiftLanguageModes: [.v5]
)
