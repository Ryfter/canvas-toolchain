import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { parseCourseConfig, COURSE_CONFIG_FILENAME } from './course-config.js';
import { parsePageContent, renderPage, substituteWidgetPlaceholders } from './course-templates.js';
import type { GeneratePageInput, GeneratePageResult, PageType } from '../course-types.js';
import { PAGE_TYPES } from '../course-types.js';
import { extractTiersFromFile } from './extract_tiers.js';
import { renderTldrCard } from '../templates/tldr_card.js';
import { extractAiasFromFile } from './extract_aias.js';
import { renderAiasCallout } from '../templates/aias_callout.js';
import { readAiasDefaults } from '../course/aias_config.js';
import { resolveEffectiveAias } from '../course/aias_resolver.js';
import { extractClosFromFile } from './extract_clos.js';
import { readClosCatalog } from '../course/clos_catalog.js';
import type { Clo, PageClos } from '@canvas-toolchain/shared-types';

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

  const renderedHtml = renderPage(content, config, { templateId, themeId, promptSetId });
  const tiers = extractTiersFromFile(absPath);

  // CLO resolution — only on assignment + rubric pages
  const isCloEligible = pageType === 'assignment' || pageType === 'rubric';
  let pageClos: PageClos | undefined;
  if (isCloEligible) {
    const catalog = readClosCatalog(configPath);
    const pageIds = extractClosFromFile(absPath);
    if (pageIds.length > 0 && catalog.clos.length > 0) {
      const resolved = pageIds
        .map((id) => catalog.clos.find((c) => c.id === id))
        .filter((c): c is Clo => c !== undefined);
      const unknownIds = pageIds.filter((id) => !catalog.clos.some((c) => c.id === id));
      if (resolved.length > 0) {
        pageClos = { resolved, unknownIds };
      }
    }
  }

  const tldrHtml = (tiers || pageClos) ? renderTldrCard({ tiers, clos: pageClos }) : '';
  const withTldr = tldrHtml + renderedHtml;

  const isAiasEligible = pageType === 'assignment' || pageType === 'rubric';
  let aiasHtml = '';
  if (isAiasEligible) {
    const pageOverride = extractAiasFromFile(absPath);
    const courseDefaults = readAiasDefaults(configPath);
    const effective = resolveEffectiveAias(pageOverride, courseDefaults);
    if (effective) aiasHtml = renderAiasCallout({ aias: effective });
  }
  const withCallouts = aiasHtml + withTldr;
  // pageType doubles as the page slug — widget iframes load from <pageType>/widgets/<id>.html
  // relative to the generated page's output directory.
  const html = substituteWidgetPlaceholders(withCallouts, pageType);

  const weekNumber = content.frontMatter.week ?? 0;
  const filename = `${pageType}.html`;
  const weekSegment = weekFolderSegment(weekNumber);

  const baseOut = outputDir ?? join(dirname(configPath), 'output');
  const weekOut = weekSegment ? join(baseOut, weekSegment) : baseOut;
  mkdirSync(weekOut, { recursive: true });
  const savedTo = join(weekOut, filename);
  writeFileSync(savedTo, html, 'utf-8');

  // Rubric pages: also emit the source markdown alongside the HTML so students
  // can download it and paste into an LLM for personalized help. The .md is
  // the original input verbatim — no transform — so it includes both
  // student-facing and faculty-rubric-language for full transparency.
  if (pageType === 'rubric') {
    const mdSavedTo = join(weekOut, `${pageType}.md`);
    writeFileSync(mdSavedTo, readFileSync(absPath, 'utf-8'), 'utf-8');
  }

  return { html, filename, weekNumber, pageType, savedTo, title: content.frontMatter.title };
}
