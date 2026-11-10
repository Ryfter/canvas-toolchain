#!/usr/bin/env node
// check-release-notes.mjs — fails when the release notes at the top of
// .github/RELEASE_TEMPLATE/installer-release.md do not name the version the
// repo is at. The installer workflow publishes that file as the GitHub
// Release body, so a stale top section ships the wrong notes (v2.2.0 to v2.3.0
// all went out carrying the v2.1.0 text). Pass a version or tag to check
// against instead of the root package.json version. `--self-test` runs the
// built-in cases.
import { readFileSync } from 'node:fs';

const TEMPLATE = '.github/RELEASE_TEMPLATE/installer-release.md';

/** The version named by the first "## What's new in vX.Y.Z" heading, or null. */
export function topNotesVersion(text) {
  const m = /^## What's new in v(\d+\.\d+\.\d+)\s*$/m.exec(text);
  return m ? m[1] : null;
}

export function check(text, expected) {
  const want = expected.replace(/^v/, '');
  const top = topNotesVersion(text);
  if (top === null) return `no "## What's new in vX.Y.Z" section found in ${TEMPLATE}`;
  if (top !== want) {
    return `release notes top section is v${top} but the repo is at v${want}; add "## What's new in v${want}" at the top of ${TEMPLATE}`;
  }
  return null;
}

function selfTest() {
  const ok = "# T\n\n## What's new in v2.4.2\n\nx\n\n## What's new in v2.4.1\n";
  const cases = [
    [check(ok, '2.4.2'), null],
    [check(ok, 'v2.4.2'), null],
    [check(ok, '2.4.3') !== null, true],
    [check('# T\n', '2.4.2') !== null, true],
    [topNotesVersion("## What's new in v10.0.1\n"), '10.0.1'],
  ];
  const bad = cases.filter(([got, want]) => got !== want);
  if (bad.length) { console.error('self-test failed', bad); process.exit(1); }
  console.log('self-test ok');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const expected = arg ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
  const problem = check(readFileSync(TEMPLATE, 'utf8'), expected);
  if (problem) { console.error(`release notes guard: ${problem}`); process.exit(1); }
  console.log(`release notes guard: top section is v${expected.replace(/^v/, '')}`);
}
