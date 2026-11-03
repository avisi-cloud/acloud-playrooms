#!/usr/bin/env bash
set -euo pipefail

# Run after GoReleaser and generate-homebrew-cask.mjs. `make dmg`, GoReleaser's
# first before hook, already mounts and verifies the DMG itself.
cd "$(dirname "$0")/.."
release_directory="$(pwd)/dist"
verification_directory="$(mktemp -d)"
trap 'rm -rf "$verification_directory"' EXIT

expected_version="$(node -p 'JSON.parse(require("node:fs").readFileSync("dist/metadata.json", "utf8")).version')"
archive="acloud-playrooms_${expected_version}_darwin_universal.zip"
disk_image="acloud-playrooms_${expected_version}_darwin_universal.dmg"

# Both downloads need exactly one checksum entry, and it must match.
for file in "$archive" "$disk_image"; do
  test "$(awk -v file="$file" '$2 == file { count++ } END { print count+0 }' "$release_directory/checksums.txt")" = 1
done
(cd "$release_directory" && grep -F "  $archive" checksums.txt | shasum -a 256 -c -)
(cd bin && grep -F "  $disk_image" "$release_directory/checksums.txt" | shasum -a 256 -c -)

ditto -x -k "$release_directory/$archive" "$verification_directory"
app_bundle="$verification_directory/Acloud Playrooms.app"
test -f "$verification_directory/LICENSE"
test -f "$verification_directory/NOTICE"
test -f "$app_bundle/Contents/Resources/icons.icns"
plutil -lint "$app_bundle/Contents/Info.plist"
lipo "$app_bundle/Contents/MacOS/Acloud Playrooms" -verify_arch arm64 x86_64
codesign --verify --deep --strict "$app_bundle"

actual_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_bundle/Contents/Info.plist")"
test "$actual_version" = "$expected_version"
ruby -c "$release_directory/homebrew/acloud-playrooms.rb"
