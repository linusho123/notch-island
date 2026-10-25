#!/bin/sh
# Builds the acceptance harness's helper, build/island-harness (never
# bundled into the app). build-app.sh calls it; so does the idle waiter,
# whose input guard runs from a private copy of it.
set -eu
cd "$(dirname "$0")/.."
swift build -c release --product island-harness --build-path .build/harness
mkdir -p build
cp .build/harness/release/island-harness build/island-harness
codesign --force --sign - build/island-harness >/dev/null
echo "built build/island-harness"

# The menu stand-in: the same helper as a small app, so LaunchServices
# (`open`) can bring it to the front like any app the visionary opens; a bare
# executable started by the harness cannot take the front itself.
app=build/apps.noindex/MenuStandIn.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS"
cp build/island-harness "$app/Contents/MacOS/island-harness"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>local.notch-island.menu-stand-in</string>
  <key>CFBundleName</key><string>stand-in</string>
  <key>CFBundleExecutable</key><string>island-harness</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
PLIST
codesign --force --sign - "$app" >/dev/null
echo "built $app"
