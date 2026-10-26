#!/usr/bin/env node
/**
 * check-app-paths.mjs — CI guard (CT200-09; spec docs/specs/2026-10-18-paths-and-module-credentials.md §4.1, §7).
 *
 * App-home folders must be resolved through the one resolver
 * (`packages/shared-types/src/app-paths.ts`, Go twin `installer/tasks/apppaths.go`), never hand-rolled.
 *
 * Fails when a non-test file under packages/*​/src, scripts/ or installer/ calls `homedir()` /
 * `os.UserHomeDir()` AND
 *   (a) names one of the legacy app folders, or
 *   (b) joins the home dir with a dot-folder, or
 *   (c) assigns a home dir to a top-level `const` (evaluated at import time, before migration).
 *
 * Usage:
 *   node scripts/check-app-paths.mjs              scan the repo
 *   node scripts/check-app-paths.mjs --self-test  verify the matcher against planted cases
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Explicit allowlist: every entry carries a reason. Entries may be exact paths or globs (`*` = within one segment). */
export const ALLOWLIST = [
  { pattern: 'packages/shared-types/src/app-paths.ts', reason: 'the TypeScript resolver itself' },
  { pattern: 'installer/tasks/apppaths.go', reason: 'the Go twin of the resolver' },
  { pattern: 'packages/command-and-control/src/setup/hosts.ts', reason: 'host detection: locates other MCP clients’ configs under the home dir' },
  { pattern: 'installer/tasks/mcphost.go', reason: 'host detection: locates other MCP clients’ configs under the home dir' },
  { pattern: 'installer/tasks/shortcuts_windows.go', reason: 'Windows shortcut placement (Desktop/Start menu), not an app home' },
  { pattern: 'packages/command-and-control/src/passthrough/canvas_backup_config.ts', reason: '~/CanvasArchive is Canvas Backup’s archive root, not an app home' },
  { pattern: 'scripts/verify-*.mts', reason: 'maintainer-run manual verification scripts: not shipped, not in CI, macOS-only where the legacy path is still correct' },
  { pattern: 'packages/module-announcements/src/canvas.ts', reason: 'TEMPORARY: source cannot change before the release (spec §5.4); removed by CT201-12' },
  { pattern: 'scripts/check-app-paths.mjs', reason: 'this guard contains the patterns it searches for' },
];

const LEGACY_NAMES = ['command-and-control', 'canvas-design-studio', 'canvas-design-mcp', 'curriculum-intelligence'];
const HOME_CALL = /\bhomedir\s*\(|\bos\.UserHomeDir\s*\(/;
const LEGACY_RE = new RegExp(`\\.(?:${LEGACY_NAMES.join('|')})\\b`);
const TS_DOT_JOIN = /(?:homedir\s*\(\s*\)|UserHomeDir\s*\(\s*\))[^\n]*['"`]\.[A-Za-z]/;
const GO_DOT_JOIN = /Join\(\s*home\s*,[^\n]*"\.[A-Za-z]/;
const TOP_LEVEL_CONST = /^(?:export\s+)?(?:const|let|var)\s+\w+[^=\n]*=.*\b(?:homedir\s*\(|os\.UserHomeDir\s*\()/;
const GO_TOP_LEVEL = /^var\s+\w+[^=\n]*=.*\bos\.UserHomeDir\s*\(/;

function globToRegex(g) {
  const esc = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${esc}$`);
}

export function allowlistReason(relPath, allowlist = ALLOWLIST) {
  const p = relPath.split(sep).join('/');
  const hit = allowlist.find((e) => globToRegex(e.pattern).test(p));
  return hit ? hit.reason : null;
}

/** Classify one file's text. Returns violations as `{ line, rule, text }`; allowlisted files return []. */
export function classify(relPath, text, allowlist = ALLOWLIST) {
  if (allowlistReason(relPath, allowlist)) return [];
  const isGo = relPath.endsWith('.go');
  const lines = text.split(/\r?\n/);
  const fileHasHome = lines.some((l) => !isComment(l, isGo) && HOME_CALL.test(l));
  if (!fileHasHome) return [];
  const out = [];
  lines.forEach((raw, i) => {
    if (isComment(raw, isGo)) return;
    const add = (rule) => out.push({ line: i + 1, rule, text: raw.trim().slice(0, 160) });
    if (LEGACY_RE.test(raw)) add('names a legacy app folder alongside a home-dir lookup');
    else if (TS_DOT_JOIN.test(raw) || (isGo && GO_DOT_JOIN.test(raw))) add('joins the home dir with a dot-folder');
    if (TOP_LEVEL_CONST.test(raw) || (isGo && GO_TOP_LEVEL.test(raw))) add('top-level home-dir constant (evaluated at import time)');
  });
  return out;
}

function isComment(line, isGo) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || (!isGo && t.startsWith('#'));
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'tests', 'test', '__tests__', 'fixtures']);
const EXT = /\.(ts|mts|mjs|js|go)$/;
const TEST_FILE = /(\.test\.|\.spec\.|_test\.go$)/;

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(full);
    } else if (EXT.test(name) && !TEST_FILE.test(name) && !name.endsWith('.d.ts')) {
      yield full;
    }
  }
}

function scanRoots() {
  const roots = [join(ROOT, 'scripts'), join(ROOT, 'installer')];
  for (const pkg of readdirSync(join(ROOT, 'packages'))) roots.push(join(ROOT, 'packages', pkg, 'src'));
  return roots;
}

function selfTest() {
  const cases = [
    ['TS legacy folder', 'packages/x/src/a.ts', "const p = join(homedir(), '.command-and-control');", true],
    ['TS legacy folder via env fallback (indented)', 'packages/x/src/a.ts', "  return process.env.CC_HOME ?? join(homedir(), '.canvas-design-studio');", true],
    ['TS generic dot-folder', 'packages/x/src/a.ts', "export function f() { return join(homedir(), '.somethingelse', 'x'); }", true],
    ['Go legacy folder', 'installer/tasks/x.go', 'home, _ := os.UserHomeDir()\nreturn filepath.Join(home, ".canvas-design-mcp")', true],
    ['Go generic dot-folder', 'installer/tasks/x.go', 'home, _ := os.UserHomeDir()\np := filepath.Join(home, ".cache")', true],
    ['TS top-level homedir const', 'packages/x/src/a.ts', 'const HOME = homedir();\nexport const f = () => HOME;', true],
    ['Go top-level var', 'installer/tasks/x.go', 'var home, _ = os.UserHomeDir()', true],
    ['allowlisted: resolver', 'packages/shared-types/src/app-paths.ts', "join(homedir(), '.command-and-control')", false],
    ['allowlisted: Go resolver', 'installer/tasks/apppaths.go', 'home, _ = os.UserHomeDir()\nfilepath.Join(home, ".command-and-control")', false],
    ['allowlisted: glob verify script', 'scripts/verify-88-foo.mts', "const c = join(homedir(), '.command-and-control', 'canvas-config.json');", false],
    ['allowlisted: temporary announcements entry', 'packages/module-announcements/src/canvas.ts', "join(homedir(), '.command-and-control')", false],
    ['look-alike: glob does not leak to other scripts', 'scripts/other.mts', "join(homedir(), '.command-and-control')", true],
    ['look-alike: glob does not leak across directories', 'scripts/sub/verify-1.mts', "join(homedir(), '.command-and-control')", true],
    ['look-alike: similarly named file is not allowlisted', 'packages/x/src/hosts.ts', "join(homedir(), '.command-and-control')", true],
    ['clean: non-dot folder under home', 'packages/x/src/a.ts', "join(homedir(), 'CanvasArchive')", false],
    ['clean: legacy name in a string, no home lookup', 'packages/x/src/a.ts', "const legacy = '.command-and-control';", false],
    ['clean: legacy name only in a comment', 'packages/x/src/a.ts', "// was join(homedir(), '.command-and-control')\nconst x = 1;", false],
    ['clean: indented homedir() is not top-level', 'packages/x/src/a.ts', '  const h = homedir();\n  return h;', false],
  ];
  let bad = 0;
  for (const [name, path, text, expectViolation] of cases) {
    const got = classify(path, text).length > 0;
    const ok = got === expectViolation;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (expected ${expectViolation ? 'violation' : 'clean'}, got ${got ? 'violation' : 'clean'})`);
  }
  // Every allowlist entry must carry a reason, and the removal marker must stay on the temporary entry.
  for (const e of ALLOWLIST) {
    if (!e.reason || !e.reason.trim()) { bad++; console.log(`FAIL allowlist entry without reason: ${e.pattern}`); }
  }
  const temp = ALLOWLIST.find((e) => e.pattern === 'packages/module-announcements/src/canvas.ts');
  if (!temp || !temp.reason.includes('removed by CT201-12')) { bad++; console.log('FAIL temporary announcements entry missing or not marked'); }
  console.log(bad === 0 ? `self-test passed (${cases.length} cases)` : `self-test FAILED (${bad})`);
  return bad === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  let bad = 0;
  let scanned = 0;
  for (const root of scanRoots()) {
    for (const file of walk(root)) {
      scanned++;
      const rel = relative(ROOT, file).split(sep).join('/');
      for (const v of classify(rel, readFileSync(file, 'utf8'))) {
        bad++;
        console.error(`${rel}:${v.line}: ${v.rule}\n    ${v.text}`);
      }
    }
  }
  if (bad) {
    console.error(`\ncheck-app-paths: ${bad} violation(s). Resolve app homes via shared-types app-paths (or installer/tasks/apppaths.go); do not hand-roll them.`);
    process.exit(1);
  }
  console.log(`check-app-paths: clean (${scanned} files scanned)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
