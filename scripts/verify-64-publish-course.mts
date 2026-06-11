/**
 * #64 verification driver — Phase A smoke test of publish_course against a real
 * Canvas course. Bypasses Claude Code's MCP filter (which only surfaces 27 of the
 * 78 C&C tools) by importing the workflow functions directly.
 *
 * USAGE
 *   tsx scripts/verify-64-publish-course.mts preview
 *   tsx scripts/verify-64-publish-course.mts publish <snapshotId>
 *   tsx scripts/verify-64-publish-course.mts rollback <snapshotId>
 *
 * ENV
 *   COURSE_ID           Canvas course numeric ID. Default 48895 (the professor's BusApp 105 sandbox).
 *   COURSE_DIR          Path to a CDS course folder. Default ./.test-course-64 (auto-created).
 *   CANVAS_CONFIG_PATH  Override location of canvas-config.json. Default ~/.command-and-control/canvas-config.json.
 *
 * PREREQ
 *   Write Canvas credentials to ~/.command-and-control/canvas-config.json:
 *     {
 *       "host": "example.instructure.com",
 *       "token": "<paste your Canvas access token>",
 *       "configuredAt": "2026-05-30T00:00:00Z",
 *       "lastValidatedAt": "2026-05-30T00:00:00Z"
 *     }
 *   Generate the token at: Canvas → Account → Settings → "+ New Access Token".
 *   File permissions on Unix should be 0o600. Windows: ACL or just leave it.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { previewCoursePublish } from '../packages/command-and-control/dist/tools/workflows/preview_course_publish.js';
import { publishCourse } from '../packages/command-and-control/dist/tools/workflows/publish_course.js';
import { rollbackCoursePublish } from '../packages/command-and-control/dist/tools/workflows/rollback_course_publish.js';

const COURSE_ID = Number(process.env.COURSE_ID ?? 48895);
const COURSE_DIR = resolve(process.env.COURSE_DIR ?? '.test-course-64');
const CANVAS_CONFIG_PATH =
  process.env.CANVAS_CONFIG_PATH ?? join(homedir(), '.command-and-control', 'canvas-config.json');

function bail(msg: string, fix?: string[]): never {
  console.error(`\n[fatal] ${msg}`);
  if (fix?.length) {
    console.error('\nFix:');
    for (const f of fix) console.error(`  - ${f}`);
  }
  process.exit(1);
}

function ensureCanvasConfig(): void {
  if (existsSync(CANVAS_CONFIG_PATH)) return;
  bail(
    `Canvas config not found at ${CANVAS_CONFIG_PATH}.`,
    [
      'Create the file with this shape (paste your Canvas access token):',
      '  {',
      '    "host": "example.instructure.com",',
      '    "token": "<paste here>",',
      '    "configuredAt": "2026-05-30T00:00:00Z",',
      '    "lastValidatedAt": "2026-05-30T00:00:00Z"',
      '  }',
      'Get the token at: Canvas → Account → Settings → + New Access Token.',
    ],
  );
}

function ensureSandboxCourse(): void {
  if (existsSync(join(COURSE_DIR, 'course-config.md'))) return;
  console.log(`[setup] Creating sandbox course folder at ${COURSE_DIR}`);
  mkdirSync(join(COURSE_DIR, 'week-01'), { recursive: true });
  writeFileSync(
    join(COURSE_DIR, 'course-config.md'),
    [
      '---',
      'institution: Example University',
      'course_name: BusApp 105 — Sandbox Test',
      'course_number: BUSAPP 105',
      'professor: Dr. Rank',
      'semester: Summer 2026',
      'weeks: 1',
      '',
      'page_types:',
      '  - overview',
      '',
      'layout_fixed: true',
      '',
      'colors:',
      '  primary: ""',
      '  secondary: ""',
      '',
      'hero_images:',
      '  overview: ""',
      '---',
      '',
      '## Week Outline',
      '',
      '| Week | Title | Topic |',
      '|------|-------|-------|',
      '| 01 | Sandbox | publish_course smoke test |',
      '',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(COURSE_DIR, 'week-01', 'overview.md'),
    [
      '---',
      'week: 1',
      'title: "publish_course Smoke Test — Phase A"',
      'hero_image: ""',
      '---',
      '',
      '## What This Is',
      '',
      'A one-page sandbox test of canvas-toolchain\'s publish_course workflow against a real University Canvas course.',
      'If you are reading this in Canvas, preview → publish wrote successfully.',
      '',
      '## Next Step',
      '',
      'Run rollback_course_publish with the snapshot ID printed by the driver to restore the prior page state and remove this content.',
      '',
    ].join('\n'),
    'utf-8',
  );
  console.log(`[setup] Sandbox course folder ready.`);
}

function fmtManifestSummary(manifest: any): string {
  const s = manifest.summary;
  const lines = [
    `snapshotId:        ${manifest.snapshotId}`,
    `courseId:          ${manifest.courseId}`,
    `generatedAt:       ${manifest.generatedAt}`,
    `git:               ${JSON.stringify(manifest.git)}`,
    `staleSnapshot:     ${manifest.staleSnapshot ? manifest.staleSnapshot.snapshotId : '(none)'}`,
    `summary:`,
    `  total:           ${s.total}`,
    `  pages:           ${s.pages}`,
    `  assignments:     ${s.assignments}`,
    `  skipped:         ${s.skipped}`,
    `  warningsCount:   ${s.warningsCount}`,
    `  ferpaCount:      ${s.ferpaCount}`,
    `  collisionsCount: ${s.collisionsCount}`,
    `entries:`,
  ];
  for (const e of manifest.entries) {
    if (e.type === 'skipped') {
      lines.push(`  - SKIPPED  ${e.filename}  (${e.reason})  ${e.recommendation ?? ''}`);
    } else {
      const match = e.canvasMatch
        ? (e.type === 'page'
          ? `→ ${e.canvasMatch.existingTitle} (sim ${e.canvasMatch.similarity.toFixed(2)})`
          : `→ ${e.canvasMatch.name} (sim ${e.canvasMatch.similarity.toFixed(2)})`)
        : '(no Canvas match — would create new)';
      const action = e.type === 'page' ? e.collisionAction : 'update';
      lines.push(
        `  - ${e.type.toUpperCase()}  ${e.filename}  intendedTitle="${e.intendedTitle}"  action=${action}  ${match}`,
      );
      lines.push(
        `      diff: words ${e.diff.priorWords ?? 'NEW'}→${e.diff.newWords} (Δ${e.diff.delta}), sections Δ${e.diff.sectionsChanged}, callouts +${e.diff.calloutsAdded}/-${e.diff.calloutsRemoved}, images Δ${e.diff.imagesChanged}`,
      );
      if (e.warnings?.length) {
        for (const w of e.warnings) {
          lines.push(`      [${w.severity.toUpperCase()} ${w.kind}] ${w.message}`);
        }
      }
    }
  }
  return lines.join('\n');
}

async function runPreview() {
  ensureCanvasConfig();
  ensureSandboxCourse();
  console.log(`[preview] courseDir=${COURSE_DIR}  courseId=${COURSE_ID}`);
  const r = await previewCoursePublish({ courseDir: COURSE_DIR, courseId: COURSE_ID });
  if (r.error) bail(`preview failed: ${r.error} — ${r.message}`, r.fix);
  console.log('\n=== PREVIEW MANIFEST ===');
  console.log(fmtManifestSummary(r.manifest!));
  console.log('\n=== NEXT ===');
  console.log(`Inspect the entries above. To publish all entries, run:`);
  console.log(`  tsx scripts/verify-64-publish-course.mts publish ${r.snapshotId}`);
  console.log(`To roll back after publishing, run:`);
  console.log(`  tsx scripts/verify-64-publish-course.mts rollback ${r.snapshotId}`);
}

async function runPublish(snapshotId: string) {
  ensureCanvasConfig();
  // Auto-approve every non-skipped entry from the manifest.
  const cfgPath = join(homedir(), '.command-and-control', 'publish-snapshots', snapshotId, 'manifest.json');
  if (!existsSync(cfgPath)) bail(`Snapshot manifest not found at ${cfgPath}.`);
  const manifest = JSON.parse(readFileSync(cfgPath, 'utf-8'));
  const approvals: Record<string, 'approve' | 'skip'> = {};
  for (const e of manifest.entries) {
    if (e.type !== 'skipped') approvals[e.filename] = 'approve';
  }
  console.log(`[publish] snapshotId=${snapshotId}  approving ${Object.keys(approvals).length} entries`);
  const r = await publishCourse({ snapshotId, approvals, gitCommit: false, pushTag: false });
  console.log('\n=== PUBLISH RESULT ===');
  console.log(`phase:     ${r.phase}`);
  console.log(`published: ${r.published.length} entries`);
  for (const p of r.published) console.log(`  - ${p.action}  ${p.filename}  ${p.canvasUrl ?? ''}`);
  if (r.failed) {
    console.log(`\nFAILED at: ${r.failed.filename}`);
    console.log(`  code:    ${r.failed.code}`);
    console.log(`  reason:  ${r.failed.reason}`);
  }
  if (r.error) bail(`publish error: ${r.error} — ${r.message ?? ''}`, r.fix);
  console.log('\n=== NEXT ===');
  console.log(`Verify the page in Canvas: https://example.instructure.com/courses/${COURSE_ID}`);
  console.log(`Roll back with:`);
  console.log(`  tsx scripts/verify-64-publish-course.mts rollback ${snapshotId}`);
}

async function runRollback(snapshotId: string) {
  ensureCanvasConfig();
  console.log(`[rollback] snapshotId=${snapshotId}`);
  const r = await rollbackCoursePublish({ snapshotId });
  console.log('\n=== ROLLBACK RESULT ===');
  console.log(`phase:    ${r.phase}`);
  console.log(`restored: ${r.restored.length}`);
  for (const p of r.restored) console.log(`  - ${p.filename}`);
  if (r.restoreFailed.length) {
    console.log(`\nFailures (${r.restoreFailed.length}):`);
    for (const f of r.restoreFailed) console.log(`  - ${f.filename}: ${f.reason}`);
  }
  if (r.error) bail(`rollback error: ${r.error}`, r.fix);
}

const [cmd, arg] = process.argv.slice(2);
const main = async () => {
  switch (cmd) {
    case 'preview':  return runPreview();
    case 'publish':  if (!arg) bail('Usage: publish <snapshotId>'); return runPublish(arg);
    case 'rollback': if (!arg) bail('Usage: rollback <snapshotId>'); return runRollback(arg);
    default:
      console.error('Usage: tsx scripts/verify-64-publish-course.mts <preview|publish|rollback> [snapshotId]');
      process.exit(2);
  }
};
main().catch((e) => bail(e instanceof Error ? e.stack ?? e.message : String(e)));
