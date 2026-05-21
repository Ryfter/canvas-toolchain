import Color from 'color';

export interface ColorEntry {
  hex: string;         // normalized 6-digit uppercase, e.g. "#0033A0"
  count: number;       // occurrences in all CSS text
  cssVar?: string;     // CSS variable name if sourced from one, e.g. "--color-primary"
  structural: boolean; // true if near-black, near-white, or mid-gray
}

export interface ColorSuggestion {
  primary: ColorEntry;
  secondary: ColorEntry | null;
  source: 'css-variables' | 'frequency';
}

/**
 * Expand a 3-digit hex string (#RGB) to 6-digit uppercase (#RRGGBB).
 * Input must be exactly 3 hex digits (without the leading #).
 */
function expand3To6(digits: string): string {
  return digits
    .split('')
    .map(c => c + c)
    .join('')
    .toUpperCase();
}

/**
 * Normalize any 3- or 6-digit hex string (with or without #) to
 * uppercase 6-digit form with a leading #.
 */
function normalizeHex(raw: string): string {
  const digits = raw.startsWith('#') ? raw.slice(1) : raw;
  if (digits.length === 3) {
    return '#' + expand3To6(digits);
  }
  return '#' + digits.toUpperCase();
}

/**
 * Determine whether a color is "structural" (near-black, near-white, or
 * mid-gray) using HSL lightness and saturation — NOT WCAG luminance.
 */
function isStructural(hex: string): boolean {
  const hsl = Color(hex).hsl().object() as { h: number; s: number; l: number };
  const nearBlack = hsl.l < 12;
  const nearWhite = hsl.l > 88;
  const midGray = hsl.s < 10 && hsl.l >= 20 && hsl.l <= 80;
  return nearBlack || nearWhite || midGray;
}

/**
 * Extract all hex colors from a CSS text string, deduplicate, count
 * occurrences, associate CSS variable names, and mark structural colors.
 * Returns entries sorted by count descending.
 */
export function extractColors(cssText: string): ColorEntry[] {
  if (!cssText) return [];

  // Map from normalized uppercase hex → mutable entry object
  const map = new Map<string, ColorEntry>();

  // --- Hex pass ---
  // Match 6-digit hex, then 3-digit hex (each not followed by another hex digit)
  const hexPattern = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![0-9A-Fa-f])/g;
  let m: RegExpExecArray | null;

  while ((m = hexPattern.exec(cssText)) !== null) {
    const normalized = normalizeHex(m[0]);
    const existing = map.get(normalized);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(normalized, {
        hex: normalized,
        count: 1,
        structural: isStructural(normalized),
      });
    }
  }

  // --- Variable pass ---
  // Pattern: (--var-name): #hexdigits (3 or 6, not followed by another hex digit)
  const varPattern = /(--[a-z][a-z0-9-]*)\s*:\s*(#[0-9A-Fa-f]{3,6})(?![0-9A-Fa-f])/g;

  while ((m = varPattern.exec(cssText)) !== null) {
    const varName = m[1];
    const normalized = normalizeHex(m[2]);
    const entry = map.get(normalized);
    if (entry && entry.cssVar === undefined) {
      entry.cssVar = varName;
    }
  }

  // --- Sort by count descending ---
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function hueDifference(hex1: string, hex2: string): number {
  const h1 = (Color(hex1).hsl().object() as { h: number; s: number; l: number }).h;
  const h2 = (Color(hex2).hsl().object() as { h: number; s: number; l: number }).h;
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

export function suggestColors(colors: ColorEntry[]): ColorSuggestion | null {
  const nonStructural = colors.filter(c => !c.structural);
  if (nonStructural.length === 0) return null;

  const withVars = nonStructural.filter(c => c.cssVar !== undefined);

  if (withVars.length > 0) {
    const primaryKeywords = ['primary', 'brand', 'main'];
    const secondaryKeywords = ['secondary', 'accent', 'highlight'];

    let primary = withVars.find(c => primaryKeywords.some(k => c.cssVar!.includes(k)));
    if (!primary) primary = withVars[0];

    let secondary: ColorEntry | null =
      withVars.find(c =>
        secondaryKeywords.some(k => c.cssVar!.includes(k)) && c.hex !== primary!.hex
      ) ?? null;
    if (!secondary) {
      secondary = withVars.find(c => c.hex !== primary!.hex) ?? null;
    }

    return { primary, secondary, source: 'css-variables' };
  }

  // Frequency fallback
  const primary = nonStructural[0];
  const secondary =
    nonStructural.find(c => c.hex !== primary.hex && hueDifference(c.hex, primary.hex) > 15) ??
    null;

  return { primary, secondary, source: 'frequency' };
}
