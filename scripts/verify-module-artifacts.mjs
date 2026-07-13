#!/usr/bin/env node
// Verifies that every module artifact committed under modules/ is exactly what the
// catalog pins AND exactly what the source builds. A GitHub Release asset could
// never be checked this way: it existed only after it was already public.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

const catalog = JSON.parse(readFileSync('module-catalog.json', 'utf-8'));

for (const entry of catalog.modules) {
  const { id, version, sha256: expected, sizeBytes, artifactUrl } = entry;
  const rel = join('modules', id, version, `${id}-${version}.mjs`);

  const expectedUrl =
    `https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/${id}/${version}/${id}-${version}.mjs`;
  if (artifactUrl !== expectedUrl) {
    fail(`${id} v${version}: artifactUrl does not match its file location.\n  catalog: ${artifactUrl}\n  expected: ${expectedUrl}`);
    continue;
  }

  if (!existsSync(rel)) {
    fail(`${id} v${version}: catalog references ${rel}, which is not committed.`);
    continue;
  }

  const committed = readFileSync(rel);
  const committedHash = sha256(committed);
  if (committedHash !== expected) {
    fail(`${id} v${version}: committed artifact hash does not match the catalog.\n  catalog:   ${expected}\n  committed: ${committedHash}`);
    continue;
  }
  if (committed.byteLength !== sizeBytes) {
    fail(`${id} v${version}: catalog sizeBytes is ${sizeBytes}, committed file is ${committed.byteLength}.`);
    continue;
  }

  execFileSync('npm', ['run', 'build:module', '--silent', '--', id], { stdio: 'pipe', shell: process.platform === 'win32' });
  const built = readFileSync(join('dist-channel', `module-${id}-${version}.mjs`));
  if (sha256(built) !== committedHash) {
    fail(`${id} v${version}: committed artifact is NOT what the source builds.\n  built:     ${sha256(built)}\n  committed: ${committedHash}\nRebuild and recommit the artifact.`);
    continue;
  }

  console.log(`ok: ${id} v${version} — committed == built == catalog (${committedHash.slice(0, 12)}…)`);
}

if (process.exitCode === 1) {
  console.error('\nModule artifact verification failed. The catalog is the trust root; it must never point at bytes nobody can reproduce.');
}
