#!/usr/bin/env bash
set -euo pipefail

# Usage: bash scripts/package-dmg.sh VERSION [OUTPUT_DIRECTORY]
# Packages the existing universal app; it does not rebuild or change its signature.
cd "$(dirname "$0")/.."
version="${1:?Usage: package-dmg.sh VERSION [OUTPUT_DIRECTORY]}"
output_directory="${2:-bin}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid application version: $version" >&2
  exit 1
fi
if [ "$(uname -s)" != Darwin ] || ! command -v create-dmg >/dev/null 2>&1; then
  echo 'DMG packaging requires macOS and create-dmg (brew install create-dmg).' >&2
  exit 1
fi

source "scripts/dmg-tools.sh"
"$dmg_python" scripts/test-dmg-layout.py

app_bundle='bin/Acloud Playrooms.app'
test -f build/darwin/dmg/background.tiff
lipo "$app_bundle/Contents/MacOS/Acloud Playrooms" -verify_arch arm64 x86_64
codesign --verify --deep --strict "$app_bundle"
bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_bundle/Contents/Info.plist")"
if [ "$bundle_version" != "$version" ]; then
  echo "App version $bundle_version does not match DMG version $version. Rebuild the app first." >&2
  exit 1
fi

mkdir -p "$output_directory"
output_directory="$(cd "$output_directory" && pwd)"
work_directory="$(mktemp -d "${TMPDIR:-/tmp}/acloud-dmg.XXXXXXXX")"
work_directory="$(cd "$work_directory" && pwd -P)"
cleanup() {
  local status=$?
  trap - EXIT
  # create-dmg normally detaches its image. Recover mounts from an interrupted
  # invocation too, identifying only images created inside this unique directory.
  local mounted_volumes mounted_volume
  if mounted_volumes="$(hdiutil info -plist | plutil -convert json -o - - | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      for (const image of JSON.parse(input).images ?? []) {
        if (!(image["image-path"] ?? "").startsWith(process.argv[1] + "/")) continue;
        for (const entity of image["system-entities"] ?? []) {
          if (entity["mount-point"]) console.log(entity["mount-point"]);
        }
      }
    });
  ' "$work_directory")"; then
    while IFS= read -r mounted_volume; do
      [ -n "$mounted_volume" ] || continue
      if ! hdiutil detach "$mounted_volume" && ! hdiutil detach -force "$mounted_volume"; then
        echo "Could not detach $mounted_volume; temporary files retained at $work_directory." >&2
        exit 1
      fi
    done <<< "$mounted_volumes"
    rm -rf "$work_directory"
  else
    echo "Could not inspect disk images; temporary files retained at $work_directory." >&2
    exit 1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$work_directory/source/.legal"
ditto "$app_bundle" "$work_directory/source/Acloud Playrooms.app"
cp LICENSE NOTICE "$work_directory/source/.legal/"

# Create the writable image without Finder automation, then write the full
# branded layout directly before compression. No Finder access is required.
create-dmg \
  --volname 'Acloud Playrooms' \
  --volicon build/darwin/icons.icns \
  --background build/darwin/dmg/background.tiff \
  --app-drop-link 530 283 \
  --skip-jenkins \
  --skip-finalize \
  "$work_directory/writable.dmg" \
  "$work_directory/source"

mkdir "$work_directory/mounted"
hdiutil attach -readwrite -nobrowse -noautoopen -mountpoint "$work_directory/mounted" "$work_directory/writable.dmg"
echo 'Applying branded window layout directly (no Finder automation)...'
"$dmg_python" scripts/dmg-layout.py write "$work_directory/mounted"
hdiutil detach "$work_directory/mounted"
hdiutil convert "$work_directory/writable.dmg" -format UDZO -o "$work_directory/installer.dmg"

destination="$output_directory/acloud-playrooms_${version}_darwin_universal.dmg"
mv -f "$work_directory/installer.dmg" "$destination"
echo "Created $destination"
if hdiutil info -plist | plutil -convert json -o - - | node -e '
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => process.exit(
    (JSON.parse(input).images ?? []).some(image => image["image-path"] === process.argv[1]) ? 0 : 1
  ));
' "$destination"; then
  echo 'An older copy is still mounted. Eject all Acloud Playrooms disks before opening this DMG.'
fi
