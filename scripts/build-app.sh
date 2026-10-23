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
  mkdir -p "$app/Contents/Resources"
  cp build/now-playing-adapter.dylib "$app/Contents/Resources/now-playing-adapter.dylib"
  sed -e "s/__BUNDLE_ID__/$3/" -e "s/__VERSION__/$VERSION/" -e "s/__NAME__/$4/" \
    app/Info.plist > "$app/Contents/Info.plist"
  codesign --force --sign - "$app" >/dev/null
  echo "built $app"
}

# The IINA part's now-playing adapter, loaded by /usr/bin/perl (DESIGN).
mkdir -p build
clang -dynamiclib -fobjc-arc -O2 -framework Foundation \
  -o build/now-playing-adapter.dylib app/adapter/now-playing-adapter.m
codesign --force --sign - build/now-playing-adapter.dylib >/dev/null

swift build -c release --product NotchIsland --build-path .build/release-app
bundle .build/release-app build/release local.notch-island "notch-island"

swift build -c release --product NotchIsland --build-path .build/test-app -Xswiftc -DISLAND_TEST_INPUT
bundle .build/test-app build/test local.notch-island.test "notch-island test"

sh scripts/build-harness.sh

# The harness's own now-playing reader (independent of the island's adapter).
clang -dynamiclib -fobjc-arc -O2 -framework AppKit \
  -o build/now-playing-reader.dylib test/support/now-playing/reader.m
codesign --force --sign - build/now-playing-reader.dylib >/dev/null
echo "built build/now-playing-reader.dylib"
