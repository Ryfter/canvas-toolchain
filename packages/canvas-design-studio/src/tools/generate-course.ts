import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCourseConfig, COURSE_CONFIG_FILENAME } from './course-config.js';
import { generatePage } from './generate-page.js';
import { generateWeek } from './generate-week.js';
import type { GenerateCourseInput, GenerateCourseResult, GenerateWeekResult } from '../course-types.js';

export function generateCourse(input: GenerateCourseInput): GenerateCourseResult {
  const { courseDir, outputDir, templateId, themeId, promptSetId } = input;
  const courseDirAbs = resolve(courseDir ?? 'course');
  const configPath = join(courseDirAbs, COURSE_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    throw new Error(`course-config.md not found in ${courseDirAbs}`);
  }

  const config = parseCourseConfig(configPath);
  const baseOut = resolve(outputDir ?? join(courseDirAbs, 'output'));
  const weekResults: GenerateWeekResult[] = [];
  const allWarnings: string[] = [];
  let totalPages = 0;

  if (config.pageTypes.includes('front-page')) {
    const fpPath = join(courseDirAbs, 'front-page.md');
    if (existsSync(fpPath)) {
      generatePage({
        mdPath: fpPath,
        courseDir: courseDirAbs,
        outputDir: baseOut,
        templateId,
        themeId,
        promptSetId,
      });
      totalPages++;
    } else {
      allWarnings.push('Skipped front-page: front-page.md not found');
    }
  }

  for (let w = 1; w <= config.weeks; w++) {
    const result = generateWeek({
      weekNumber: w,
      courseDir: courseDirAbs,
      outputDir: baseOut,
      templateId,
      themeId,
      promptSetId,
    });
    weekResults.push(result);
    totalPages += result.pages.length;
    allWarnings.push(...result.warnings);
  }

  return { totalPages, outputDir: baseOut, weekResults, warnings: allWarnings };
}
