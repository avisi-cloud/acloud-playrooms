import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Run after GoReleaser, which has already built and versioned the universal app.
const { version } = JSON.parse(readFileSync('dist/metadata.json', 'utf8'));
execFileSync('bash', ['scripts/package-dmg.sh', version, 'dist'], { stdio: 'inherit' });

const filename = `acloud-playrooms_${version}_darwin_universal.dmg`;
const checksum = createHash('sha256')
  .update(readFileSync(`dist/${filename}`))
  .digest('hex');
const checksums = readFileSync('dist/checksums.txt', 'utf8')
  .split('\n')
  .filter((line) => line.trim() && !line.trimEnd().endsWith(`  ${filename}`));
// Replacing this entry makes reruns safe without altering GoReleaser's ZIP hash.
checksums.push(`${checksum}  ${filename}`);
writeFileSync('dist/checksums.txt', `${checksums.join('\n')}\n`);
