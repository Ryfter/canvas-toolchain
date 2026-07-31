import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export const PHILOSOPHY_KB_PATH = join(homedir(), '.canvas-design-mcp', 'professor-philosophy.md');

// Saved to disk (empty sections, no placeholder prose — clean slate for detection logic)
export const PHILOSOPHY_TEMPLATE = [
  '# Professor Philosophy KB',
  '',
  '## Core Teaching Philosophy',
  '',
  '## Course-Specific Focus',
  '',
  '## Quotes & Aphorisms',
  '',
  '## From Lecture Captures',
  '',
].join('\n');

// Embedded interview questions — returned to the model when no KB file exists yet
const PHILOSOPHY_QUESTIONS_HINT = [
  '*No answers yet. Ask the professor these questions one at a time to populate this section:*',
  '',
  '1. What\'s one thing you always tell students about this subject that you wish they\'d really internalize?',
  '2. What does a student who truly gets it do differently from one who just completes the work?',
  '3. What\'s the biggest mistake students make on your assignments?',
  '4. What separates an A from a B in concrete terms?',
  '5. Are there teaching frameworks you consciously draw from? (Bloom\'s, UDL, constructivism, andragogy, etc.)',
  '6. Any quotes or sayings you use regularly in class?',
  '',
].join('\n');

export interface GetPhilosophyKbResult {
  content: string;
  exists: boolean;
  sections: {
    hasCore: boolean;
    hasCourseSpecific: boolean;
    hasQuotes: boolean;
    hasLectureCaptures: boolean;
  };
}

export interface UpdatePhilosophyKbInput {
  entry: string;
  section: 'core' | 'course' | 'quotes' | 'lectures';
  courseKey?: string;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function savePhilosophyKb(content: string, kbPath = PHILOSOPHY_KB_PATH): void {
  ensureDir(kbPath);
  writeFileSync(kbPath, content, 'utf-8');
}

function extractSectionContent(content: string, heading: string): string {
  const pattern = `## ${heading}`;
  const idx = content.indexOf(pattern);
  if (idx === -1) return '';
  const after = idx + pattern.length;
  const next = content.indexOf('\n## ', after);
  return next === -1 ? content.slice(after) : content.slice(after, next);
}

function detectSections(content: string): GetPhilosophyKbResult['sections'] {
  const core = extractSectionContent(content, 'Core Teaching Philosophy');
  const course = extractSectionContent(content, 'Course-Specific Focus');
  const quotes = extractSectionContent(content, 'Quotes & Aphorisms');
  const lectures = extractSectionContent(content, 'From Lecture Captures');
  return {
    hasCore: core.split('\n').some(l => l.trim().length > 0),
    hasCourseSpecific: course.includes('### '),
    hasQuotes: quotes.split('\n').some(l => l.trim().startsWith('- ')),
    hasLectureCaptures: lectures.split('\n').some(l => l.trim().startsWith('- ')),
  };
}

export function getPhilosophyKb(kbPath = PHILOSOPHY_KB_PATH): GetPhilosophyKbResult {
  if (!existsSync(kbPath)) {
    const content = PHILOSOPHY_TEMPLATE.replace(
      '## Core Teaching Philosophy\n',
      `## Core Teaching Philosophy\n\n${PHILOSOPHY_QUESTIONS_HINT}`
    );
    return {
      content,
      exists: false,
      sections: { hasCore: false, hasCourseSpecific: false, hasQuotes: false, hasLectureCaptures: false },
    };
  }
  const content = readFileSync(kbPath, 'utf-8');
  return { content, exists: true, sections: detectSections(content) };
}

const HEADING_MAP: Record<string, string> = {
  core: 'Core Teaching Philosophy',
  course: 'Course-Specific Focus',
  quotes: 'Quotes & Aphorisms',
  lectures: 'From Lecture Captures',
};

function formatEntry(input: UpdatePhilosophyKbInput): string {
  const e = input.entry.trim();
  if (input.section === 'quotes' || input.section === 'lectures') {
    return e.startsWith('- ') ? e : `- ${e}`;
  }
  return e;
}

function appendToCourseSection(
  content: string,
  courseSectionAfterHeading: number,
  courseSectionEnd: number,
  courseKey: string,
  entry: string
): string {
  const subsectionHeading = `### ${courseKey}`;
  const subsectionIdx = content.indexOf(subsectionHeading, courseSectionAfterHeading);

  if (subsectionIdx === -1 || subsectionIdx >= courseSectionEnd) {
    const before = content.slice(0, courseSectionEnd).trimEnd();
    const after = content.slice(courseSectionEnd);
    return before + `\n\n${subsectionHeading}\n\n${entry.trim()}\n` + after;
  }

  const afterSub = subsectionIdx + subsectionHeading.length;
  const nextSubIdx = content.indexOf('\n### ', afterSub);
  const nextH2Idx = content.indexOf('\n## ', afterSub);
  let subsectionEnd = courseSectionEnd;
  if (nextSubIdx !== -1 && nextSubIdx < subsectionEnd) subsectionEnd = nextSubIdx;
  if (nextH2Idx !== -1 && nextH2Idx < subsectionEnd) subsectionEnd = nextH2Idx;

  const before = content.slice(0, subsectionEnd).trimEnd();
  const after = content.slice(subsectionEnd);
  return before + '\n' + entry.trim() + '\n' + after;
}

function appendToSection(content: string, input: UpdatePhilosophyKbInput): string {
  const heading = HEADING_MAP[input.section];
  const headingPattern = `## ${heading}`;
  const headingIdx = content.indexOf(headingPattern);

  if (headingIdx === -1) {
    return content.trimEnd() + `\n\n## ${heading}\n\n${formatEntry(input)}\n`;
  }

  const afterHeading = headingIdx + headingPattern.length;
  const nextH2Idx = content.indexOf('\n## ', afterHeading);
  const sectionEnd = nextH2Idx === -1 ? content.length : nextH2Idx;

  if (input.section === 'course') {
    return appendToCourseSection(content, afterHeading, sectionEnd, input.courseKey!, input.entry);
  }

  const entry = formatEntry(input);
  const before = content.slice(0, sectionEnd).trimEnd();
  const after = content.slice(sectionEnd);
  return before + '\n' + entry + '\n' + after;
}

export function updatePhilosophyKb(input: UpdatePhilosophyKbInput, kbPath = PHILOSOPHY_KB_PATH): string {
  if (input.section === 'course' && !input.courseKey) {
    throw new Error(
      "courseKey is required when section is 'course' — provide the course name, e.g. 'ITM 370 — AI Augmented Projects'"
    );
  }

  const content = existsSync(kbPath) ? readFileSync(kbPath, 'utf-8') : PHILOSOPHY_TEMPLATE;
  const updated = appendToSection(content, input);
  savePhilosophyKb(updated, kbPath);

  const sectionLabel =
    input.section === 'course' ? `Course-Specific Focus (${input.courseKey})` :
    input.section === 'core' ? 'Core Teaching Philosophy' :
    input.section === 'quotes' ? 'Quotes & Aphorisms' :
    'From Lecture Captures';

  const preview = input.entry.length > 80 ? input.entry.slice(0, 80) + '...' : input.entry;
  return `✓ Added to ${sectionLabel}: "${preview}"`;
}
