import { wcagContrastRatio } from './contrast.js';

/**
 * @deprecated Prefer the canonical `AccessibilityFinding` model from
 * `@canvas-toolchain/shared-types` via `runConformanceCheck` (src/tools/a11y/).
 * Kept for command-and-control compatibility; removal tracked for Phase 2.
 */
export interface AccessibilityWarning {
  check: string;
  message: string;
  context?: string;
  /** Present only for contrast findings: how close the measured value came. */
  margin?: { measured: number; required: number; unit: string };
}

const VAGUE_LINK_TEXT = new Set([
  'click here', 'here', 'read more', 'more', 'link', 'this link', 'learn more',
]);

const DECORATIVE_SRC = /spacer|pixel|blank|transparent|1x1/i;

function ctx(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + '...' : s;
}

function checkContrast(html: string): AccessibilityWarning[] {
  const warnings: AccessibilityWarning[] = [];
  const styleAttr = /style="([^"]*)"/gi;
  let m: RegExpExecArray | null;

  while ((m = styleAttr.exec(html)) !== null) {
    const style = m[1];
    // Match background-color:#hex and background:#hex shorthand (not gradients/URLs)
    const bgM = /(?:background-color|background):\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/i.exec(style);
    const fgM = /(?<![a-z-])color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/i.exec(style);
    if (!bgM || !fgM) continue;

    let ratio: number;
    try { ratio = wcagContrastRatio(fgM[1], bgM[1]); } catch { continue; }

    const sizeM = /font-size:\s*(\d+(?:\.\d+)?)px/i.exec(style);
    const boldM = /font-weight:\s*(700|bold)\b/i.exec(style);
    const size = sizeM ? parseFloat(sizeM[1]) : 0;
    const isLarge = size >= 24 || (!!boldM && size >= 18);
    const threshold = isLarge ? 3.0 : 4.5;

    if (ratio < threshold) {
      const label = isLarge ? 'large text' : 'body text';
      warnings.push({
        check: 'contrast-ratio',
        message: `${fgM[1]} on ${bgM[1]}: ${ratio.toFixed(2)}:1 — fails WCAG AA for ${label} (requires ${threshold}:1)`,
        context: ctx(style),
        margin: { measured: ratio, required: threshold, unit: 'contrast ratio' },
      });
    }
  }
  return warnings;
}

function checkMeaningfulAlt(html: string): AccessibilityWarning[] {
  const warnings: AccessibilityWarning[] = [];
  const imgTag = /<img[^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = imgTag.exec(html)) !== null) {
    const img = m[0];
    const altM = /\balt=(["'])(.*?)\1/i.exec(img);
    const srcM = /\bsrc=(["'])(.*?)\1/i.exec(img);
    if (!altM || !srcM) continue;
    if (altM[2] === '' && srcM[2] && !DECORATIVE_SRC.test(srcM[2])) {
      warnings.push({
        check: 'empty-alt',
        message: 'Content image has alt="" — add descriptive alt text or confirm it is decorative',
        context: ctx(img),
      });
    }
  }
  return warnings;
}

function checkHeadingHierarchy(html: string): AccessibilityWarning[] {
  const warnings: AccessibilityWarning[] = [];
  const headingTag = /<(h[2-6])[\s>]/gi;
  const seq: Array<{ level: number; tag: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = headingTag.exec(html)) !== null) {
    seq.push({ level: parseInt(m[1][1], 10), tag: m[0] });
  }

  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1].level;
    const curr = seq[i].level;
    if (curr > prev + 1) {
      warnings.push({
        check: 'heading-skip',
        message: `Heading jumps from H${prev} to H${curr} — skipped levels break screen reader navigation`,
        context: ctx(seq[i].tag),
      });
      break;
    }
  }
  return warnings;
}

function checkDescriptiveLinks(html: string): AccessibilityWarning[] {
  const warnings: AccessibilityWarning[] = [];
  const linkTag = /<a[\s][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkTag.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (VAGUE_LINK_TEXT.has(text)) {
      warnings.push({
        check: 'vague-link',
        message: `"${text}" is not descriptive — use text that explains where the link goes`,
        context: ctx(m[0]),
      });
    }
  }
  return warnings;
}

function checkTableHeaders(html: string): AccessibilityWarning[] {
  const warnings: AccessibilityWarning[] = [];
  const tableTag = /<table[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;

  while ((m = tableTag.exec(html)) !== null) {
    if (!/<th[\s>]/i.test(m[0])) {
      warnings.push({
        check: 'table-no-headers',
        message: 'Table has no <th> elements — add headers so screen readers can identify columns and rows',
        context: ctx(m[0]),
      });
    }
  }
  return warnings;
}

function checkPanoptoNoCaptions(html: string): AccessibilityWarning[] {
  const warnings: AccessibilityWarning[] = [];
  const iframeRe = /<iframe[^>]+>/gi;
  let m: RegExpExecArray | null;

  while ((m = iframeRe.exec(html)) !== null) {
    const tag = m[0];
    const srcM = /\bsrc=(["'])(.*?)\1/i.exec(tag);
    if (!srcM) continue;
    const src = srcM[2];
    if (!/panopto/i.test(src)) continue;
    if (/captions=true/i.test(src)) continue;
    warnings.push({
      check: 'video-no-captions',
      message: 'Panopto embed found without captions enabled — add &captions=true to the embed URL.',
      context: ctx(tag),
    });
  }
  return warnings;
}

/**
 * @deprecated Prefer the canonical `AccessibilityFinding` model from
 * `@canvas-toolchain/shared-types` via `runConformanceCheck` (src/tools/a11y/).
 * Kept for command-and-control compatibility; removal tracked for Phase 2.
 */
export function auditAccessibility(html: string): AccessibilityWarning[] {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  return [
    ...checkContrast(stripped),
    ...checkMeaningfulAlt(stripped),
    ...checkHeadingHierarchy(stripped),
    ...checkDescriptiveLinks(stripped),
    ...checkTableHeaders(stripped),
    ...checkPanoptoNoCaptions(stripped),
  ];
}
