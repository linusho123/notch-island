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
