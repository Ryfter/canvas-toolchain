import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { auditAccessibility, type AccessibilityWarning } from './accessibility.js';
import type { CritiqueFinding } from './critique.js';

export interface RedesignInput {
  html: string;
  findings: CritiqueFinding[];
  mode?: 'quick' | 'comprehensive';
  pageType?: string;
  primaryGoal?: string;
}

export interface RedesignResult {
  html: string;
  appliedFixes: string[];
  skippedFindings: string[];
  accessibilityWarnings?: AccessibilityWarning[];
  kbContext?: string;
}

function fixFontFloor(html: string): { html: string; fixed: boolean } {
  let fixed = false;
  const result = html.replace(/font-size:\s*(\d+(?:\.\d+)?)px/gi, (match, size) => {
    if (parseFloat(size) < 13) {
      fixed = true;
      return 'font-size:13px';
    }
    return match;
  });
  return { html: result, fixed };
}

function fixHeroUrl(html: string): { html: string; fixed: boolean } {
  if (!html.includes('HERO_IMAGE_URL')) return { html, fixed: false };
  const comment = '<!-- Replace HERO_IMAGE_URL with your hosted image URL (1200×400px) -->';
  const result = html.replace(/(<img[^>]*src="HERO_IMAGE_URL"[^>]*>)/i, `${comment}$1`);
  return { html: result, fixed: true };
}

function loadKb(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  try {
    return readFileSync(join(__dirname, '../../src/kb/design-principles.md'), 'utf-8');
  } catch {
    return '';
  }
}

export function redesignCanvasPage(input: RedesignInput): RedesignResult {
  const { findings, mode = 'quick' } = input;
  let { html } = input;
  const appliedFixes: string[] = [];
  const skippedFindings: string[] = [];

  const fontResult = fixFontFloor(html);
  if (fontResult.fixed) {
    html = fontResult.html;
    appliedFixes.push('Bumped all font sizes below 13px to 13px');
  }

  const heroResult = fixHeroUrl(html);
  if (heroResult.fixed) {
    html = heroResult.html;
    appliedFixes.push('Added comment to replace HERO_IMAGE_URL with hosted image URL');
  }

  for (const finding of findings) {
    const isHeroFinding = finding.area === 'completeness' && finding.issue.includes('placeholder');
    const isFontFinding = finding.area === 'typography';
    if ((isHeroFinding && heroResult.fixed) || (isFontFinding && fontResult.fixed)) continue;
    skippedFindings.push(finding.suggestion);
  }

  const a11y = auditAccessibility(html);

  const result: RedesignResult = {
    html,
    appliedFixes,
    skippedFindings,
    ...(a11y.length > 0 && { accessibilityWarnings: a11y }),
  };

  if (mode === 'comprehensive') {
    const kb = loadKb();
    if (kb) result.kbContext = kb;
  }

  return result;
}
