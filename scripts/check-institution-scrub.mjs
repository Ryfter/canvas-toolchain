#!/usr/bin/env node
// check-institution-scrub.mjs — fails the build if institution identifiers
// re-enter the public tree. Lines that are themselves grep/guard commands
// (historical plan docs quoting the rule) are exempt; so is this script.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERN = /boise|(?<![\w@])bsu(?![\w])/i;
const LINE_EXEMPT = /\bgr[e]p\b|check-institution-scrub/i; // guard cmds quoting the rule
const FILE_SKIP = /^(package-lock\.json|scripts\/check-institution-scrub\.mjs)$|\.(png|svg|ico|pkg|exe|excalidraw)$/;

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !FILE_SKIP.test(f));

const hits = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (text.includes('\u0000')) continue; // binary
  text.split('\n').forEach((line, i) => {
    if (PATTERN.test(line) && !LINE_EXEMPT.test(line)) {
      hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}

if (hits.length) {
  console.error(`Institution scrub FAILED — ${hits.length} hit(s):`);
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log(`Institution scrub clean (${files.length} files checked).`);
