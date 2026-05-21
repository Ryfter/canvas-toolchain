import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCourseConfig, COURSE_CONFIG_FILENAME } from './course-config.js';
import { generatePage } from './generate-page.js';
import type { GenerateWeekInput, GenerateWeekResult, GeneratePageResult } from '../course-types.js';

function getWeekFolderName(week: number): string {
  return `week-${String(week).padStart(2, '0')}`;
}

export function generateWeek(input: GenerateWeekInput): GenerateWeekResult {
  const { weekNumber, courseDir, outputDir, templateId, themeId, promptSetId } = input;
  const courseDirAbs = resolve(courseDir ?? 'course');
  const configPath = join(courseDirAbs, COURSE_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    throw new Error(`course-config.md not found in ${courseDirAbs}`);
  }

  const config = parseCourseConfig(configPath);
  const weekFolder = join(courseDirAbs, getWeekFolderName(weekNumber));
  const weekPageTypes = config.pageTypes.filter(pt => pt !== 'front-page');

  const pages: GeneratePageResult[] = [];
  const warnings: string[] = [];
  const baseOut = outputDir ?? join(courseDirAbs, 'output');
  const weekOut = join(baseOut, getWeekFolderName(weekNumber));

  for (const pageType of weekPageTypes) {
    const mdPath = join(weekFolder, `${pageType}.md`);
    if (!existsSync(mdPath)) {
      warnings.push(`Skipped ${pageType}: ${mdPath} not found`);
      continue;
    }
    const result = generatePage({
      mdPath,
      courseDir: courseDirAbs,
      outputDir: baseOut,
      templateId,
      themeId,
      promptSetId,
    });
    pages.push(result);
  }

  return { weekNumber, pages, outputDir: weekOut, warnings };
}
