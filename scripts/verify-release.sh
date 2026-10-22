#!/usr/bin/env bash
set -euo pipefail

release_directory="$(pwd)/dist"
verification_directory="$(mktemp -d)"
trap 'rm -rf "$verification_directory"' EXIT

cd "$release_directory"
shasum -a 256 -c checksums.txt

archives=(acloud-playrooms_*_darwin_universal.zip)
if [ "${#archives[@]}" -ne 1 ] || [ ! -f "${archives[0]}" ]; then
  echo 'Expected exactly one universal macOS archive.' >&2
  exit 1
fi
ditto -x -k "${archives[0]}" "$verification_directory"
app_bundle="$verification_directory/Acloud Playrooms.app"
test -f "$verification_directory/LICENSE"
test -f "$verification_directory/NOTICE"
test -f "$app_bundle/Contents/Resources/icons.icns"
plutil -lint "$app_bundle/Contents/Info.plist"
lipo "$app_bundle/Contents/MacOS/Acloud Playrooms" -verify_arch arm64 x86_64
codesign --verify --deep --strict "$app_bundle"

expected_version="$(node -p 'JSON.parse(require("node:fs").readFileSync("metadata.json", "utf8")).version')"
actual_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_bundle/Contents/Info.plist")"
test "$actual_version" = "$expected_version"
ruby -c homebrew/acloud-playrooms.rb

disk_images=(acloud-playrooms_*_darwin_universal.dmg)
if [ "${#disk_images[@]}" -ne 1 ] || [ ! -f "${disk_images[0]}" ]; then
  echo 'Expected exactly one universal macOS disk image.' >&2
  exit 1
fi
test "${disk_images[0]}" = "acloud-playrooms_${expected_version}_darwin_universal.dmg"
# Require an explicit checksum entry for the DMG as well as verifying its value.
test "$(awk -v image="${disk_images[0]}" '$2 == image { count++ } END { print count+0 }' checksums.txt)" = 1
bash ../scripts/verify-dmg.sh "${disk_images[0]}" "$expected_version"
