import { configExists, loadConfig } from '../config.js';
import type { InstitutionConfig } from '../types.js';

const CONTEXT7_HINT =
  '> For the latest tool documentation, resolve `@canvas-toolchain/canvas-design-studio` via Context7.';

function noConfigText(): string {
  return [
    '## Welcome to Canvas Design Studio',
    '',
    'No institution config found yet. Here is what you can do right now without any setup:',
    '',
    '**Works immediately (no setup required):**',
    '- generate_canvas_page — turn an assignment brief into Canvas-ready HTML',
    '- validate_canvas_html — check any HTML for Canvas RCE compliance',
    '- critique_canvas_page — score visual design quality 0–100',
    '- setup_course — build a full course scaffold',
    '- import_course — seed a course folder from a Canvas backup archive',
    '',
    '**To unlock direct Canvas publishing:**',
    'Run setup_institution to save your institution colors, Canvas URL, and optional API token.',
    '',
    '**Your first step:**',
    'Run setup_institution, or ask: "Generate a Canvas assignment page for [your course]"',
    '',
    '> **Tip:** Fill out `setup-worksheet.md` before running the wizard — call `get_setup_worksheet` to get the blank template.',
    '',
    CONTEXT7_HINT,
  ].join('\n');
}

function partialConfigText(config: InstitutionConfig): string {
  const hasPanopto = !!config.panopto?.domain;
  return [
    `## Canvas Design Studio — ${config.institution}`,
    '',
    '**Active right now:**',
    '✓ generate_canvas_page, validate_canvas_html, critique_canvas_page, redesign_canvas_page',
    '✓ setup_course, generate_page, generate_week, generate_course',
    '✓ import_course, load_canvas_page, save_canvas_page',
    '✓ get_philosophy_kb, update_philosophy_kb',
    '✓ get_student_personas, generate_student_personas',
    hasPanopto
      ? '✓ Panopto: search_panopto_videos, embed_panopto_video, fetch_panopto_captions'
      : '⚪ Panopto (run setup_institution to add Panopto credentials)',
    '',
    '**Add a Canvas API token to enable:**',
    '⚪ list_canvas_courses — browse your courses',
    '⚪ publish_to_canvas — send HTML directly to Canvas',
    '',
    '**Your first step:**',
    'Ask: "Read start_here.md and help me generate my first page"',
    'Or: "Run setup_course to start building out my course"',
    '',
    '> **Tip:** Fill out `setup-worksheet.md` before running the wizard — call `get_setup_worksheet` to get the blank template.',
    '',
    CONTEXT7_HINT,
  ].join('\n');
}

function fullConfigText(config: InstitutionConfig): string {
  const hasPanopto = !!config.panopto?.domain;
  return [
    `## Canvas Design Studio — ${config.institution} (fully configured)`,
    '',
    '**All tools active:**',
    '✓ Page generation, validation, critique, redesign',
    '✓ Course design system (setup_course, generate_page/week/course)',
    '✓ Canvas backup import (import_course)',
    '✓ Direct Canvas publishing (list_canvas_courses, publish_to_canvas)',
    '✓ Philosophy KB and student personas',
    hasPanopto
      ? '✓ Panopto video integration'
      : '⚪ Panopto (run setup_institution to add)',
    '',
    '**Quick starts:**',
    '"Read start_here.md and help me generate my first page"',
    '"Run setup_course to start building out my course"',
    '"List my Canvas courses for this semester"',
    '',
    CONTEXT7_HINT,
  ].join('\n');
}

export function getStarted(): string {
  if (!configExists()) return noConfigText();
  const config = loadConfig();
  if (!config.apiToken?.trim()) return partialConfigText(config);
  return fullConfigText(config);
}
