# SP14a — fetch_brand_colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `fetch_brand_colors` MCP tool that fetches a brand standards URL, extracts hex colors from inline `<style>` blocks and up to 5 linked stylesheets, and returns a suggested primary/secondary pair with reasoning plus a full ranked color list.

**Architecture:** Pure extraction logic lives in `src/utils/color-extraction.ts` (no I/O, fully unit-testable). HTTP fetching and response formatting live in `src/tools/fetch-brand-colors.ts`. `src/index.ts` registers the tool and dispatches to it.

**Tech Stack:** TypeScript/ESM, `color` package (already a dependency — used in `contrast.ts`), Node.js 18+ built-in `fetch`, `AbortController` for timeouts, Vitest for tests.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/utils/color-extraction.ts` | **Create** | `ColorEntry`, `ColorSuggestion` types; `extractColors()`, `suggestColors()` — pure functions, no I/O |
| `src/tools/fetch-brand-colors.ts` | **Create** | `fetchBrandColors(url)` — HTTP fetch, inline style extraction, stylesheet link extraction, response formatting |
| `tests/color-extraction.test.ts` | **Create** | ~13 tests for `extractColors` and `suggestColors` (pure, no HTTP) |
| `tests/fetch-brand-colors.test.ts` | **Create** | ~6 tests for `fetchBrandColors` using `vi.stubGlobal('fetch', ...)` |
| `src/index.ts` | **Modify** | Add import, tool definition, and handler for `fetch_brand_colors` |

---

## Task 1: `extractColors()` — Types + Hex Extraction

**Files:**
- Create: `tests/color-extraction.test.ts`
- Create: `src/utils/color-extraction.ts`

- [ ] **Step 1: Write the failing tests for `extractColors`**

Create `tests/color-extraction.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractColors } from '../src/utils/color-extraction.js';

describe('extractColors', () => {
  it('extracts 6-digit hex colors from CSS text', () => {
    const result = extractColors('color: #0033A0; background: #D64309;');
    const hexes = result.map(c => c.hex);
    expect(hexes).toContain('#0033A0');
    expect(hexes).toContain('#D64309');
  });

  it('expands 3-digit hex to 6-digit (#03A → #0033AA)', () => {
    const result = extractColors('color: #03A;');
    expect(result[0].hex).toBe('#0033AA');
  });

  it('finds CSS variable values and records variable name', () => {
    const result = extractColors('--color-primary: #0033A0;');
    const entry = result.find(c => c.hex === '#0033A0');
    expect(entry?.cssVar).toBe('--color-primary');
  });

  it('frequency ranking: most-used color appears first', () => {
    const result = extractColors('color: #0033A0; background: #0033A0; border: #D64309;');
    expect(result[0].hex).toBe('#0033A0');
    expect(result[0].count).toBe(2);
  });

  it('does not create duplicate entries for the same hex', () => {
    const result = extractColors('color: #0033A0; color: #0033A0;');
    const entries = result.filter(c => c.hex === '#0033A0');
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(2);
  });

  it('marks near-black (#111111) as structural', () => {
    const result = extractColors('color: #111111;');
    expect(result[0].structural).toBe(true);
  });

  it('marks near-white (#f5f5f5) as structural', () => {
    const result = extractColors('color: #f5f5f5;');
    expect(result[0].structural).toBe(true);
  });

  it('marks mid-gray (#888888) as structural', () => {
    const result = extractColors('color: #888888;');
    expect(result[0].structural).toBe(true);
  });

  it('does not mark branded blue (#0033A0) as structural', () => {
    const result = extractColors('color: #0033A0;');
    expect(result[0].structural).toBe(false);
  });

  it('returns empty array for empty CSS text', () => {
    expect(extractColors('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail with import error**

```
npx vitest run tests/color-extraction.test.ts
```

Expected: FAIL — `Cannot find module '../src/utils/color-extraction.js'`

- [ ] **Step 3: Create `src/utils/color-extraction.ts` with types + `extractColors`**

```typescript
import Color from 'color';

export interface ColorEntry {
  hex: string;
  count: number;
  cssVar?: string;
  structural: boolean;
}

export interface ColorSuggestion {
  primary: ColorEntry;
  secondary: ColorEntry | null;
  source: 'css-variables' | 'frequency';
}

function expandHex(hex: string): string {
  // #RGB → #RRGGBB
  if (hex.length === 4) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

function isStructural(hex: string): boolean {
  const hsl = Color(hex).hsl().object() as { h: number; s: number; l: number };
  if (hsl.l < 12) return true;   // near-black
  if (hsl.l > 88) return true;   // near-white
  if (hsl.s < 10 && hsl.l >= 20 && hsl.l <= 80) return true;  // mid-gray
  return false;
}

export function extractColors(cssText: string): ColorEntry[] {
  const entryMap = new Map<string, ColorEntry>();

  // Pass 1: Count all hex occurrences
  const hexRegex = /#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}(?![0-9A-Fa-f])/g;
  let m: RegExpExecArray | null;
  while ((m = hexRegex.exec(cssText)) !== null) {
    const hex = expandHex(m[0]).toUpperCase();
    const existing = entryMap.get(hex);
    if (existing) {
      existing.count++;
    } else {
      entryMap.set(hex, { hex, count: 1, structural: isStructural(hex) });
    }
  }

  // Pass 2: Associate CSS variable names (first cssVar wins per hex)
  const varRegex = /(--[a-z][a-z0-9-]*)\s*:\s*(#[0-9A-Fa-f]{3,6})(?![0-9A-Fa-f])/g;
  while ((m = varRegex.exec(cssText)) !== null) {
    const cssVar = m[1];
    const hex = expandHex(m[2]).toUpperCase();
    const existing = entryMap.get(hex);
    if (existing && !existing.cssVar) {
      existing.cssVar = cssVar;
    }
  }

  return Array.from(entryMap.values()).sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Run tests — verify all 10 pass**

```
npx vitest run tests/color-extraction.test.ts
```

Expected: PASS — 10 tests pass

- [ ] **Step 5: Commit**

```
git add src/utils/color-extraction.ts tests/color-extraction.test.ts
git commit -m "feat(SP14a): add extractColors — hex extraction + structural marking"
```

---

## Task 2: `suggestColors()` — Color Suggestion Logic

**Files:**
- Modify: `tests/color-extraction.test.ts` (add `suggestColors` describe block)
- Modify: `src/utils/color-extraction.ts` (add `hueDifference` + `suggestColors`)

- [ ] **Step 1: Add failing tests for `suggestColors`**

Add to the bottom of `tests/color-extraction.test.ts` (after the closing `}` of the `extractColors` describe block):

```typescript
import { suggestColors } from '../src/utils/color-extraction.js';
```

Update the existing import line at the top to include `suggestColors`:

```typescript
import { extractColors, suggestColors } from '../src/utils/color-extraction.js';
```

Then add this describe block at the end of the file:

```typescript
describe('suggestColors', () => {
  it('uses CSS variable name for primary when available (prefers --color-primary)', () => {
    const colors = extractColors('--color-primary: #0033A0; --color-accent: #D64309;');
    const suggestion = suggestColors(colors);
    expect(suggestion?.source).toBe('css-variables');
    expect(suggestion?.primary.cssVar).toBe('--color-primary');
  });

  it('uses CSS variable name for secondary when available (prefers --color-accent)', () => {
    const colors = extractColors('--color-primary: #0033A0; --color-accent: #D64309;');
    const suggestion = suggestColors(colors);
    expect(suggestion?.secondary?.cssVar).toBe('--color-accent');
  });

  it('falls back to frequency when no variable names', () => {
    const css = 'color: #0033A0; color: #0033A0; border: #D64309;';
    const colors = extractColors(css);
    const suggestion = suggestColors(colors);
    expect(suggestion?.source).toBe('frequency');
    expect(suggestion?.primary.hex).toBe('#0033A0');
  });

  it('returns null secondary when all non-structural colors are within 15 degrees hue', () => {
    // #0033A0 (H≈222°) and #002277 (H≈222°) are nearly identical blues
    const css = 'color: #0033A0; color: #0033A0; color: #002277;';
    const colors = extractColors(css);
    const suggestion = suggestColors(colors);
    expect(suggestion?.secondary).toBeNull();
  });

  it('returns null when there are no non-structural colors', () => {
    // #000000 (near-black) and #ffffff (near-white) are both structural
    const colors = extractColors('color: #000000; background: #ffffff;');
    expect(suggestColors(colors)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify new tests fail**

```
npx vitest run tests/color-extraction.test.ts
```

Expected: FAIL — `suggestColors is not a function` (or similar export error)

- [ ] **Step 3: Add `suggestColors` to `src/utils/color-extraction.ts`**

Add these two functions after `extractColors` (append to the file):

```typescript
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
```

- [ ] **Step 4: Run all color-extraction tests — verify all 15 pass**

```
npx vitest run tests/color-extraction.test.ts
```

Expected: PASS — 15 tests pass

- [ ] **Step 5: Commit**

```
git add src/utils/color-extraction.ts tests/color-extraction.test.ts
git commit -m "feat(SP14a): add suggestColors — CSS variable and frequency suggestion paths"
```

---

## Task 3: `fetchBrandColors()` — HTTP Fetch + Response Formatting

**Files:**
- Create: `tests/fetch-brand-colors.test.ts`
- Create: `src/tools/fetch-brand-colors.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/fetch-brand-colors.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchBrandColors } from '../src/tools/fetch-brand-colors.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchBrandColors', () => {
  it('rejects non-https URL before any fetch call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchBrandColors('http://example.com/brand');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('Brand URL Unreachable');
  });

  it('returns suggestion and full list when CSS vars present in inline <style>', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><style>--color-primary: #0033A0; --color-accent: #D64309;</style></html>',
    }));
    const result = await fetchBrandColors('https://example.com/brand');
    expect(result).toContain('## Brand Colors');
    expect(result).toContain('Suggested primary');
    expect(result).toContain('#0033A0');
    expect(result).toContain('--color-primary');
  });

  it('falls back to frequency ranking when no CSS vars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><style>color: #0033A0; color: #0033A0; border: #D64309;</style></html>',
    }));
    const result = await fetchBrandColors('https://example.com/brand');
    expect(result).toContain('frequency ranking');
  });

  it('returns formatted error string (not a throw) when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const result = await fetchBrandColors('https://unreachable.example.com/brand');
    expect(result).toContain('Brand URL Unreachable');
    expect(result).toContain('Connection refused');
  });

  it('fetches linked stylesheets — verifies second fetch called for <link> href', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '<html><link rel="stylesheet" href="/style.css"></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '--color-primary: #0033A0;',
      });
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchBrandColors('https://example.com/brand');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/style.css',
      expect.anything(),
    );
    expect(result).toContain('#0033A0');
  });

  it('caps at MAX_STYLESHEETS — 6 <link> tags results in only 5 stylesheet fetches', async () => {
    const links = Array.from(
      { length: 6 },
      (_, i) => `<link rel="stylesheet" href="/style${i}.css">`,
    ).join('\n');
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html>${links}</html>`,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchBrandColors('https://example.com/brand');
    // 1 page + 5 stylesheets = 6 total (not 7)
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail with import error**

```
npx vitest run tests/fetch-brand-colors.test.ts
```

Expected: FAIL — `Cannot find module '../src/tools/fetch-brand-colors.js'`

- [ ] **Step 3: Create `src/tools/fetch-brand-colors.ts`**

```typescript
import { extractColors, suggestColors } from '../utils/color-extraction.js';
import { formatError } from '../utils/errors.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_STYLESHEETS = 5;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractInlineStyles(html: string): string {
  const parts: string[] = [];
  const regex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    parts.push(m[1]);
  }
  return parts.join('\n');
}

function extractStylesheetLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkTagRegex = /<link[^>]+>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = linkTagRegex.exec(html)) !== null) {
    const tagStr = tag[0];
    if (/rel=["']stylesheet["']/i.test(tagStr)) {
      const hrefMatch = /href=["']([^"']+)["']/i.exec(tagStr);
      if (hrefMatch) {
        try {
          links.push(new URL(hrefMatch[1], baseUrl).href);
        } catch {
          // Skip unparseable hrefs
        }
      }
    }
  }
  return links.slice(0, MAX_STYLESHEETS);
}

function brandUrlError(url: string, cause: string): string {
  return formatError({
    title: 'Canvas Design Studio — Brand URL Unreachable',
    message: `Could not fetch ${url}.`,
    cause,
    fix: [
      'Confirm the URL is correct and publicly accessible',
      'Try opening it in a browser to verify',
      'If the page requires login, copy the hex values manually',
    ],
    context: 'fetch_brand_colors unreachable URL',
  });
}

export async function fetchBrandColors(url: string): Promise<string> {
  if (!url.startsWith('https://')) {
    return brandUrlError(url, 'URL must start with https://');
  }

  let html: string;
  try {
    const resp = await fetchWithTimeout(url);
    html = await resp.text();
  } catch (err) {
    return brandUrlError(url, err instanceof Error ? err.message : String(err));
  }

  const hostname = new URL(url).hostname;
  const inlineCSS = extractInlineStyles(html);
  const stylesheetLinks = extractStylesheetLinks(html, url);

  const stylesheetTexts = await Promise.all(
    stylesheetLinks.map(async (href) => {
      try {
        const resp = await fetchWithTimeout(href);
        return await resp.text();
      } catch {
        return '';
      }
    }),
  );

  const allCSS = [inlineCSS, ...stylesheetTexts].join('\n');
  const colors = extractColors(allCSS);

  if (colors.length === 0) {
    return [
      `No hex colors found at ${url}.`,
      '',
      'The page may load colors via JavaScript or a CDN that requires a browser to render.',
      'Try opening the URL manually and copying hex values from the brand guidelines.',
    ].join('\n');
  }

  const suggestion = suggestColors(colors);
  const lines: string[] = [`## Brand Colors — ${hostname}`, ''];

  if (suggestion) {
    const primaryLabel =
      suggestion.source === 'css-variables' && suggestion.primary.cssVar
        ? `${suggestion.primary.cssVar}, ${suggestion.primary.count} uses`
        : `frequency ranking, ${suggestion.primary.count} uses`;
    lines.push(`Suggested primary:   ${suggestion.primary.hex}  (${primaryLabel})`);

    if (suggestion.secondary) {
      const secondaryLabel =
        suggestion.source === 'css-variables' && suggestion.secondary.cssVar
          ? `${suggestion.secondary.cssVar}, ${suggestion.secondary.count} uses`
          : `frequency ranking, ${suggestion.secondary.count} uses`;
      lines.push(`Suggested secondary: ${suggestion.secondary.hex}  (${secondaryLabel})`);
    } else {
      lines.push(
        'No distinct secondary color found — all non-structural colors are similar hues.',
      );
    }
  }

  lines.push('', 'Full color list:');
  for (const c of colors) {
    const varPart = c.cssVar ? `   ${c.cssVar}` : '';
    const structPart = c.structural ? '   (structural)' : '';
    lines.push(`  ${c.hex}  ${String(c.count).padStart(2)} uses${varPart}${structPart}`);
  }

  const primaryHex = suggestion?.primary.hex ?? '…';
  const secondaryHex = suggestion?.secondary?.hex ?? '…';
  lines.push('');
  lines.push('To apply: run setup_institution and enter these hex values when prompted,');
  lines.push(`or say "set primary to ${primaryHex} and secondary to ${secondaryHex}".`);

  return lines.join('\n');
}
```

- [ ] **Step 4: Run fetch-brand-colors tests — verify all 6 pass**

```
npx vitest run tests/fetch-brand-colors.test.ts
```

Expected: PASS — 6 tests pass

- [ ] **Step 5: Run the full test suite — verify no regressions**

```
npm run test
```

Expected: all existing tests still pass plus the new 21 tests

- [ ] **Step 6: Commit**

```
git add src/tools/fetch-brand-colors.ts tests/fetch-brand-colors.test.ts
git commit -m "feat(SP14a): add fetchBrandColors — HTTP fetch, stylesheet scraping, color formatting"
```

---

## Task 4: Register `fetch_brand_colors` in `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the import**

After the existing imports (after line 49, `import { parseWorksheet } ...`), add:

```typescript
import { fetchBrandColors } from './tools/fetch-brand-colors.js';
```

- [ ] **Step 2: Add the tool definition**

In `src/index.ts`, locate the `import_course` tool definition block (ends around line 420 with `},`). Add the following immediately before the closing `]` of the tools array (the `],` on line 422):

```typescript
      {
        name: 'fetch_brand_colors',
        description: 'Fetch a brand standards URL and extract color candidates. Returns a suggested primary and secondary color with reasoning, plus the full ranked color list. Pass the URL from the professor\'s brand page.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            url: {
              type: 'string',
              description: 'The brand standards page URL (must start with https://)',
            },
          },
          required: ['url'],
        },
      },
```

- [ ] **Step 3: Add the handler**

In `src/index.ts`, locate the `return { content: [{ type: 'text', text: \`Unknown tool: ${name}\` }]` block (around line 852). Add the following immediately before it:

```typescript
      if (name === 'fetch_brand_colors') {
        const { url } = args as { url: string };
        return { content: [{ type: 'text', text: await fetchBrandColors(url) }] };
      }
```

- [ ] **Step 4: Run the full test suite — verify all tests still pass**

```
npm run test
```

Expected: all tests pass (count should match prior run — no index.ts test file exists)

- [ ] **Step 5: Build to verify TypeScript compiles cleanly**

```
npm run build
```

Expected: exits with code 0, no type errors

- [ ] **Step 6: Commit**

```
git add src/index.ts
git commit -m "feat(SP14a): register fetch_brand_colors tool in MCP server"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Covered by |
|-----------------|------------|
| URL `https://` validation | Task 3 (brandUrlError), tested |
| 10s timeout per request | Task 3 (fetchWithTimeout with AbortController) |
| Fetch HTML page | Task 3 (fetchWithTimeout + resp.text()) |
| Extract `<style>` block contents | Task 3 (extractInlineStyles) |
| Extract `<link rel="stylesheet">` hrefs, resolve relative | Task 3 (extractStylesheetLinks + new URL) |
| Max 5 stylesheets | Task 3 (MAX_STYLESHEETS = 5), tested |
| Failed stylesheet fetches silently skipped | Task 3 (try/catch returns '') |
| Combine all CSS text | Task 3 (join array) |
| 6-digit hex extraction | Task 1, tested |
| 3-digit hex expansion | Task 1, tested |
| CSS variable name recording | Task 1, tested |
| Frequency count / ranking | Task 1, tested |
| Near-black structural marking | Task 1, tested |
| Near-white structural marking | Task 1, tested |
| Mid-gray structural marking | Task 1, tested |
| Branded blue NOT structural | Task 1, tested |
| CSS variable suggestion path (primary, secondary keywords) | Task 2, tested |
| Frequency fallback path | Task 2, tested |
| Secondary null when hue diff ≤ 15° | Task 2, tested |
| null when no non-structural colors | Task 2, tested |
| Happy path markdown output format | Task 3 (formatBrandColors), tested via content assertions |
| "frequency ranking" label when source='frequency' | Task 3, tested |
| "No distinct secondary" message | Task 3 (else branch) |
| "No hex colors found" message | Task 3 (colors.length === 0 branch) |
| Unreachable URL error via formatError | Task 3 (brandUrlError), tested |
| Tool definition in index.ts | Task 4 |
| Handler in index.ts | Task 4 |
| No new dependencies | Confirmed — uses existing `color` package + built-in fetch |
| No wizard/worksheet changes | Confirmed — not touched |

**Placeholder scan:** No TBDs, TODOs, or "similar to" references found.

**Type consistency:**
- `ColorEntry` defined in Task 1, used in Task 2 (`suggestColors` return type) and Task 3 (via import) ✓
- `ColorSuggestion` defined in Task 1, returned by `suggestColors` in Task 2, consumed in Task 3 ✓
- `extractColors(cssText: string): ColorEntry[]` — called with string in Task 3 ✓
- `suggestColors(colors: ColorEntry[]): ColorSuggestion | null` — called with `extractColors` result in Task 3 ✓
- `fetchBrandColors(url: string): Promise<string>` — `await`ed in Task 4 handler ✓
