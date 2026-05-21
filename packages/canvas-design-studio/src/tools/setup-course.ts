import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createCourseScaffold } from './course-scaffold.js';
import { PAGE_TYPES, PAGE_TYPE_LABELS, DEFAULT_PAGE_TYPES } from '../course-types.js';
import type { CourseConfig, PageType } from '../course-types.js';

export interface CourseWizardAnswers {
  institution: string;
  courseName: string;
  courseNumber: string;
  professor: string;
  semester: string;
  weeks: number;
  pageTypes: PageType[];
  layoutFixed: boolean;
  primaryColor: string;
  secondaryColor: string;
}

export function createCourseFromAnswers(answers: CourseWizardAnswers, rootDir: string): string[] {
  const { primaryColor, secondaryColor, ...rest } = answers;

  const config: CourseConfig = {
    institution: rest.institution,
    courseName: rest.courseName,
    courseNumber: rest.courseNumber,
    professor: rest.professor,
    semester: rest.semester,
    weeks: rest.weeks,
    pageTypes: rest.pageTypes,
    layoutFixed: rest.layoutFixed,
    colors: {
      primary: primaryColor || '#0033A0',
      primaryDark: '#002277',
      primaryLight: '#E6ECF9',
      secondary: secondaryColor || '#D64309',
    },
    heroImages: {},
    weekOutline: [],
  };

  const created = createCourseScaffold(config, resolve(rootDir));

  // Patch course-config.md with actual color overrides if provided
  if (primaryColor || secondaryColor) {
    const configPath = join(resolve(rootDir), 'course-config.md');
    let content = readFileSync(configPath, 'utf-8');
    if (primaryColor) {
      content = content.replace(/^  primary: ""$/m, `  primary: "${primaryColor}"`);
    }
    if (secondaryColor) {
      content = content.replace(/^  secondary: ""$/m, `  secondary: "${secondaryColor}"`);
    }
    writeFileSync(configPath, content, 'utf-8');
  }

  return created;
}

export async function runCourseWizard(rootDir?: string): Promise<string[]> {
  // Dynamic import to avoid loading @inquirer/prompts in non-interactive contexts (tests)
  const { checkbox, confirm, input } = await import('@inquirer/prompts');
  const outDir = resolve(rootDir ?? 'course');

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║          Canvas Design Studio — Course Setup              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log('This wizard creates your course folder and all weekly templates.\n');

  const institution = await input({
    message: 'Institution name:',
    default: 'Boise State University',
  });

  const courseName = await input({
    message: 'Course name:',
    validate: (v: string) => v.trim().length > 0 || 'Course name is required',
  });

  const courseNumber = await input({
    message: 'Course number (e.g. ITM 370):',
    validate: (v: string) => v.trim().length > 0 || 'Course number is required',
  });

  const professor = await input({
    message: 'Professor name:',
    validate: (v: string) => v.trim().length > 0 || 'Professor name is required',
  });

  const semester = await input({
    message: 'Semester (e.g. Fall 2026):',
    validate: (v: string) => v.trim().length > 0 || 'Semester is required',
  });

  const weeksRaw = await input({
    message: 'Number of weeks:',
    default: '16',
    validate: (v: string) => (/^\d+$/.test(v) && parseInt(v, 10) > 0) || 'Enter a whole number greater than 0',
  });
  const weeks = parseInt(weeksRaw, 10);

  const selectedPageTypes = await checkbox({
    message: 'Which page types does this course use? (Space to select, Enter to confirm)',
    choices: (PAGE_TYPES as readonly string[]).map(pt => ({
      name: PAGE_TYPE_LABELS[pt as PageType],
      value: pt,
      checked: (DEFAULT_PAGE_TYPES as readonly string[]).includes(pt),
    })),
    validate: (v: readonly unknown[]) => v.length > 0 || 'Select at least one page type',
  }) as PageType[];

  const layoutFixed = await confirm({
    message: 'Use the same layout structure for every week? (Recommended: yes)',
    default: true,
  });

  const customizeColors = await confirm({
    message: 'Override institution brand colors for this course?',
    default: false,
  });

  let primaryColor = '';
  let secondaryColor = '';
  if (customizeColors) {
    primaryColor = await input({
      message: 'Primary color (#hex):',
      validate: (v: string) => !v || /^#[0-9A-Fa-f]{6}$/.test(v) || 'Enter a valid hex color or leave blank to inherit',
    });
    secondaryColor = await input({
      message: 'Secondary / accent color (#hex):',
      validate: (v: string) => !v || /^#[0-9A-Fa-f]{6}$/.test(v) || 'Enter a valid hex color or leave blank to inherit',
    });
  }

  const wizardAnswers: CourseWizardAnswers = {
    institution,
    courseName: courseName.trim(),
    courseNumber: courseNumber.trim(),
    professor: professor.trim(),
    semester: semester.trim(),
    weeks,
    pageTypes: selectedPageTypes,
    layoutFixed,
    primaryColor,
    secondaryColor,
  };

  const created = createCourseFromAnswers(wizardAnswers, outDir);

  console.log(`\n✓ Course scaffold created in ${outDir}`);
  console.log(`  ${created.length} files created`);
  console.log('\nNext steps:');
  console.log('  1. Fill in week titles and topics in course-config.md');
  console.log("  2. Fill in content for each week's .md files");
  console.log('  3. Tell Claude: "Generate the course from the course/ folder"');

  return created;
}
