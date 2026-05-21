import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { parseCourseConfig, COURSE_CONFIG_FILENAME } from './course-config.js';
import { parsePageContent, renderPage } from './course-templates.js';
import type { GeneratePageInput, GeneratePageResult, PageType } from '../course-types.js';
import { PAGE_TYPES } from '../course-types.js';

function detectPageType(filename: string): PageType {
  const name = basename(filename, '.md');
  return (PAGE_TYPES as readonly string[]).includes(name)
    ? name as PageType
    : 'custom';
}

function findCourseConfig(startDir: string, courseDir?: string): string {
  if (courseDir) {
    const p = join(courseDir, COURSE_CONFIG_FILENAME);
    if (existsSync(p)) return p;
    throw new Error(`course-config.md not found in ${courseDir}`);
  }
  let dir = resolve(startDir);
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, COURSE_CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`course-config.md not found walking up from ${startDir}`);
}

function weekFolderSegment(weekNumber: number): string {
  return weekNumber > 0 ? `week-${String(weekNumber).padStart(2, '0')}` : '';
}

export function generatePage(input: GeneratePageInput): GeneratePageResult {
  const { mdPath, courseDir, outputDir, templateId, themeId, promptSetId } = input;
  const absPath = resolve(mdPath);
  const configPath = findCourseConfig(dirname(absPath), courseDir);
  const config = parseCourseConfig(configPath);

  const pageType = detectPageType(absPath);
  const content = parsePageContent(absPath, pageType);

  const html = renderPage(content, config, { templateId, themeId, promptSetId });

  const weekNumber = content.frontMatter.week ?? 0;
  const filename = `${pageType}.html`;
  const weekSegment = weekFolderSegment(weekNumber);

  const baseOut = outputDir ?? join(dirname(configPath), 'output');
  const weekOut = weekSegment ? join(baseOut, weekSegment) : baseOut;
  mkdirSync(weekOut, { recursive: true });
  const savedTo = join(weekOut, filename);
  writeFileSync(savedTo, html, 'utf-8');

  return { html, filename, weekNumber, pageType, savedTo };
}
