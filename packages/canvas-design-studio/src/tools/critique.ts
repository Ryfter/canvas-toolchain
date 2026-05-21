import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface CritiqueInput {
  html: string;
  pageType: 'assignment' | 'week-overview' | 'course-home' | 'syllabus' | 'other';
  primaryGoal: string;
  audience?: string;
  mode?: 'quick' | 'comprehensive';
}

export interface CritiqueFinding {
  area: 'hierarchy' | 'content' | 'color' | 'typography' | 'layout' | 'completeness';
  issue: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

export interface CritiqueResult {
  score: number;
  mode: 'quick' | 'comprehensive';
  pageType: string;
  strengths: string[];
  findings: CritiqueFinding[];
  kbContext?: string;
}

const DEDUCTIONS: Record<CritiqueFinding['priority'], number> = { high: 15, medium: 8, low: 3 };

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function checkUnreplacedHero(html: string): CritiqueFinding | undefined {
  if (!html.includes('HERO_IMAGE_URL')) return undefined;
  return {
    area: 'completeness',
    issue: 'Hero image placeholder has not been replaced.',
    suggestion: 'Replace HERO_IMAGE_URL with the URL of your hosted 1200×400px banner image.',
    priority: 'high',
  };
}

function checkWallOfText(html: string): CritiqueFinding | undefined {
  const pTag = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pTag.exec(html)) !== null) {
    if (wordCount(stripTags(m[1])) > 80) {
      return {
        area: 'content',
        issue: 'A paragraph exceeds 80 words — hard for students to scan quickly.',
        suggestion: 'Break long paragraphs into bullet points or split across multiple section cards.',
        priority: 'high',
      };
    }
  }
  return undefined;
}

function checkNoHeadings(html: string): CritiqueFinding | undefined {
  if (/<h[23][\s>]/i.test(html)) return undefined;
  return {
    area: 'hierarchy',
    issue: 'Page has no H2 or H3 headings — content has no visible structure.',
    suggestion: 'Add H2 headings to divide major sections. Use H3 for subsections within a card.',
    priority: 'high',
  };
}

function checkTooSparse(html: string): CritiqueFinding | undefined {
  const total = wordCount(stripTags(html));
  if (total >= 100) return undefined;
  return {
    area: 'content',
    issue: `Page contains only ${total} words — looks unfinished.`,
    suggestion: 'Add more content: an overview, details, submission instructions, or grading notes.',
    priority: 'medium',
  };
}

function expandHex3(hex: string): string {
  if (hex.length === 4) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex.toLowerCase();
}

function checkColorChaos(html: string): CritiqueFinding | undefined {
  const hexPattern = /#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}\b/g;
  const colors = new Set((html.match(hexPattern) ?? []).map(expandHex3));
  if (colors.size <= 7) return undefined;
  return {
    area: 'color',
    issue: `${colors.size} distinct colors used — visual palette is fragmented.`,
    suggestion: 'Limit to 6–7 colors: primary, secondary, neutrals, and semantic status colors.',
    priority: 'medium',
  };
}

function checkFontFloor(html: string): CritiqueFinding | undefined {
  const pattern = /font-size:\s*(\d+(?:\.\d+)?)px/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    if (parseFloat(m[1]) < 13) {
      return {
        area: 'typography',
        issue: `Font size ${m[1]}px found — below the 13px minimum for mobile readability.`,
        suggestion: 'Use a minimum of 13px for all visible text.',
        priority: 'medium',
      };
    }
  }
  return undefined;
}

function checkMissingSubmissionLanguage(html: string, pageType: string): CritiqueFinding | undefined {
  if (pageType !== 'assignment') return undefined;
  if (/submit|upload|due|deadline/i.test(html)) return undefined;
  return {
    area: 'completeness',
    issue: 'Assignment page has no submission instructions — students will not know what to do.',
    suggestion: 'Add a section explaining how to submit, the expected format, and the due date.',
    priority: 'medium',
  };
}

function extractDivText(html: string, className: string): string {
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openTagRe = new RegExp(`<div[^>]*class="[^"]*${escapedClass}[^"]*"[^>]*>`);
  const openTagMatch = openTagRe.exec(html);
  if (!openTagMatch) return '';

  const start = openTagMatch.index + openTagMatch[0].length;
  let depth = 1;
  let pos = start;

  while (pos < html.length && depth > 0) {
    const openIdx = html.indexOf('<div', pos);
    const closeIdx = html.indexOf('</div>', pos);
    if (closeIdx < 0) break;

    if (openIdx >= 0 && openIdx < closeIdx) {
      const ch = html[openIdx + 4];
      if (ch === '>' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') depth++;
      pos = openIdx + 4;
    } else {
      depth--;
      if (depth === 0) return stripTags(html.slice(start, closeIdx));
      pos = closeIdx + 6;
    }
  }

  return stripTags(html.slice(start, pos));
}

function checkColumnImbalance(html: string): CritiqueFinding | undefined {
  if (!html.includes('col-md-8') || !html.includes('col-md-4')) return undefined;
  const wideWords = wordCount(extractDivText(html, 'col-md-8'));
  const narrowWords = wordCount(extractDivText(html, 'col-md-4'));
  if (narrowWords === 0 || wideWords / narrowWords <= 3) return undefined;
  return {
    area: 'layout',
    issue: 'Left column has significantly more content than the sidebar — layout feels lopsided.',
    suggestion: 'Move secondary content (grading notes, resources) into the sidebar to balance columns.',
    priority: 'low',
  };
}

function calculateScore(findings: CritiqueFinding[]): number {
  const deduction = findings.reduce((sum, f) => sum + DEDUCTIONS[f.priority], 0);
  return Math.max(0, 100 - deduction);
}

function deriveStrengths(html: string, findings: CritiqueFinding[]): string[] {
  const foundAreas = new Set(findings.map(f => f.area));
  const strengths: string[] = [];
  if (!foundAreas.has('hierarchy') && /<h[23][\s>]/i.test(html)) {
    strengths.push('Clear heading structure');
  }
  if (!foundAreas.has('color')) {
    strengths.push('Consistent color palette');
  }
  if (!foundAreas.has('content')) {
    strengths.push('Well-proportioned content length');
  }
  return strengths.slice(0, 3);
}

function loadKb(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  try {
    return readFileSync(join(__dirname, '../../src/kb/design-principles.md'), 'utf-8');
  } catch {
    return '';
  }
}

export function critiqueCanvasPage(input: CritiqueInput): CritiqueResult {
  const { html, pageType, mode = 'quick' } = input;

  const findings = [
    checkUnreplacedHero(html),
    checkWallOfText(html),
    checkNoHeadings(html),
    checkTooSparse(html),
    checkColorChaos(html),
    checkFontFloor(html),
    checkMissingSubmissionLanguage(html, pageType),
    checkColumnImbalance(html),
  ].filter((f): f is CritiqueFinding => f !== undefined);

  const score = calculateScore(findings);
  const strengths = deriveStrengths(html, findings);

  const result: CritiqueResult = { score, mode, pageType, strengths, findings };

  if (mode === 'comprehensive') {
    const kb = loadKb();
    if (kb) result.kbContext = kb;
  }

  return result;
}
