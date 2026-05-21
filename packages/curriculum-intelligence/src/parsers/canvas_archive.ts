import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AssignmentInfo,
  CourseInfo,
  DiscussionInfo,
  ModuleInfo,
  ModuleItem,
  PageInfo,
  QuizInfo,
  ResourceLink,
  SemesterId,
  TopicMap,
} from '../types.js';

/**
 * Parse a Canvas archive directory (as produced by Canvas Downloader or a manual
 * Canvas export) into a structured TopicMap.
 *
 * Expected layout:
 *   <archivePath>/manifests/{course,modules,assignments,pages,discussions,quizzes}.json
 *   <archivePath>/pages/<title>.json     (per-page body, optional but used for excerpts)
 *
 * The parser is lenient: missing optional manifests yield empty arrays rather than
 * errors, but a missing course.json is fatal.
 */
export function parseCanvasArchive(archivePath: string, semesterId: SemesterId): TopicMap {
  const manifestsDir = join(archivePath, 'manifests');
  if (!existsSync(manifestsDir)) {
    throw new Error(
      `Canvas archive at "${archivePath}" is missing a manifests/ folder. ` +
        `Expected files: course.json, modules.json, assignments.json, pages.json, discussions.json, quizzes.json.`
    );
  }

  const course = parseCourse(manifestsDir);
  const modules = parseModules(manifestsDir);
  const assignments = parseAssignments(manifestsDir);
  const pages = parsePages(archivePath, manifestsDir);
  const discussions = parseDiscussions(manifestsDir);
  const quizzes = parseQuizzes(manifestsDir);
  const resourceLinks = extractResourceLinks(pages, assignments, discussions);

  return {
    version: 1,
    semesterId,
    ingestedAt: new Date().toISOString(),
    course,
    modules,
    assignments,
    pages,
    discussions,
    quizzes,
    resourceLinks,
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function readJsonIfExists<T>(path: string): T | null {
  return existsSync(path) ? readJson<T>(path) : null;
}

function parseCourse(manifestsDir: string): CourseInfo {
  const path = join(manifestsDir, 'course.json');
  if (!existsSync(path)) {
    throw new Error(`Missing required manifest: ${path}`);
  }
  // Canvas course.json shape — fields may be absent on slimmer exports.
  type RawCourse = {
    id?: number;
    name?: string;
    course_code?: string;
    term?: { name?: string; start_at?: string | null; end_at?: string | null };
    start_at?: string | null;
    end_at?: string | null;
  };
  const raw = readJson<RawCourse>(path);
  return {
    canvasId: raw.id ?? null,
    name: raw.name ?? '',
    courseCode: raw.course_code ?? null,
    termName: raw.term?.name ?? null,
    termStart: raw.term?.start_at ?? raw.start_at ?? null,
    termEnd: raw.term?.end_at ?? raw.end_at ?? null,
  };
}

function parseModules(manifestsDir: string): ModuleInfo[] {
  type RawItem = {
    id?: number;
    position?: number;
    title?: string;
    type?: string;
    page_url?: string;
    content_id?: number;
    external_url?: string;
  };
  type RawModule = {
    id?: number;
    position?: number;
    name?: string;
    published?: boolean;
    items?: RawItem[];
  };
  const raw = readJsonIfExists<RawModule[]>(join(manifestsDir, 'modules.json')) ?? [];
  return raw.map((m): ModuleInfo => ({
    canvasId: m.id ?? 0,
    position: m.position ?? 0,
    name: m.name ?? '',
    published: m.published ?? false,
    items: (m.items ?? []).map((i): ModuleItem => ({
      canvasId: i.id ?? 0,
      position: i.position ?? 0,
      title: i.title ?? '',
      type: i.type ?? 'Unknown',
      pageUrl: i.page_url,
      contentId: i.content_id,
      externalUrl: i.external_url,
    })),
  }));
}

function parseAssignments(manifestsDir: string): AssignmentInfo[] {
  type RawAssignment = {
    id?: number;
    name?: string;
    position?: number;
    due_at?: string | null;
    points_possible?: number | null;
    submission_types?: string[];
    published?: boolean;
    description?: string;
  };
  const raw = readJsonIfExists<RawAssignment[]>(join(manifestsDir, 'assignments.json')) ?? [];
  return raw.map((a): AssignmentInfo => ({
    canvasId: a.id ?? 0,
    name: a.name ?? '',
    position: a.position ?? 0,
    dueAt: a.due_at ?? null,
    pointsPossible: a.points_possible ?? null,
    submissionTypes: a.submission_types ?? [],
    published: a.published ?? false,
    descriptionExcerpt: stripHtmlToExcerpt(a.description ?? ''),
  }));
}

function parsePages(archivePath: string, manifestsDir: string): PageInfo[] {
  type RawPage = {
    page_id?: number;
    title?: string;
    url?: string;
    published?: boolean;
    body?: string;
  };
  const manifest = readJsonIfExists<RawPage[]>(join(manifestsDir, 'pages.json')) ?? [];
  const pagesDir = join(archivePath, 'pages');
  const perPageBodies = new Map<string, string>();   // keyed by url
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir)) {
      if (!file.endsWith('.json')) continue;
      const p = readJson<RawPage>(join(pagesDir, file));
      if (p.url && typeof p.body === 'string') {
        perPageBodies.set(p.url, p.body);
      }
    }
  }
  return manifest.map((p): PageInfo => ({
    canvasId: p.page_id ?? 0,
    title: (p.title ?? '').trim(),
    url: p.url ?? '',
    published: p.published ?? false,
    bodyExcerpt: stripHtmlToExcerpt(perPageBodies.get(p.url ?? '') ?? p.body ?? ''),
  }));
}

function parseDiscussions(manifestsDir: string): DiscussionInfo[] {
  type RawDiscussion = {
    id?: number;
    title?: string;
    published?: boolean;
    message?: string;
  };
  const raw = readJsonIfExists<RawDiscussion[]>(join(manifestsDir, 'discussions.json')) ?? [];
  return raw.map((d): DiscussionInfo => ({
    canvasId: d.id ?? 0,
    title: d.title ?? '',
    published: d.published ?? false,
    messageExcerpt: stripHtmlToExcerpt(d.message ?? ''),
  }));
}

function parseQuizzes(manifestsDir: string): QuizInfo[] {
  type RawQuiz = {
    id?: number;
    title?: string;
    published?: boolean;
    question_count?: number | null;
    points_possible?: number | null;
  };
  const raw = readJsonIfExists<RawQuiz[]>(join(manifestsDir, 'quizzes.json')) ?? [];
  return raw.map((q): QuizInfo => ({
    canvasId: q.id ?? 0,
    title: q.title ?? '',
    published: q.published ?? false,
    questionCount: q.question_count ?? null,
    pointsPossible: q.points_possible ?? null,
  }));
}

function extractResourceLinks(
  pages: PageInfo[],
  assignments: AssignmentInfo[],
  discussions: DiscussionInfo[]
): ResourceLink[] {
  // Re-read page bodies to scan for external links. We use the original HTML, not
  // the stripped excerpt. To keep this single-pass we accept that the excerpts
  // we already produced lost link text — that's intentional; the dedicated
  // resourceLinks array is the canonical source for "what links did this course
  // reference".
  //
  // (Note: this function operates on stripped excerpts since the parser doesn't
  // currently retain the original HTML. The scan looks for http(s) URLs in the
  // visible text of excerpts. For full-fidelity link extraction we would re-read
  // the source HTML — left for a follow-up if needed.)
  const links: ResourceLink[] = [];
  for (const p of pages) {
    for (const url of findUrls(p.bodyExcerpt)) {
      links.push({ url, text: '', source: 'page', sourceTitle: p.title });
    }
  }
  for (const a of assignments) {
    for (const url of findUrls(a.descriptionExcerpt)) {
      links.push({ url, text: '', source: 'assignment', sourceTitle: a.name });
    }
  }
  for (const d of discussions) {
    for (const url of findUrls(d.messageExcerpt)) {
      links.push({ url, text: '', source: 'discussion', sourceTitle: d.title });
    }
  }
  return links;
}

const URL_RE = /https?:\/\/[^\s<>"')]+/g;

function findUrls(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

const EXCERPT_LEN = 400;

/**
 * Convert HTML to a clean plain-text excerpt of up to EXCERPT_LEN characters.
 * URLs inside href attributes are preserved (appended in parentheses) so the
 * downstream link extractor can find them.
 */
export function stripHtmlToExcerpt(html: string): string {
  if (!html) return '';
  let text = html;
  // Preserve hrefs by appending their target in parens so URL_RE can find them.
  text = text.replace(/<a [^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)');
  // Drop all remaining tags.
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities.
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > EXCERPT_LEN) {
    text = text.slice(0, EXCERPT_LEN).trimEnd() + '…';
  }
  return text;
}
