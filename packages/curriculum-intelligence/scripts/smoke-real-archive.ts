/**
 * Live smoke test against real ITM 370 Canvas archives.
 * Run with: npx tsx scripts/smoke-real-archive.ts
 *
 * Uses a temp CURRICULUM_INTELLIGENCE_HOME so it does not touch
 * the production app state. Prints a full report to stdout.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { setupCourse } from '../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../src/tools/ingest_canvas_archive.js';
import { diffSemesters } from '../src/tools/diff_semesters.js';
import { listAssignments } from '../src/tools/list_assignments.js';
import { listModules } from '../src/tools/list_modules.js';
import { listResources } from '../src/tools/list_resources.js';
import { importPreviousShell } from '../src/tools/import_previous_shell.js';
import { fetchAcademicCalendar } from '../src/tools/fetch_academic_calendar.js';
import { shiftDates } from '../src/tools/shift_dates.js';
import { generateRecommendedOutline } from '../src/tools/generate_recommended_outline.js';
import { draftAssignmentBrief } from '../src/tools/draft_assignment_brief.js';
import { exportCourseFolder } from '../src/tools/export_course_folder.js';

// ── Archive map ───────────────────────────────────────────────────────────────

const ARCHIVES = [
  {
    semesterId: 'Fall2023',
    path: 'D:/CanvasArchive/2024/Fall/Fa23 - ITM 370 - AI Augmented Projects',
  },
  {
    semesterId: 'Fall2024',
    path: 'D:/CanvasArchive/2025/Fall/Fa24 - ITM 370- AI Augmented Projects',
  },
  {
    semesterId: 'Spring2025',
    path: 'D:/CanvasArchive/2025/Spring/Sp25 - ITM 370 - AI Augmented Projects',
  },
  {
    semesterId: 'Fall2025',
    path: 'D:/CanvasArchive/2026/Fall/Fa25 - ITM 370 - AI Augmented Projects',
  },
  {
    semesterId: 'Spring2026',
    path: 'D:/CanvasArchive/2026/Spring/Sp26 - ITM 370 - AI Augmented Projects (Rank)',
  },
];

const DIFFS: [string, string][] = [
  ['Fall2023', 'Fall2024'],
  ['Fall2024', 'Spring2025'],
  ['Spring2025', 'Fall2025'],
  ['Fall2025', 'Spring2026'],
];

const COURSE_ID = 'ITM370';

// ── Setup ─────────────────────────────────────────────────────────────────────

const tmpHome = mkdtempSync(join(tmpdir(), 'ci-smoke-'));
process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;

function hr(label = '') {
  const line = '─'.repeat(60);
  console.log(label ? `\n${line}\n${label}\n${line}` : line);
}

try {
  hr('CURRICULUM INTELLIGENCE — Live Smoke Test');
  console.log(`Temp home: ${tmpHome}\n`);

  setupCourse({ id: COURSE_ID, title: 'ITM 370 — AI-Augmented Projects' });
  console.log(`Course registered: ${COURSE_ID}\n`);

  // ── Ingest all semesters ──────────────────────────────────────────────────

  hr('INGEST');
  for (const { semesterId, path } of ARCHIVES) {
    try {
      const r = ingestCanvasArchive({ courseId: COURSE_ID, semesterId, archivePath: path });
      console.log(`${semesterId}`);
      console.log(`  modules=${r.moduleCount}  assignments=${r.assignmentCount}  pages=${r.pageCount}  resources=${r.resourceLinkCount}`);
    } catch (err) {
      console.error(`  ERROR ingesting ${semesterId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Per-semester detail ───────────────────────────────────────────────────

  for (const { semesterId } of ARCHIVES) {
    hr(`DETAIL — ${semesterId}`);

    try {
      const modules = listModules({ courseId: COURSE_ID, semesterId, expandItems: false });
      console.log('Modules:');
      for (const m of modules.modules) {
        console.log(`  ${String(m.position).padStart(2)}. ${m.name}  (${m.itemCount} items)`);
      }
    } catch (err) {
      console.log(`  modules: ${err instanceof Error ? err.message : err}`);
    }

    try {
      const assignments = listAssignments({ courseId: COURSE_ID, semesterId });
      console.log(`\nAssignments (${assignments.assignments.length}):`);
      for (const a of assignments.assignments) {
        const pts = a.pointsPossible != null ? ` [${a.pointsPossible}pts]` : '';
        const due = a.dueAt ? ` due ${a.dueAt.slice(0, 10)}` : '';
        console.log(`  - ${a.name}${pts}${due}`);
      }
    } catch (err) {
      console.log(`  assignments: ${err instanceof Error ? err.message : err}`);
    }

    try {
      const resources = listResources({ courseId: COURSE_ID, semesterId });
      console.log(`\nExternal resources (${resources.resources.length}):`);
      for (const r of resources.resources.slice(0, 8)) {
        console.log(`  - [${r.source}] ${r.text || '(no text)'} → ${r.url}`);
      }
      if (resources.resources.length > 8) {
        console.log(`  ... and ${resources.resources.length - 8} more`);
      }
    } catch (err) {
      console.log(`  resources: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Diffs ─────────────────────────────────────────────────────────────────

  hr('DIFFS');
  for (const [left, right] of DIFFS) {
    console.log(`\n${left} → ${right}`);
    try {
      const d = diffSemesters({ courseId: COURSE_ID, leftSemesterId: left, rightSemesterId: right });

      const modsAdded = d.modules.added.length;
      const modsRemoved = d.modules.removed.length;
      const assignAdded = d.assignments.added.length;
      const assignRemoved = d.assignments.removed.length;
      const assignReused = d.assignments.reusedVerbatim.length;
      const assignRewritten = d.assignments.rewritten.length;
      const pagesAdded = d.pages.added.length;
      const pagesRemoved = d.pages.removed.length;
      const pagesReused = d.pages.commonCount;

      console.log(`  Modules:     +${modsAdded} -${modsRemoved}`);
      console.log(`  Assignments: +${assignAdded} -${assignRemoved}  reused=${assignReused}  rewritten=${assignRewritten}`);
      console.log(`  Pages:       +${pagesAdded} -${pagesRemoved}  reused=${pagesReused}`);

      if (d.assignments.added.length) {
        console.log(`  Added assignments:`);
        for (const a of d.assignments.added) console.log(`    + ${a.name}`);
      }
      if (d.assignments.removed.length) {
        console.log(`  Removed assignments:`);
        for (const a of d.assignments.removed) console.log(`    - ${a.name}`);
      }
      if (d.assignments.rewritten.length) {
        console.log(`  Rewritten assignments:`);
        for (const a of d.assignments.rewritten) console.log(`    ~ ${a.name}`);
      }
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }

  hr('DONE — v0.6 Analysis');
  console.log('All archives ingested successfully. Check output above for anomalies.\n');

  // ── v1.0 pipeline smoke ───────────────────────────────────────────────────

  hr('v1.0 PIPELINE SMOKE');

  const semesters = ARCHIVES;
  const SOURCE_SEM = semesters[semesters.length - 1];
  const TARGET_SEM = 'Fall2026';

  console.log(`Planning ${COURSE_ID} ${TARGET_SEM} from source ${SOURCE_SEM.semesterId}...\n`);

  // Step 1: import shell
  const shellResult = importPreviousShell({
    courseId: COURSE_ID,
    sourceSemesterId: SOURCE_SEM.semesterId,
    newSemesterId: TARGET_SEM,
    source: 'archive',
  });
  console.log(`✓ import_previous_shell: ${shellResult.briefsCreated} briefs created`);

  // Step 2: calendar from semester pattern (no network required)
  await fetchAcademicCalendar({
    courseId: COURSE_ID,
    semesterId: TARGET_SEM,
    semesterPattern: TARGET_SEM,
  });
  console.log(`✓ fetch_academic_calendar: inferred from pattern`);

  // Step 3: shift dates
  const shiftResult = shiftDates({
    courseId: COURSE_ID,
    semesterId: TARGET_SEM,
    onBreakCollision: 'flag',
  });
  console.log(`✓ shift_dates: ${shiftResult.shiftsApplied} dates shifted, ${shiftResult.collisions} flagged`);

  // Step 4: generate outline
  const outlineResult = generateRecommendedOutline({ courseId: COURSE_ID, semesterId: TARGET_SEM });
  if (outlineResult.warning) console.log(`  ⚠ ${outlineResult.warning}`);
  console.log(`✓ generate_recommended_outline: ${outlineResult.topics.length} weeks`);
  console.log('\nOutline preview:');
  console.log(readFileSync(outlineResult.outlinePath, 'utf-8').split('\n').slice(0, 8).join('\n'));

  // Step 5: draft first two briefs (requires ANTHROPIC_API_KEY)
  const firstTwo = shellResult.briefPaths.slice(0, 2);
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('\nDrafting first two briefs...');
    for (const briefPath of firstTwo) {
      try {
        const draftResult = await draftAssignmentBrief({ courseId: COURSE_ID, semesterId: TARGET_SEM, briefPath });
        const preview = readFileSync(briefPath, 'utf-8').split('\n').slice(5, 8).join(' ').trim().slice(0, 120);
        console.log(`✓ draft_assignment_brief: ${briefPath.split(/[\\/]/).pop()} — replacementRecommended=${draftResult.replacementRecommended}`);
        console.log(`  Preview: ${preview}`);
      } catch (err) {
        console.error(`  ERROR drafting ${briefPath.split(/[\\/]/).pop()}: ${err instanceof Error ? err.message : err}`);
      }
    }
  } else {
    console.log('\n⚠ ANTHROPIC_API_KEY not set — skipping draft_assignment_brief step');
  }

  // Step 6: export
  const exportResult = exportCourseFolder({ courseId: COURSE_ID, semesterId: TARGET_SEM });
  console.log(`\n✓ export_course_folder: ${exportResult.outputPaths[0]}`);

  console.log('\n✓ v1.0 pipeline complete');

} finally {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
}
