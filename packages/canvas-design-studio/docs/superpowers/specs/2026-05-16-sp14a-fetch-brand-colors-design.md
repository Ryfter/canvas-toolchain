# SP14a — fetch_brand_colors Design Spec

**Goal:** Add a `fetch_brand_colors` tool that fetches a brand standards URL, extracts hex colors from the page and its linked stylesheets, and returns a suggested primary/secondary pair with reasoning plus a ranked full list.

**Approach:** Split extraction logic (pure functions, no I/O) into `src/utils/color-extraction.ts`. The tool file `src/tools/fetch-brand-colors.ts` handles HTTP and response formatting. Uses Node.js built-in `fetch` (Node 18+) — no new dependencies.

**Tech Stack:** TypeScript/ESM, Node.js 18+ built-in `fetch`, vitest, existing `src/utils/errors.ts` pattern.

---

## What This Is Not

No changes to the wizard or `setup_institution`. No automatic color application — the tool returns candidates; the professor tells the AI which to use, then runs `setup_institution`. No Canvas API calls.

---

## File Map

```
src/
  utils/
    color-extraction.ts      ← NEW: extractColors(), suggestColors()
  tools/
    fetch-brand-colors.ts    ← NEW: fetchBrandColors()
  index.ts                   ← MODIFIED: register fetch_brand_colors

tests/
  color-extraction.test.ts   ← NEW: ~12 tests
  fetch-brand-colors.test.ts ← NEW: ~5 tests
```

---

## `src/utils/color-extraction.ts` (new)

### Types

```typescript
export interface ColorEntry {
  hex: string;           // normalized 6-digit uppercase, e.g. "#0033A0"
  count: number;         // occurrences in all CSS text
  cssVar?: string;       // CSS variable name if sourced from one, e.g. "--color-primary"
  structural: boolean;   // true if near-black, near-white, or mid-gray
}

export interface ColorSuggestion {
  primary: ColorEntry;
  secondary: ColorEntry | null;
  source: 'css-variables' | 'frequency';
}

```

### `extractColors(cssText: string): ColorEntry[]`

1. **CSS variable pass:** Find all `--[a-z-]+:\s*(#[0-9A-Fa-f]{3,6})` patterns. Record variable name and hex value. Include in frequency count.
2. **Hex pass:** Find all `#[0-9A-Fa-f]{6}` and `#[0-9A-Fa-f]{3}` (expand 3-digit to 6-digit by doubling each nibble: `#RGB` → `#RRGGBB`). Count occurrences.
3. **Normalize:** Uppercase all hex values.
4. **Merge:** Combine variable-sourced and frequency-sourced entries. If the same hex appears in both, merge into one entry preserving the `cssVar` name.
5. **Mark structural:**
   - Near-black: luminance < 12% (covers `#000000`–roughly `#222222`)
   - Near-white: luminance > 88% (covers roughly `#dddddd`–`#ffffff`)
   - Mid-gray: saturation < 10% AND luminance between 20%–80%
   - Luminance and saturation computed from hex via standard RGB→HSL conversion
6. **Sort:** By `count` descending.

### `suggestColors(colors: ColorEntry[]): ColorSuggestion | null`

Returns `null` if there are no non-structural colors.

**CSS variable path** (used when any non-structural color has a `cssVar`):
- Primary: first non-structural color whose `cssVar` contains `primary`, `brand`, or `main`. If none, first non-structural color with any `cssVar`.
- Secondary: first non-structural color whose `cssVar` contains `secondary`, `accent`, or `highlight`, and whose hex differs from primary. If none, first non-structural non-primary color with any `cssVar`.
- `source: 'css-variables'`

**Frequency fallback** (used when no non-structural color has a `cssVar`):
- Primary: highest-count non-structural color.
- Secondary: highest-count non-structural color with hue differing from primary by > 15° (to avoid suggesting two nearly-identical shades). If none qualifies, `secondary: null`.
- `source: 'frequency'`

**Hue difference:** Computed from hex via RGB→HSL. Hue is 0–360°; difference is the minimum arc distance (e.g. hue 10° and 355° differ by 15°, not 345°).

---

## `src/tools/fetch-brand-colors.ts` (new)

### HTTP fetching

```typescript
const FETCH_TIMEOUT_MS = 10_000;
const MAX_STYLESHEETS = 5;
```

1. Validate `url` starts with `https://`. If not, return formatted error immediately.
2. Fetch the HTML page with a 10s timeout using `AbortController`.
3. Extract `<style>` block contents.
4. Extract `<link rel="stylesheet" href="...">` hrefs. Resolve relative hrefs to absolute URLs using the base URL. Take the first `MAX_STYLESHEETS`.
5. Fetch each stylesheet (10s timeout each, failures silently skipped — one broken stylesheet should not abort the whole operation).
6. Combine all CSS text.
7. Call `extractColors(cssText)` then `suggestColors(colors)`.
8. Format and return.

### `fetchBrandColors(url: string): string`

Returns a markdown string.

**Happy path:**

```
## Brand Colors — {hostname}

Suggested primary:   #0033A0  (--color-primary, 23 uses)
Suggested secondary: #D64309  (--color-accent, 8 uses)

Full color list:
  #0033A0  23 uses   --color-primary
  #D64309   8 uses   --color-accent
  #002277   6 uses   --color-primary-dark
  #E6ECF9   4 uses
  #1A1A1A  31 uses   (structural)
  #ffffff  45 uses   (structural)

To apply: run setup_institution and enter these hex values when prompted,
or say "set primary to #0033A0 and secondary to #D64309".
```

When `source` is `'frequency'`, the suggestion lines read `(frequency ranking, 23 uses)` instead of a variable name.

When `secondary` is `null`, omit the secondary suggestion line and note: `No distinct secondary color found — all non-structural colors are similar hues.`

**No colors found:**

```
No hex colors found at {url}.

The page may load colors via JavaScript or a CDN that requires a browser to render.
Try opening the URL manually and copying hex values from the brand guidelines.
```

**Error (unreachable / timeout):**

Uses `formatError()` from `src/utils/errors.ts`:
```
Canvas Design Studio — Brand URL Unreachable
Could not fetch {url}.
Cause: [error message]
Fix:
  1. Confirm the URL is correct and publicly accessible
  2. Try opening it in a browser to verify
  3. If the page requires login, copy the hex values manually
```

### Registration in `src/index.ts`

```typescript
{
  name: 'fetch_brand_colors',
  description: 'Fetch a brand standards URL and extract color candidates. Returns a suggested primary and secondary color with reasoning, plus the full ranked color list. Pass the URL from the professor\'s brand page.',
  inputSchema: {
    type: 'object',
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

Handler:

```typescript
if (name === 'fetch_brand_colors') {
  const { url } = args as { url: string };
  return { content: [{ type: 'text', text: await fetchBrandColors(url) }] };
}
```

---

## Tests

### `tests/color-extraction.test.ts` (~12 tests)

All tests pass raw CSS strings — no HTTP, no filesystem.

- Extracts 6-digit hex colors from CSS text
- Expands `#RGB` 3-digit to `#RRGGBB` (e.g. `#03A` → `#0033AA`)
- Finds CSS variable values and records variable name
- Frequency ranking: most-used color appears first
- Near-black (`#111111`) marked as structural
- Near-white (`#f5f5f5`) marked as structural
- Mid-gray (`#888888`) marked as structural
- Branded blue (`#0033A0`) not marked as structural
- `suggestColors`: uses CSS variable name for primary when available (`--color-primary`)
- `suggestColors`: uses CSS variable name for secondary when available (`--color-accent`)
- `suggestColors`: falls back to frequency when no variable names
- `suggestColors`: skips secondary if all non-structural colors are within 15° hue
- Empty CSS text returns `{ suggestion: null, colors: [] }`

### `tests/fetch-brand-colors.test.ts` (~6 tests)

Mock `fetch` globally with `vi.stubGlobal('fetch', ...)`.

- Returns suggestion and full list when CSS vars present in inline `<style>`
- Falls back to frequency ranking when no CSS vars
- Returns formatted error string (not a throw) when fetch rejects
- Fetches linked stylesheets (mock returns one `<link>` href, verify second fetch called)
- Caps at `MAX_STYLESHEETS` — a page with 6 `<link>` tags results in only 5 stylesheet fetches
- Rejects non-https URL before any fetch call

---

## What Does Not Change

- All existing tools and parameters
- `institution.json` schema — `brandUrl` is already stored there; this tool reads a URL parameter instead
- The wizard — no changes
- `src/utils/worksheet.ts` — no changes
