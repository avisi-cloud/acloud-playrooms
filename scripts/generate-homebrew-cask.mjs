import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

// GoReleaser OSS generates binary casks; a Wails .app needs an app stanza.
const metadata = JSON.parse(readFileSync('dist/metadata.json', 'utf8'));
const artifacts = JSON.parse(readFileSync('dist/artifacts.json', 'utf8'));
const archives = artifacts.filter(
  (artifact) => artifact.type === 'Archive' && artifact.name.endsWith('_darwin_universal.zip'),
);
if (archives.length !== 1) {
  throw new Error(`Expected one universal macOS archive, found ${archives.length}`);
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(metadata.version)) {
  throw new Error(`Invalid release version: ${metadata.version}`);
}
const archive = archives[0];
const checksum = createHash('sha256').update(readFileSync(archive.path)).digest('hex');
const filename = basename(archive.path);
if (filename !== `acloud-playrooms_${metadata.version}_darwin_universal.zip`) {
  throw new Error(`Unexpected archive filename: ${filename}`);
}

const cask = `cask "acloud-playrooms" do
  version "${metadata.version}"
  sha256 "${checksum}"

  url "https://github.com/avisi-cloud/acloud-playrooms/releases/download/v#{version}/acloud-playrooms_#{version}_darwin_universal.zip"
  name "Acloud Playrooms"
  desc "Desktop interface for Acloud AI development environments"
  homepage "https://github.com/avisi-cloud/acloud-playrooms"

  depends_on macos: ">= :monterey"

  app "Acloud Playrooms.app"

  # This app is ad-hoc signed, but not Apple-notarized.
  # Remove quarantine only from this installed app, as in acloud-toolkit.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Acloud Playrooms.app"]
  end

  caveats <<~EOS
    Requires the acloud CLI and an Acloud account.
    Install the CLI with: brew install --cask avisi-cloud/tools/acloud
    Then sign in with: acloud auth login
  EOS
end
`;

mkdirSync('dist/homebrew', { recursive: true });
writeFileSync('dist/homebrew/acloud-playrooms.rb', cask);
console.log(`Generated Homebrew cask for ${metadata.version} (${checksum}).`);
