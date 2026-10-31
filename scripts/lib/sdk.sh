# Sourced by the build scripts. The Command Line Tools update of 2026-10-29
# made the default SDK macOS 27.2, which lacks the SwiftUI macro plugin, so
# nothing using SwiftUI builds against it. While that holds, build against the
# 26.5 SDK installed beside it. An SDKROOT set by the caller wins.
CLT_SDKS=/Library/Developer/CommandLineTools/SDKs
if [ -z "${SDKROOT:-}" ] && [ -d "$CLT_SDKS/MacOSX26.5.sdk" ] \
  && [ ! -e /Library/Developer/CommandLineTools/usr/lib/swift/host/plugins/libSwiftUIMacros.dylib ]; then
  SDKROOT="$CLT_SDKS/MacOSX26.5.sdk"
  export SDKROOT
fi
