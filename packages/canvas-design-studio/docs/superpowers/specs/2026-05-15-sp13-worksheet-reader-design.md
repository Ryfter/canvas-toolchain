# SP13 — Worksheet Reader Design Spec

**Goal:** When a professor has filled out `setup-worksheet.md`, they can hand it to the wizard instead of answering every prompt from scratch. A new `get_setup_worksheet` tool makes the blank template accessible without needing the repo.

**Approach:** Add a `worksheetContent` parameter to `setup_institution`. Parse the markdown in a new utility. Pass parsed values as defaults to `runWizard()`. Add `get_setup_worksheet` to return the blank template.

**Tech Stack:** TypeScript/ESM, Node.js 18+, MCP SDK, `@inquirer/prompts`, existing `src/utils/` patterns.

---

## What This Is Not

No new Canvas functionality. No new page types. No changes to any tool other than `setup_institution`. The wizard's interactive flow is unchanged for users who don't pass a worksheet — zero breaking changes.

---

## File Map

```
src/
  utils/
    worksheet.ts          ← NEW: WizardDefaults, parseWorksheet()
  tools/
    get-setup-worksheet.ts  ← NEW: getSetupWorksheet()
  wizard.ts               ← MODIFIED: runWizard(defaults?: WizardDefaults)
  index.ts                ← MODIFIED: register get_setup_worksheet, add worksheetContent param

tests/
  worksheet.test.ts       ← NEW: ~15 tests
  get-setup-worksheet.test.ts  ← NEW: ~3 tests
  wizard.test.ts          ← EXTENDED: ~5 new tests

package.json              ← MODIFIED: add docs/setup-worksheet.md to files array
```

---

## `src/utils/worksheet.ts` (new)

### `WizardDefaults` interface

```typescript
export interface WizardDefaults {
  institution?: string;
  brandUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  canvasUrl?: string;
  apiToken?: string;
  professorEmail?: string;
  favoriteCourses?: string;       // raw comma-separated string
  panoptoDomain?: string;
  panoptoClientId?: string;
  panoptoClientSecret?: string;
  philosophyAnswers?: string[];   // up to 6 answers, indexed 0–5
}
```

### `parseWorksheet(content: string): WizardDefaults`

Scans the worksheet markdown and extracts filled `Your answer:` values. Returns only the fields that have non-blank values — fields left as `___` or empty are absent from the result.

**Parsing rules:**

1. Split content into sections by `## ` headings
2. For each known section heading, find the `Your answer:` line in the code block that follows
3. Extract the value after `Your answer: ` — strip leading/trailing whitespace
4. A value is blank if it is: empty string, whitespace-only, or matches `/^_+$/`
5. Blank values are excluded from the returned object

**Section → field mapping:**

| Section heading | Field(s) |
|---|---|
| `## Brand Standards` | `brandUrl` — from the `Brand standards URL:` line (not a `Your answer:` line — parse `Brand standards URL: <value>` directly) |
| `## Institution Name` | `institution` |
| `## Primary Brand Color` | `primaryColor` |
| `## Secondary / Accent Color` | `secondaryColor` |
| `## Canvas Base URL` | `canvasUrl` |
| `## Canvas API Token` | `apiToken` |
| `## Professor Email` | `professorEmail` |
| `## Favorite Canvas Course IDs` | `favoriteCourses` |
| `## Panopto Domain` | `panoptoDomain` |
| `## Panopto API Client ID and Secret` | `panoptoClientId` (first `Your answer:`) and `panoptoClientSecret` (second `Your answer:`) |
| `## Teaching Philosophy` | `philosophyAnswers[]` — one entry per numbered question block (`Your answer:` lines, in order, skipping blanks but preserving index position) |

**Brand URL special case:** The Brand Standards section has `Brand standards URL: ___` (not a `Your answer:` line). Parse it with: find the line starting with `Brand standards URL:` and extract the value after the colon.

**Philosophy answers:** The worksheet has 6 numbered questions, each with a `Your answer:` line inside a code block. Collect them in order into `philosophyAnswers[0..5]`. If a question is blank, set that index to `undefined` (sparse array is fine — the wizard checks `philosophyAnswers[n]`).

---

## `src/tools/get-setup-worksheet.ts` (new)

```typescript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const WORKSHEET_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/setup-worksheet.md'
);

const AI_HOST_PREFIX = [
  '> **For AI hosts:** Save this file as `setup-worksheet.md` in the professor\'s working directory.',
  '> Ask the professor to fill it out at their own pace, then call `setup_institution` with `worksheetContent` set to the file\'s contents.',
  '',
].join('\n');

export function getSetupWorksheet(): string {
  const template = readFileSync(WORKSHEET_PATH, 'utf8');
  return AI_HOST_PREFIX + template;
}
```

**Registration in `src/index.ts`:**
```typescript
{
  name: 'get_setup_worksheet',
  description: 'Get the blank setup worksheet template. Save it as setup-worksheet.md, have the professor fill it out, then pass the contents to setup_institution via worksheetContent.',
  inputSchema: { type: 'object', properties: {} },
}
```

---

## `src/wizard.ts` modifications

### Signature change

```typescript
export async function runWizard(defaults?: WizardDefaults): Promise<InstitutionConfig>
```

### Summary display (before first prompt)

When `defaults` is defined and has at least one field:

```
┌─────────────────────────────────────────────────────────┐
│  Values from your setup worksheet:                       │
└─────────────────────────────────────────────────────────┘

  Institution:    Boise State University
  Brand URL:      https://www.boisestate.edu/brand/
  Primary color:  #0033A0
  Secondary:      #D64309
  Canvas URL:     https://boisestate.instructure.com
  API token:      ✓ (provided)
  Email:          you@boisestate.edu
  Courses:        12345, 67890
  Panopto:        bsu.hosted.panopto.com

  Press Enter to accept each value, or type to override.
```

Only fields present in `defaults` appear in the summary. `apiToken` displays as `✓ (provided)` rather than the raw value.

### Default injection per prompt

Each `input()` call gains a conditional default:

```typescript
const institution = await input({
  message: 'Institution name ...',
  default: defaults?.institution ?? 'Boise State University',
});
```

Same pattern for all fields. The `password()` call for `apiToken` cannot use `default:` (inquirer limitation) — instead, print a note before the prompt: `  ✓ Worksheet value will be used if you leave this blank.` and handle an empty response by falling back to `defaults?.apiToken`.

### Philosophy pre-fill

The philosophy section already checks `if (!kbResult.exists)`. Within the 6-question loop, use the worksheet default if present:

```typescript
for (let i = 0; i < philosophyQuestions.length; i++) {
  const answer = await input({
    message: philosophyQuestions[i],
    default: defaults?.philosophyAnswers?.[i] ?? '',
  });
  if (answer.trim()) answers.push(answer.trim());
}
```

### No-defaults path unchanged

If `defaults` is `undefined`, every `default:` value falls back to the existing hardcoded default. No behavior change.

---

## `src/index.ts` modifications

### `setup_institution` input schema

```typescript
{
  name: 'setup_institution',
  description: 'Re-run the setup wizard to update institution config. Pass worksheetContent (from a filled setup-worksheet.md) to pre-fill answers.',
  inputSchema: {
    type: 'object',
    properties: {
      worksheetContent: {
        type: 'string',
        description: 'Contents of a filled setup-worksheet.md file. Pre-fills wizard prompts — professor confirms or overrides each value.',
      },
    },
  },
}
```

### Handler

```typescript
if (name === 'setup_institution') {
  const { worksheetContent } = args as { worksheetContent?: string };
  const defaults = worksheetContent ? parseWorksheet(worksheetContent) : undefined;
  const config = await runWizard(defaults);
  return { content: [{ type: 'text', text: formatSetupSummary(config) }] };
}
```

### `get_setup_worksheet` handler

```typescript
if (name === 'get_setup_worksheet') {
  return { content: [{ type: 'text', text: getSetupWorksheet() }] };
}
```

---

## `package.json` modification

Add `docs/setup-worksheet.md` to the `files` array so it is included in the npm package and readable via `import.meta.url` at runtime:

```json
"files": [
  "CLAUDE.md",
  "DESIGN.md",
  "dist/",
  "docs/canvas-design-kb/",
  "docs/feature-roadmap.md",
  "docs/installation.md",
  "docs/npm-publishing.md",
  "docs/setup-worksheet.md",
  "PROFESSOR-INSTRUCTIONS.txt",
  ...
]
```

---

## Tests

### `tests/worksheet.test.ts` (~15 tests)

- Fully filled worksheet returns all fields
- Blank `___` values are excluded from result
- Partial worksheet (only institution + colors) returns only those fields
- API token value extracted correctly
- `favoriteCourses` preserved as raw comma string
- `philosophyAnswers` has correct content at correct indices
- Blank philosophy answers leave that index `undefined`
- Panopto section extracts both `panoptoClientId` and `panoptoClientSecret`
- `brandUrl` extracted from `Brand standards URL:` line (not `Your answer:`)
- Whitespace trimmed from all values
- Empty string input returns `{}`
- Values with trailing spaces trimmed

### `tests/get-setup-worksheet.test.ts` (~3 tests)

- Return value contains `## Institution Name`
- Return value contains `## Teaching Philosophy`
- Return value contains AI-host prefix (`For AI hosts:`)

### `tests/wizard.test.ts` (5 new tests)

- Summary block printed when defaults present (check `console.log` mock for `Values from your setup worksheet`)
- API token shows `✓ (provided)` in summary, not raw value
- Only fields present in defaults appear in summary
- No summary block printed when `defaults` is `undefined`
- Philosophy answer default used when `philosophyAnswers[n]` is set

---

## What Does Not Change

- All existing tool parameters and return shapes
- The wizard's interactive flow when called without `worksheetContent`
- `institution.json` schema — no new fields
- Any tool other than `setup_institution`
