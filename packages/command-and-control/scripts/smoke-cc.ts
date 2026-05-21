/**
 * Live smoke test for Command & Control.
 * Run with: npx tsx scripts/smoke-cc.ts
 *
 * Requires real ITM 370 archives at the paths in ARCHIVES below.
 * Uses a temp CC_HOME and CURRICULUM_INTELLIGENCE_HOME.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCc } from '../src/tools/setup_cc.js';
import { getCcStatus } from '../src/tools/get_cc_status.js';
import { analyzeCourse } from '../src/tools/workflows/analyze_course.js';
import { planNextSemester } from '../src/tools/workflows/plan_next_semester.js';
import { exportCourseFolder } from 'curriculum-intelligence-mcp/dist/tools/export_course_folder.js';
import { setupCourse } from 'curriculum-intelligence-mcp/dist/tools/setup_course.js';

const SOURCE_SEM = 'Spring2026';
const TARGET_SEM = 'Fall2026';
const COURSE_ID = 'ITM370';
const ARCHIVE_PATH = 'D:/CanvasArchive/2026/Spring/Sp26 - ITM 370 - AI Augmented Projects (Rank)';

const tmpHome = mkdtempSync(join(tmpdir(), 'cc-smoke-'));
process.env.CC_HOME = tmpHome;
process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;

function hr(label = '') {
  const line = '─'.repeat(60);
  console.log(label ? `\n${line}\n${label}\n${line}` : line);
}

try {
  hr('COMMAND & CONTROL — Smoke Test');
  console.log(`Temp home: ${tmpHome}\n`);

  // Step 1: setup
  setupCourse({ id: COURSE_ID, title: 'ITM 370 — AI-Augmented Projects' });
  setupCc({ mode: 'easy' });
  console.log('✓ setup_course + setup_cc');

  // Step 2: status
  const status = await getCcStatus();
  console.log('\nStatus:');
  console.log(`  mode: ${status.mode}`);
  console.log(`  anthropic key present: ${status.providers.anthropic.keyPresent}`);
  console.log(`  ollama: ${status.providers.ollama ? `${status.providers.ollama.baseUrl} (reachable=${status.providers.ollama.reachable})` : 'not configured'}`);
  console.log(`  ci installed: ${status.installedPackages.ci}`);
  console.log('✓ get_cc_status');

  // Step 3: analyze_course
  hr('analyze_course');
  const analysis = await analyzeCourse({ courseId: COURSE_ID, semesterId: SOURCE_SEM, archivePath: ARCHIVE_PATH });
  console.log(`  ingest: modules=${(analysis.ingest as Record<string, number>).moduleCount} assignments=${(analysis.ingest as Record<string, number>).assignmentCount}`);
  console.log('✓ analyze_course complete');

  // Step 4: plan_next_semester
  hr('plan_next_semester');
  const plan = await planNextSemester({
    courseId: COURSE_ID,
    sourceSemesterId: SOURCE_SEM,
    newSemesterId: TARGET_SEM,
    semesterPattern: TARGET_SEM,
    onBreakCollision: 'flag',
  });
  console.log(`  shell: ${(plan.shell as Record<string, number>).briefsCreated} briefs`);
  console.log(`  shift: ${(plan.shift as Record<string, number>).shiftsApplied} dates shifted, ${(plan.shift as Record<string, number>).collisions} flagged`);
  console.log(`  outline: ${(plan.outline as { topics: unknown[] }).topics.length} weeks`);
  console.log('✓ plan_next_semester complete');

  // Step 5: export
  hr('export');
  const exportResult = exportCourseFolder({ courseId: COURSE_ID, semesterId: TARGET_SEM });
  console.log(`✓ export_course_folder: ${exportResult.outputPaths[0]}`);

  hr('DONE');
  console.log('All smoke steps passed.\n');
} finally {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
}
