import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCourseScaffold } from './course-scaffold.js';
import type { CourseConfig, PageType } from '../course-types.js';

interface CourseJson {
  id: number;
  name: string;
  course_code: string;
  sis_course_id?: string;
}

interface ModuleJson {
  id: number;
  name: string;
  position: number;
}

interface ModuleItem {
  id: number;
  type: 'Page' | 'Assignment' | 'Quiz' | 'Discussion' | 'File' | 'ExternalUrl' | 'ExternalTool' | string;
  title: string;
  content_id: number | null;
  position: number;
}

interface AssignmentJson {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number;
  submission_types: string[];
}

export interface ImportCourseInput {
  archivePath: string;
  outputDir: string;
  weekNumber?: number;
  assignmentName?: string;
  /** When true, lift each source page/assignment/discussion body HTML verbatim
   *  into the imported markdown instead of attempting to extract structured
   *  sections (Learning Objectives, Activities, etc.) which is lossy for
   *  pages whose HTML doesn't follow CDS's expected section layout.
   *
   *  The generated markdown carries `imported_verbatim: true` in its front
   *  matter so generate_page knows to pass the body through unchanged. */
  preserveOriginalHtml?: boolean;
}

export interface ImportCourseResult {
  filesCreated: number;
  weeksImported: number;
  warnings: string[];
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractSectionsFromHtml(html: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const headingRegex = /<h[2-4][^>]*>(.*?)<\/h[2-4]>/gi;
  const parts = html.split(headingRegex);

  if (parts.length <= 1) {
    sections['Content'] = stripHtmlTags(html);
    return sections;
  }

  for (let i = 1; i < parts.length; i += 2) {
    const heading = stripHtmlTags(parts[i]).trim();
    const content = parts[i + 1] ? stripHtmlTags(parts[i + 1]).trim() : '';
    if (heading) sections[heading] = content;
  }

  return sections;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function detectAssignmentType(title: string): 'assignment' | 'engage-assignment' | 'proj-assignment' | 'tech-assignment' {
  if (/engage/i.test(title))           return 'engage-assignment';
  if (/\bproj(ect)?\b/i.test(title))  return 'proj-assignment';
  if (/\btech(nical)?\b/i.test(title)) return 'tech-assignment';
  return 'assignment';
}

function detectPageTypeFromTitle(title: string): PageType {
  const lower = title.toLowerCase();
  if (lower.includes('resource') || lower.includes('slide') || lower.includes('video')) return 'resources';
  if (lower.includes('overview') || lower.includes('introduction') || lower.includes('welcome')) return 'overview';
  if (lower.includes('lab')) return 'lab';
  return 'overview';
}

function buildOverviewMd(week: number, title: string, sections: Record<string, string>): string {
  const objectives = sections['Learning Objectives'] ?? sections['Objectives'] ?? '[NEEDS REVIEW — paste learning objectives here]';
  const intro = sections['Introduction'] ?? sections['Overview'] ?? sections['Content'] ?? '[NEEDS REVIEW — paste introduction here]';
  const activities = sections['Activities'] ?? sections['This Week'] ?? '[NEEDS REVIEW — paste activities list here]';

  return `---
week: ${week}
title: "${title}"
hero_image: ""
---

## Learning Objectives
${objectives}

## Introduction
${intro}

## Activities
${activities}
`;
}

function buildResourcesMd(week: number, title: string, sections: Record<string, string>): string {
  const slides   = sections['Slides']   ?? '[NEEDS REVIEW — paste slide links here]';
  const videos   = sections['Videos']   ?? '[NEEDS REVIEW — paste Panopto IDs here]';
  const readings = sections['Readings'] ?? '[NEEDS REVIEW — paste reading links here]';
  const other    = sections['Other']    ?? '';

  return `---
week: ${week}
title: "${title}"
hero_image: ""
---

## Slides
${slides}

## Videos
${videos}

## Readings
${readings}
${other ? `\n## Other\n${other}\n` : ''}`;
}

function buildAssignmentMd(week: number, assignment: AssignmentJson, bodyHtml: string): string {
  const sections = extractSectionsFromHtml(bodyHtml);
  const brief  = sections['Brief']  ?? sections['Content'] ?? stripHtmlTags(bodyHtml);
  const rubric = sections['Rubric'] ?? '';
  const due = formatDate(assignment.due_at);

  return `---
week: ${week}
title: ""
hero_image: ""
assignment_number: "${assignment.name}"
due: "${due}"
points: ${assignment.points_possible}
---

## Brief
${brief}

## Rubric
${rubric || '[NEEDS REVIEW — paste rubric here]'}

## Submission Details
- Due: ${due}
- Points: ${assignment.points_possible}
- Submit via: [NEEDS REVIEW — add Canvas submission link]
`;
}

function buildDiscussionMd(week: number, title: string, bodyHtml: string): string {
  const prompt = bodyHtml ? stripHtmlTags(bodyHtml).trim() : '[NEEDS REVIEW — paste discussion prompt here]';
  return `---
week: ${week}
title: "${title}"
hero_image: ""
---

## Prompt
${prompt}

## Requirements
- Initial post: [NEEDS REVIEW — add word count and due date]
- Responses: [NEEDS REVIEW — add peer response requirements]

## Grading
[NEEDS REVIEW — add grading description]
`;
}

/** Build a markdown file whose body is the source page's HTML verbatim.
 *  Used when import_course is called with preserveOriginalHtml: true.
 *  generate_page detects imported_verbatim: true in front matter and emits
 *  the body unchanged inside the standard Lato/max-width container. */
function buildVerbatimMd(week: number, title: string, bodyHtml: string): string {
  const cleanTitle = title.trim().replace(/"/g, '\\"');
  return `---
week: ${week}
title: "${cleanTitle}"
hero_image: ""
imported_verbatim: true
---

${bodyHtml.trim()}
`;
}

function buildVerbatimAssignmentMd(week: number, assignment: AssignmentJson, bodyHtml: string): string {
  const due = formatDate(assignment.due_at);
  const cleanName = assignment.name.trim().replace(/"/g, '\\"');
  return `---
week: ${week}
title: "${cleanName}"
hero_image: ""
assignment_number: "${cleanName}"
due: "${due}"
points: ${assignment.points_possible}
imported_verbatim: true
---

${bodyHtml.trim()}
`;
}

function buildQuizMd(week: number, quizTitle: string, quizType: 'weekly-quiz' | 'reading-quiz'): string {
  return `---
week: ${week}
title: "${quizTitle}"
hero_image: ""
---

## Quiz Details
- Opens: [NEEDS REVIEW]
- Closes: [NEEDS REVIEW]
- Questions: [NEEDS REVIEW — quiz question content not available via Canvas API]
- Points: [NEEDS REVIEW]

## ${quizType === 'reading-quiz' ? 'What It Covers' : 'Topics Covered'}
[NEEDS REVIEW — quiz question content is not exported by canvas-backup; check Canvas directly]

## Access
[NEEDS REVIEW — add Canvas quiz link]
`;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function readHtmlFile(dir: string, title: string): string {
  // Canvas's items.json sometimes serializes page titles with trailing
  // whitespace (e.g. "1.0 Week 1 Overview   "); the on-disk filename canvas-backup
  // wrote drops that whitespace. Trim before joining or the lookup misses.
  const htmlPath = join(dir, `${title.trim()}.html`);
  return existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';
}

function findModuleFolders(modulesDir: string): Array<{ position: number; folder: string }> {
  if (!existsSync(modulesDir)) return [];
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const match = e.name.match(/^(\d+)-/);
      return match ? { position: parseInt(match[1], 10), folder: join(modulesDir, e.name) } : null;
    })
    .filter((x): x is { position: number; folder: string } => x !== null)
    .sort((a, b) => a.position - b.position);
}

export function importCourse(input: ImportCourseInput): ImportCourseResult {
  const { archivePath, outputDir, weekNumber, assignmentName, preserveOriginalHtml } = input;
  const archiveAbs = resolve(archivePath);
  const outAbs = resolve(outputDir);
  mkdirSync(outAbs, { recursive: true });

  const manifestsDir   = join(archiveAbs, 'manifests');
  const modulesDir     = join(archiveAbs, 'modules');
  const pagesDir       = join(archiveAbs, 'pages');
  const assignmentsDir = join(archiveAbs, 'assignments');
  const discussionsDir = join(archiveAbs, 'discussions');

  const course      = readJson<CourseJson>(join(manifestsDir, 'course.json'));
  const modules     = readJson<ModuleJson[]>(join(manifestsDir, 'modules.json'));
  const assignments = existsSync(join(manifestsDir, 'assignments.json'))
    ? readJson<AssignmentJson[]>(join(manifestsDir, 'assignments.json'))
    : [];

  const assignmentsByName = new Map(assignments.map(a => [a.name, a]));

  const moduleFolders = findModuleFolders(modulesDir);
  const warnings: string[] = [];
  let filesCreated = 0;
  let weeksImported = 0;

  const sortedModules = modules.sort((a, b) => a.position - b.position);
  const weeksToProcess = weekNumber
    ? sortedModules.filter((_, i) => i + 1 === weekNumber)
    : sortedModules;

  for (let idx = 0; idx < weeksToProcess.length; idx++) {
    const mod = weeksToProcess[idx];
    const weekNum = weekNumber ?? sortedModules.indexOf(mod) + 1;
    const weekStr = `week-${String(weekNum).padStart(2, '0')}`;
    const weekDir = join(outAbs, weekStr);

    const modFolder = moduleFolders.find(f => f.position === mod.position);
    if (!modFolder) {
      warnings.push(`No module folder found for module "${mod.name}" (position ${mod.position})`);
      continue;
    }

    const itemsPath = join(modFolder.folder, 'items.json');
    if (!existsSync(itemsPath)) {
      warnings.push(`items.json not found for module "${mod.name}"`);
      continue;
    }

    const items = readJson<ModuleItem[]>(itemsPath);
    const pageItems = items.filter(i => i.type === 'Page');
    const assignmentItems = items.filter(i => i.type === 'Assignment');
    const quizItems = items.filter(i => i.type === 'Quiz');
    const discussionItems = items.filter(i => i.type === 'Discussion');

    if (assignmentName) {
      const target = assignmentItems.find(a => a.title === assignmentName);
      if (!target) {
        warnings.push(`Assignment "${assignmentName}" not found in module "${mod.name}"`);
        continue;
      }
      const assignData = assignmentsByName.get(target.title);
      if (!assignData) {
        warnings.push(`Assignment metadata not found for "${target.title}"`);
        continue;
      }
      mkdirSync(weekDir, { recursive: true });
      const pageType = detectAssignmentType(target.title);
      const html = readHtmlFile(assignmentsDir, target.title);
      const mdContent = preserveOriginalHtml
        ? buildVerbatimAssignmentMd(weekNum, assignData, html)
        : buildAssignmentMd(weekNum, assignData, html);
      writeFileSync(join(weekDir, `${pageType}-${weekNum}.1.md`), mdContent, 'utf-8');
      filesCreated++;
      weeksImported++;
      continue;
    }

    mkdirSync(weekDir, { recursive: true });

    // Per-week filename counters (reset each iteration)
    const typeCounts: Record<string, number> = {};
    // Assignments and quizzes: always module-indexed (assignment-1.1.md, weekly-quiz-2.3.md)
    const resolveIndexed = (base: string): string => {
      const n = (typeCounts[base] = (typeCounts[base] ?? 0) + 1);
      return `${base}-${weekNum}.${n}.md`;
    };
    // Pages and discussions: first keeps canonical name (overview.md), duplicates get counter
    const resolveSimple = (base: string): string => {
      const n = (typeCounts[base] = (typeCounts[base] ?? 0) + 1);
      return n === 1 ? `${base}.md` : `${base}-${n}.md`;
    };

    for (const item of pageItems) {
      const html = readHtmlFile(pagesDir, item.title);
      const pageType = detectPageTypeFromTitle(item.title);
      const filename = resolveSimple(pageType);
      if (filename !== `${pageType}.md`) {
        warnings.push(`Week ${weekNum}: multiple "${pageType}" pages — "${item.title}" written as ${filename}`);
      }
      let content: string;
      if (preserveOriginalHtml) {
        content = buildVerbatimMd(weekNum, item.title, html);
      } else {
        const sections = extractSectionsFromHtml(html);
        content = pageType === 'resources'
          ? buildResourcesMd(weekNum, item.title, sections)
          : buildOverviewMd(weekNum, item.title, sections);
      }
      writeFileSync(join(weekDir, filename), content, 'utf-8');
      filesCreated++;
    }

    for (const item of assignmentItems) {
      const assignData = assignmentsByName.get(item.title);
      if (!assignData) {
        warnings.push(`Assignment metadata not found for "${item.title}" — skipping`);
        continue;
      }
      const aType = detectAssignmentType(item.title);
      const filename = resolveIndexed(aType);
      const html = readHtmlFile(assignmentsDir, item.title);
      const mdContent = preserveOriginalHtml
        ? buildVerbatimAssignmentMd(weekNum, assignData, html)
        : buildAssignmentMd(weekNum, assignData, html);
      writeFileSync(join(weekDir, filename), mdContent, 'utf-8');
      filesCreated++;
    }

    for (const item of quizItems) {
      const quizType = item.title.toLowerCase().includes('reading') ? 'reading-quiz' : 'weekly-quiz';
      const filename = resolveIndexed(quizType);
      const mdContent = buildQuizMd(weekNum, item.title, quizType);
      writeFileSync(join(weekDir, filename), mdContent, 'utf-8');
      filesCreated++;
    }

    for (const item of discussionItems) {
      const html = readHtmlFile(discussionsDir, item.title);
      const filename = resolveSimple('discussion-board');
      if (filename !== 'discussion-board.md') {
        warnings.push(`Week ${weekNum}: multiple discussions — "${item.title}" written as ${filename}`);
      }
      const mdContent = preserveOriginalHtml
        ? buildVerbatimMd(weekNum, item.title, html)
        : buildDiscussionMd(weekNum, item.title, html);
      writeFileSync(join(weekDir, filename), mdContent, 'utf-8');
      filesCreated++;
    }

    weeksImported++;
  }

  if (!assignmentName && !weekNumber) {
    const courseCode = course.course_code ?? '';
    const mockConfig: CourseConfig = {
      institution: 'Example University',
      courseName: course.name,
      courseNumber: courseCode,
      professor: '[NEEDS REVIEW — add professor name]',
      semester: '[NEEDS REVIEW — update semester]',
      weeks: sortedModules.length,
      pageTypes: ['overview', 'resources', 'assignment', 'discussion-board', 'weekly-quiz'],
      layoutFixed: true,
      colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
      heroImages: {},
      weekOutline: sortedModules.map((m, i) => ({
        week: i + 1,
        weekStr: String(i + 1).padStart(2, '0'),
        title: m.name.replace(/^Week \d+:\s*/i, '').trim(),
        topic: '[NEEDS REVIEW]',
      })),
    };
    const scaffoldFiles = createCourseScaffold(mockConfig, outAbs);
    filesCreated += scaffoldFiles.length;
  }

  return { filesCreated, weeksImported, warnings };
}
