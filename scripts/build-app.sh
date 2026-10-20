#!/bin/sh
# Builds notch-island with Swift Package Manager (Command Line Tools, no
# Xcode), bundles it as an agent app (no Dock icon) and signs it ad hoc.
#
#   build/release/NotchIsland.app   the app as installed: no test input
#   build/test/NotchIsland.app      the same app with the test-only input
#                                   compiled in (-DISLAND_TEST_INPUT), which
#                                   the acceptance harness feeds
#   build/island-harness            the harness's helper (never bundled)
set -eu
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")

bundle() { # <swift build path> <bundle dir> <bundle id> <name>
  bin="$1/release/NotchIsland"
  app="$2/NotchIsland.app"
  rm -rf "$app"
  mkdir -p "$app/Contents/MacOS"
  cp "$bin" "$app/Contents/MacOS/NotchIsland"
  sed -e "s/__BUNDLE_ID__/$3/" -e "s/__VERSION__/$VERSION/" -e "s/__NAME__/$4/" \
    app/Info.plist > "$app/Contents/Info.plist"
  codesign --force --sign - "$app" >/dev/null
  echo "built $app"
}

swift build -c release --product NotchIsland --build-path .build/release-app
bundle .build/release-app build/release local.notch-island "notch-island"

swift build -c release --product NotchIsland --build-path .build/test-app -Xswiftc -DISLAND_TEST_INPUT
bundle .build/test-app build/test local.notch-island.test "notch-island test"

swift build -c release --product island-harness --build-path .build/harness
mkdir -p build
cp .build/harness/release/island-harness build/island-harness
codesign --force --sign - build/island-harness >/dev/null
echo "built build/island-harness"
