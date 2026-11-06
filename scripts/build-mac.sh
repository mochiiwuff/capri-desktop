#!/bin/sh
# What the Mac build needs besides the app itself: her native helper (native/mac/CapriHelper.swift),
# built for Apple silicon and Intel in one file, and her app icon as an .icns from assets/icons/capri.png.
# Needs the Xcode command line tools (xcode-select --install). macOS only.
#
#   sh scripts/build-mac.sh            both
#   sh scripts/build-mac.sh helper     the helper only
set -eu

cd "$(dirname "$0")/.."
if [ "$(uname)" != "Darwin" ]; then
  echo "scripts/build-mac.sh: macOS only, nothing to do here"
  exit 0
fi

OUT=native/mac/build
mkdir -p "$OUT"

# the helper, for both kinds of Mac, ad-hoc signed so Apple silicon runs it as is
for arch in arm64 x86_64; do
  xcrun swiftc -O -swift-version 5 -target "$arch-apple-macos12.0" \
    -o "$OUT/capri-helper-$arch" native/mac/CapriHelper.swift
done
lipo -create -output "$OUT/capri-helper" "$OUT/capri-helper-arm64" "$OUT/capri-helper-x86_64"
rm -f "$OUT/capri-helper-arm64" "$OUT/capri-helper-x86_64"
codesign --force --sign - "$OUT/capri-helper"
echo "helper: $OUT/capri-helper ($(lipo -archs "$OUT/capri-helper"))"

[ "${1:-}" = "helper" ] && exit 0

# the icon: the sizes macOS asks for, up to the 256 px of the original
SET="$OUT/capri.iconset"
rm -rf "$SET"
mkdir -p "$SET"
icon() { sips -z "$1" "$1" assets/icons/capri.png --out "$SET/$2" >/dev/null; }
icon 16 icon_16x16.png
icon 32 icon_16x16@2x.png
icon 32 icon_32x32.png
icon 64 icon_32x32@2x.png
icon 128 icon_128x128.png
icon 256 icon_128x128@2x.png
icon 256 icon_256x256.png
iconutil -c icns "$SET" -o "$OUT/capri.icns"
rm -rf "$SET"
echo "icon: $OUT/capri.icns"
