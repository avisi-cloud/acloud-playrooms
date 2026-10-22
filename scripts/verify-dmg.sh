#!/usr/bin/env bash
set -euo pipefail

# Usage: bash scripts/verify-dmg.sh IMAGE.dmg VERSION
image="${1:?Usage: verify-dmg.sh IMAGE.dmg VERSION}"
expected_version="${2:?Usage: verify-dmg.sh IMAGE.dmg VERSION}"
source "$(dirname "$0")/dmg-tools.sh"
verification_directory="$(mktemp -d "${TMPDIR:-/tmp}/acloud-dmg-verify.XXXXXXXX")"
verification_directory="$(cd "$verification_directory" && pwd -P)"
mount_directory="$verification_directory/mounted"
cleanup() {
  local status=$?
  trap - EXIT
  if mount | grep -Fq " on $mount_directory ("; then
    if ! hdiutil detach "$mount_directory" && ! hdiutil detach -force "$mount_directory"; then
      echo "Could not detach $mount_directory; temporary files retained at $verification_directory." >&2
      exit 1
    fi
  fi
  rm -rf "$verification_directory"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

hdiutil verify "$image"
mkdir "$mount_directory"
hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$mount_directory" "$image"
test "$(readlink "$mount_directory/Applications")" = /Applications
test -s "$mount_directory/.DS_Store"
test -s "$mount_directory/.background/background.tiff"
test -s "$mount_directory/.VolumeIcon.icns"
test -s "$mount_directory/.legal/LICENSE"
test -s "$mount_directory/.legal/NOTICE"

app_bundle="$mount_directory/Acloud Playrooms.app"
plutil -lint "$app_bundle/Contents/Info.plist"
test -s "$app_bundle/Contents/Resources/icons.icns"
lipo "$app_bundle/Contents/MacOS/Acloud Playrooms" -verify_arch arm64 x86_64
codesign --verify --deep --strict "$app_bundle"
for field in CFBundleShortVersionString CFBundleVersion; do
  actual_version="$(/usr/libexec/PlistBuddy -c "Print :$field" "$app_bundle/Contents/Info.plist")"
  test "$actual_version" = "$expected_version"
done

# Parse the persisted Finder settings directly, including the background alias.
"$dmg_python" "$dmg_repository/scripts/dmg-layout.py" verify "$mount_directory"

echo "Verified $image"
