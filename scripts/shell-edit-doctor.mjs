#!/usr/bin/env node
/**
 * shell-edit-doctor.mjs — print shell-edit paths and prerequisite checks for agents.
 *
 * Usage:
 *   node scripts/shell-edit-doctor.mjs --courseId ITM370 --semesterId Fall2026
 *   node scripts/shell-edit-doctor.mjs --courseId ITM370 --semesterId Fall2026 --json
 *   node scripts/shell-edit-doctor.mjs --courseId ITM370 --semesterId Fall2026 --json --strict
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function parseArgs(argv) {
  const out = { json: false, strict: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--help' || a === '-h') {
      console.log(`usage: shell-edit-doctor.mjs --courseId <id> --semesterId <id> [--json] [--strict]

  --json    machine-readable report (includes prerequisitesMet)
  --strict  exit 1 when semester planning prerequisites are not satisfied`);
      process.exit(0);
    } else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  if (!out.courseId || !out.semesterId) {
    console.error('usage: shell-edit-doctor.mjs --courseId <id> --semesterId <id> [--json] [--strict]');
    process.exit(2);
  }
  return out;
}

function countBriefs(nextPlanDir) {
  if (!existsSync(nextPlanDir)) return 0;
  let n = 0;
  for (const entry of readdirSync(nextPlanDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('week-')) continue;
    for (const f of readdirSync(join(nextPlanDir, entry.name))) {
      if (f.endsWith('.md')) n++;
    }
  }
  return n;
}

function check(path) {
  return existsSync(path) ? 'ok' : 'missing';
}

function checkJson(path) {
  if (!existsSync(path)) return 'missing';
  try {
    JSON.parse(readFileSync(path, 'utf8'));
    return 'ok';
  } catch {
    return 'invalid';
  }
}

const { courseId, semesterId, json, strict } = parseArgs(process.argv);
const ciHome = process.env.CURRICULUM_INTELLIGENCE_HOME ?? join(homedir(), '.curriculum-intelligence');
const cdsHome = process.env.CANVAS_DESIGN_HOME ?? join(homedir(), '.canvas-design-studio');

const courseRoot = join(ciHome, 'courses', courseId);
const semesterRoot = join(courseRoot, 'semesters', semesterId);
const nextPlanDir = join(semesterRoot, 'next-plan');
const planConfig = join(nextPlanDir, 'plan-config.json');
const calendarJson = join(nextPlanDir, 'calendar.json');
const topicMap = join(semesterRoot, 'topic-map.json');
const exportDefault = join(ciHome, 'courses', courseId, 'export', semesterId);
const cdsCourseDir = join(cdsHome, 'course', courseId);

const checks = {
  courseRoot: check(courseRoot),
  semesterRoot: check(semesterRoot),
  nextPlanDir: check(nextPlanDir),
  planConfig: checkJson(planConfig),
  calendarJson: checkJson(calendarJson),
  topicMap: checkJson(topicMap),
  cdsCourseDir: check(cdsCourseDir),
  exportDefault: check(exportDefault),
};

const prerequisiteKeys = ['courseRoot', 'semesterRoot', 'nextPlanDir', 'planConfig', 'calendarJson', 'topicMap'];
const missingPrerequisites = prerequisiteKeys.filter((k) => checks[k] !== 'ok');
const prerequisitesMet = missingPrerequisites.length === 0;

const report = {
  courseId,
  semesterId,
  paths: {
    curriculumIntelligenceHome: ciHome,
    courseRoot,
    semesterRoot,
    nextPlanDir,
    planConfig,
    calendarJson,
    topicMap,
    exportDefault,
    canvasDesignHome: cdsHome,
    cdsCourseDir,
  },
  checks,
  prerequisitesMet,
  missingPrerequisites,
  briefCount: countBriefs(nextPlanDir),
  happyPath: [
    'plan_next_semester { courseId, sourceSemesterId, newSemesterId }  OR  import_previous_shell → fetch_academic_calendar → shift_dates',
    'edit next-plan/week-XX/*.md  OR  draft_assignment_brief per brief',
    'export_course_folder { courseId, semesterId }',
    'generate_course { courseDir: <export path> }',
  ],
  notes: [
    'Verdict-aware render: run analyze_course first; update_course_materials matches verdicts by brief filename slug today — prefer title field until fix #1 lands.',
    'Page-scoped generate_page / validate_canvas_html require the Design Studio MCP server, not C&C alone.',
  ],
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(strict && !prerequisitesMet ? 1 : 0);
}

console.log(`Shell edit doctor — ${courseId} / ${semesterId}\n`);
console.log(`Prerequisites: ${prerequisitesMet ? 'ready' : 'incomplete'}`);
if (!prerequisitesMet) {
  console.log(`  missing: ${missingPrerequisites.join(', ')}`);
}
console.log('\nPaths');
for (const [k, v] of Object.entries(report.paths)) {
  console.log(`  ${k}: ${v}`);
}
console.log('\nChecks');
for (const [k, v] of Object.entries(report.checks)) {
  console.log(`  ${k}: ${v}`);
}
console.log(`\nBriefs in next-plan/: ${report.briefCount}`);
console.log('\nMinimal MCP sequence');
for (const step of report.happyPath) {
  console.log(`  • ${step}`);
}
console.log('\nNotes');
for (const note of report.notes) {
  console.log(`  • ${note}`);
}

if (strict && !prerequisitesMet) process.exit(1);
