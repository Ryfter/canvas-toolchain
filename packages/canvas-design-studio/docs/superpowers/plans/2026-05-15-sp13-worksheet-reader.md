# SP13 — Worksheet Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `worksheetContent` parameter to `setup_institution` that pre-fills wizard prompts from a completed `setup-worksheet.md`, and add a `get_setup_worksheet` tool that returns the blank template.

**Architecture:** `src/utils/worksheet.ts` owns all parsing logic and the `WizardDefaults` type. `src/tools/get-setup-worksheet.ts` reads `docs/setup-worksheet.md` from the package directory. `src/wizard.ts` gains an optional `defaults` parameter and a `formatWorksheetSummary()` export. `src/index.ts` wires the new tool and the `worksheetContent` parameter.

**Tech Stack:** TypeScript/ESM, Node.js 18+, `@inquirer/prompts`, vitest

---

## File Map

```
src/
  utils/
    worksheet.ts              ← NEW: WizardDefaults, parseWorksheet()
  tools/
    get-setup-worksheet.ts    ← NEW: getSetupWorksheet()
  wizard.ts                   ← MODIFIED: formatWorksheetSummary(), runWizard(defaults?)
  index.ts                    ← MODIFIED: register get_setup_worksheet, worksheetContent param

tests/
  worksheet.test.ts           ← NEW: 15 tests
  get-setup-worksheet.test.ts ← NEW: 3 tests
  wizard.test.ts              ← EXTENDED: 5 new tests for formatWorksheetSummary

package.json                  ← MODIFIED: add docs/setup-worksheet.md to files array
```

---

## Context for all tasks

- Working directory: `D:/Dev/canvas-design-studio`
- Run tests with: `npx vitest run`
- TypeScript/ESM: all imports use `.js` extension (e.g. `import { x } from './utils/worksheet.js'`)
- Existing patterns to follow:
  - Pure utility functions → `src/utils/`
  - Tool files → `src/tools/`
  - Tests import from `../src/...js` paths
  - `vi.mock(...)` is hoisted; import after mock declaration
  - See `tests/get-started.test.ts` for the mock + import pattern
  - See `tests/wizard.test.ts` for the `describe`/`it`/`expect` pattern
- Never mock the filesystem in tests — if a function reads a file, test it against the real file

---

## Task 1: `src/utils/worksheet.ts` — WizardDefaults + parseWorksheet()

**Files:**
- Create: `src/utils/worksheet.ts`
- Create: `tests/worksheet.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/worksheet.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { parseWorksheet } from '../src/utils/worksheet.js';
import type { WizardDefaults } from '../src/utils/worksheet.js';

const FILLED_WORKSHEET = `
## Brand Standards (Fill this first — it can save you the color lookup)

Your answer: https://www.boisestate.edu/brand/
Example:     https://www.boisestate.edu/brand/

## Institution Name

Your answer: Boise State University
Example:     Boise State University

## Primary Brand Color

Your answer (6-digit hex): #0033A0
Example:                   #0033A0

## Secondary / Accent Color

Your answer (6-digit hex): #D64309
Example:                   #D64309

## Canvas Base URL

Your answer: https://boisestate.instructure.com
Example:     https://boisestate.instructure.com

## Canvas API Token (Optional)

Your answer: mysecrettoken12345678901234567890
(leave blank to skip)

## Professor Email (Optional)

Your answer: kevin@boisestate.edu
Example:     you@university.edu

## Favorite Canvas Course IDs (Optional)

Your answer (comma-separated): 12345, 67890
Example:                       12345, 67890

## Panopto Domain (Optional)

Your answer: bsu.hosted.panopto.com
Example:     bsu.hosted.panopto.com

## Panopto API Client ID and Secret (Optional)

Client ID:     myclientid123
Client Secret: myclientsecret456

## Teaching Philosophy (Optional — answered interactively in the wizard)

1. What's one thing you always tell students...
Your answer: Learn by doing

2. What does a student who truly gets it...
Your answer: They ask questions

3. What's the biggest mistake...
Your answer: ___________________________________

4. What separates an A from a B...
Your answer: Attention to detail

5. Are there teaching frameworks...
Your answer: ___________________________________

6. Any quotes or sayings...
Your answer: ___________________________________
`;

describe('parseWorksheet', () => {
  it('extracts institution from a filled worksheet', () => {
    expect(parseWorksheet(FILLED_WORKSHEET).institution).toBe('Boise State University');
  });

  it('extracts brandUrl from the brand standards section', () => {
    expect(parseWorksheet(FILLED_WORKSHEET).brandUrl).toBe('https://www.boisestate.edu/brand/');
  });

  it('extracts primaryColor', () => {
    expect(parseWorksheet(FILLED_WORKSHEET).primaryColor).toBe('#0033A0');
  });

  it('extracts secondaryColor', () => {
    expect(parseWorksheet(FILLED_WORKSHEET).secondaryColor).toBe('#D64309');
  });

  it('extracts canvasUrl', () => {
    expect(parseWorksheet(FILLED_WORKSHEET).canvasUrl).toBe('https://boisestate.instructure.com');
  });

  it('extracts apiToken', () => {
    expect(parseWorksheet(FILLED_WORKSHEET).apiToken).toBe('mysecrettoken12345678901234567890');
  });

  it('extracts professorEmail', () => {
    expect(parseWorksheet(FILLED_WORKSHEET).professorEmail).toBe('kevin@boisestate.edu');
  });

  it('extracts favoriteCourses as raw comma string', () => {
    expect(parseWorksheet(FILLED_WORKSHEET).favoriteCourses).toBe('12345, 67890');
  });

  it('extracts panoptoDomain', () => {
    expect(parseWorksheet(FILLED_WORKSHEET).panoptoDomain).toBe('bsu.hosted.panopto.com');
  });

  it('extracts panoptoClientId and panoptoClientSecret', () => {
    const result = parseWorksheet(FILLED_WORKSHEET);
    expect(result.panoptoClientId).toBe('myclientid123');
    expect(result.panoptoClientSecret).toBe('myclientsecret456');
  });

  it('extracts filled philosophy answers at correct indices', () => {
    const result = parseWorksheet(FILLED_WORKSHEET);
    expect(result.philosophyAnswers?.[0]).toBe('Learn by doing');
    expect(result.philosophyAnswers?.[1]).toBe('They ask questions');
    expect(result.philosophyAnswers?.[3]).toBe('Attention to detail');
  });

  it('leaves blank philosophy answers as empty string', () => {
    const result = parseWorksheet(FILLED_WORKSHEET);
    expect(result.philosophyAnswers?.[2]).toBe('');
    expect(result.philosophyAnswers?.[4]).toBe('');
  });

  it('excludes blank ___ values from result', () => {
    const ws = '## Institution Name\n\nYour answer: ___________________________________\nExample: Boise State\n';
    expect(parseWorksheet(ws).institution).toBeUndefined();
  });

  it('trims whitespace from extracted values', () => {
    const ws = '## Institution Name\n\nYour answer:   Boise State University   \n';
    expect(parseWorksheet(ws).institution).toBe('Boise State University');
  });

  it('returns empty object for empty input', () => {
    expect(parseWorksheet('')).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run tests/worksheet.test.ts
```

Expected: all 15 tests fail with "Cannot find module '../src/utils/worksheet.js'"

- [ ] **Step 3: Create `src/utils/worksheet.ts`**

```typescript
export interface WizardDefaults {
  institution?: string;
  brandUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  canvasUrl?: string;
  apiToken?: string;
  professorEmail?: string;
  favoriteCourses?: string;
  panoptoDomain?: string;
  panoptoClientId?: string;
  panoptoClientSecret?: string;
  philosophyAnswers?: string[];
}

function isBlank(v: string): boolean {
  return !v.trim() || /^_+$/.test(v.trim());
}

function extractYourAnswer(sectionText: string): string | undefined {
  const match = sectionText.match(/Your answer[^:]*:\s*(.+)/);
  if (!match) return undefined;
  const value = match[1].trim();
  return isBlank(value) ? undefined : value;
}

function extractLabeledField(sectionText: string, label: string): string | undefined {
  const regex = new RegExp(`${label}:\\s*(.+)`);
  const match = sectionText.match(regex);
  if (!match) return undefined;
  const value = match[1].trim();
  return isBlank(value) ? undefined : value;
}

function extractPhilosophyAnswers(sectionText: string): string[] | undefined {
  const matches = [...sectionText.matchAll(/Your answer[^:]*:\s*(.+)/g)];
  if (matches.length === 0) return undefined;
  let hasAny = false;
  const answers = matches.map(m => {
    const value = m[1].trim();
    const answer = isBlank(value) ? '' : value;
    if (answer) hasAny = true;
    return answer;
  });
  return hasAny ? answers : undefined;
}

export function parseWorksheet(content: string): WizardDefaults {
  const defaults: WizardDefaults = {};
  const sections = content.split(/^## /m);

  for (const section of sections) {
    const heading = section.split('\n')[0].trim();

    if (heading.startsWith('Brand Standards')) {
      const v = extractYourAnswer(section);
      if (v) defaults.brandUrl = v;
    } else if (heading === 'Institution Name') {
      const v = extractYourAnswer(section);
      if (v) defaults.institution = v;
    } else if (heading === 'Primary Brand Color') {
      const v = extractYourAnswer(section);
      if (v) defaults.primaryColor = v;
    } else if (heading.startsWith('Secondary')) {
      const v = extractYourAnswer(section);
      if (v) defaults.secondaryColor = v;
    } else if (heading === 'Canvas Base URL') {
      const v = extractYourAnswer(section);
      if (v) defaults.canvasUrl = v;
    } else if (heading.startsWith('Canvas API Token')) {
      const v = extractYourAnswer(section);
      if (v) defaults.apiToken = v;
    } else if (heading.startsWith('Professor Email')) {
      const v = extractYourAnswer(section);
      if (v) defaults.professorEmail = v;
    } else if (heading.startsWith('Favorite Canvas Course')) {
      const v = extractYourAnswer(section);
      if (v) defaults.favoriteCourses = v;
    } else if (heading.startsWith('Panopto Domain')) {
      const v = extractYourAnswer(section);
      if (v) defaults.panoptoDomain = v;
    } else if (heading.startsWith('Panopto API Client')) {
      const clientId = extractLabeledField(section, 'Client ID');
      const clientSecret = extractLabeledField(section, 'Client Secret');
      if (clientId) defaults.panoptoClientId = clientId;
      if (clientSecret) defaults.panoptoClientSecret = clientSecret;
    } else if (heading.startsWith('Teaching Philosophy')) {
      const answers = extractPhilosophyAnswers(section);
      if (answers) defaults.philosophyAnswers = answers;
    }
  }

  return defaults;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run tests/worksheet.test.ts
```

Expected: 15 tests pass, 0 failures

- [ ] **Step 5: Commit**

```bash
git add src/utils/worksheet.ts tests/worksheet.test.ts
git commit -m "feat(sp13): add parseWorksheet utility and WizardDefaults type"
```

---

## Task 2: `src/tools/get-setup-worksheet.ts` + `package.json`

**Files:**
- Create: `src/tools/get-setup-worksheet.ts`
- Create: `tests/get-setup-worksheet.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add `docs/setup-worksheet.md` to `package.json` files array**

Open `package.json`. The `files` array currently is:

```json
"files": [
  "CLAUDE.md",
  "DESIGN.md",
  "dist/",
  "docs/canvas-design-kb/",
  "docs/feature-roadmap.md",
  "docs/installation.md",
  "docs/npm-publishing.md",
  "PROFESSOR-INSTRUCTIONS.txt",
  "scripts/deploy-public.ps1",
  "src/kb/",
  "src/templates/"
],
```

Add `"docs/setup-worksheet.md"` after `"docs/npm-publishing.md"`:

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
  "scripts/deploy-public.ps1",
  "src/kb/",
  "src/templates/"
],
```

- [ ] **Step 2: Write the failing tests**

Create `tests/get-setup-worksheet.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { getSetupWorksheet } from '../src/tools/get-setup-worksheet.js';

describe('getSetupWorksheet', () => {
  it('returns content containing the Institution Name section', () => {
    expect(getSetupWorksheet()).toContain('## Institution Name');
  });

  it('returns content containing the Teaching Philosophy section', () => {
    expect(getSetupWorksheet()).toContain('## Teaching Philosophy');
  });

  it('returns content containing the AI-host instruction prefix', () => {
    expect(getSetupWorksheet()).toContain('For AI hosts:');
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```
npx vitest run tests/get-setup-worksheet.test.ts
```

Expected: all 3 tests fail with "Cannot find module"

- [ ] **Step 4: Create `src/tools/get-setup-worksheet.ts`**

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
  '> Ask the professor to fill it out, then call `setup_institution` with `worksheetContent` set to the file\'s contents.',
  '',
].join('\n');

export function getSetupWorksheet(): string {
  const template = readFileSync(WORKSHEET_PATH, 'utf8');
  return AI_HOST_PREFIX + template;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```
npx vitest run tests/get-setup-worksheet.test.ts
```

Expected: 3 tests pass, 0 failures

- [ ] **Step 6: Commit**

```bash
git add src/tools/get-setup-worksheet.ts tests/get-setup-worksheet.test.ts package.json
git commit -m "feat(sp13): add get_setup_worksheet tool and include worksheet in npm package"
```

---

## Task 3: `src/wizard.ts` — formatWorksheetSummary + runWizard(defaults?)

**Files:**
- Modify: `src/wizard.ts`
- Modify: `tests/wizard.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/wizard.test.ts`. Add a new import and a new describe block **after** the existing `formatSetupSummary` describe block:

```typescript
import { describe, expect, it } from 'vitest';
import { formatSetupSummary, formatWorksheetSummary } from '../src/wizard.js';
import type { InstitutionConfig } from '../src/types.js';
import type { WizardDefaults } from '../src/utils/worksheet.js';
```

Then add at the end of the file:

```typescript
describe('formatWorksheetSummary', () => {
  it('includes the "Values from your setup worksheet" header', () => {
    const result = formatWorksheetSummary({ institution: 'Boise State University' });
    expect(result).toContain('Values from your setup worksheet');
  });

  it('shows API token as ✓ (provided), not the raw value', () => {
    const result = formatWorksheetSummary({ apiToken: 'supersecrettoken' });
    expect(result).toContain('✓ (provided)');
    expect(result).not.toContain('supersecrettoken');
  });

  it('omits fields that are not present in defaults', () => {
    const result = formatWorksheetSummary({ institution: 'BSU' });
    expect(result).not.toContain('Brand URL');
    expect(result).not.toContain('Canvas URL');
    expect(result).not.toContain('Panopto');
  });

  it('shows all provided fields', () => {
    const result = formatWorksheetSummary({
      institution: 'Boise State University',
      primaryColor: '#0033A0',
      canvasUrl: 'https://boisestate.instructure.com',
    });
    expect(result).toContain('Boise State University');
    expect(result).toContain('#0033A0');
    expect(result).toContain('boisestate.instructure.com');
  });

  it('includes the "Press Enter to accept" instruction', () => {
    const result = formatWorksheetSummary({ institution: 'BSU' });
    expect(result).toContain('Press Enter to accept each value');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run tests/wizard.test.ts
```

Expected: 5 new tests fail with "formatWorksheetSummary is not a function" (or similar); existing 10 tests still pass

- [ ] **Step 3: Add the import and `formatWorksheetSummary` to `src/wizard.ts`**

At the top of `src/wizard.ts`, add the import for `WizardDefaults`:

```typescript
import type { WizardDefaults } from './utils/worksheet.js';
```

Then add `formatWorksheetSummary` as a new exported function **before** the existing `formatSetupSummary` function:

```typescript
export function formatWorksheetSummary(defaults: WizardDefaults): string {
  const lines: string[] = [
    '┌─────────────────────────────────────────────────────────┐',
    '│  Values from your setup worksheet:                       │',
    '└─────────────────────────────────────────────────────────┘',
    '',
  ];
  if (defaults.institution) lines.push(`  Institution:    ${defaults.institution}`);
  if (defaults.brandUrl) lines.push(`  Brand URL:      ${defaults.brandUrl}`);
  if (defaults.primaryColor) lines.push(`  Primary color:  ${defaults.primaryColor}`);
  if (defaults.secondaryColor) lines.push(`  Secondary:      ${defaults.secondaryColor}`);
  if (defaults.canvasUrl) lines.push(`  Canvas URL:     ${defaults.canvasUrl}`);
  if (defaults.apiToken) lines.push(`  API token:      ✓ (provided)`);
  if (defaults.professorEmail) lines.push(`  Email:          ${defaults.professorEmail}`);
  if (defaults.favoriteCourses) lines.push(`  Courses:        ${defaults.favoriteCourses}`);
  if (defaults.panoptoDomain) lines.push(`  Panopto:        ${defaults.panoptoDomain}`);
  lines.push('');
  lines.push('  Press Enter to accept each value, or type to override.');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to confirm the 5 new tests pass**

```
npx vitest run tests/wizard.test.ts
```

Expected: all 15 tests pass (10 existing + 5 new)

- [ ] **Step 5: Update `runWizard` signature and add summary display**

Change the `runWizard` function signature from:

```typescript
export async function runWizard(): Promise<InstitutionConfig> {
```

to:

```typescript
export async function runWizard(defaults?: WizardDefaults): Promise<InstitutionConfig> {
```

Immediately after the existing header console.log block (after the `console.log('All fields except Canvas URL...\n')` line), add:

```typescript
  if (defaults && Object.values(defaults).some(v => v !== undefined)) {
    console.log('\n' + formatWorksheetSummary(defaults) + '\n');
  }
```

- [ ] **Step 6: Inject defaults into each prompt**

Replace the `institution` prompt:

```typescript
  const institution = await input({
    message: 'Institution name (your college or university, e.g. Boise State University):',
    default: defaults?.institution ?? 'Boise State University',
  });
```

Replace the `brandUrl` prompt:

```typescript
  const brandUrl = await input({
    message: 'Brand standards URL (optional — e.g. https://www.boisestate.edu/brand/ — your AI can fetch this to suggest your colors):',
    default: defaults?.brandUrl ?? '',
    validate: (v: string) => !v || v.startsWith('https://') || 'Brand URL must start with https://',
  });
```

Replace the `primaryHex` prompt (inside the while loop — change only the `input()` call, leave the WCAG check intact):

```typescript
    primaryHex = await input({
      message: 'Primary brand color (#hex):',
      default: defaults?.primaryColor ?? '#0033A0',
      validate: (v) => /^#[0-9A-Fa-f]{6}$/.test(v) || 'Enter a valid hex color (e.g. #0033A0)',
    });
```

Replace the `secondaryHex` prompt (same pattern):

```typescript
    secondaryHex = await input({
      message: 'Secondary / accent color (#hex):',
      default: defaults?.secondaryColor ?? '#D64309',
      validate: (v) => /^#[0-9A-Fa-f]{6}$/.test(v) || 'Enter a valid hex color (e.g. #D64309)',
    });
```

Replace the `canvasUrl` prompt:

```typescript
  const canvasUrl = await input({
    message: 'Canvas base URL (log into Canvas, copy the domain, e.g. https://boisestate.instructure.com — no trailing slash):',
    default: defaults?.canvasUrl ?? 'https://boisestate.instructure.com',
    validate: (v: string) => {
      if (!v.startsWith('https://')) return 'URL must start with https://';
      if (v.endsWith('/')) return 'Remove the trailing slash (e.g. https://boisestate.instructure.com)';
      return true;
    },
  });
```

- [ ] **Step 7: Handle the API token (password field special case)**

`password()` does not support a `default:` option. Replace the API token block with:

```typescript
  if (defaults?.apiToken) {
    console.log('  ✓ API token from worksheet — leave blank to use it, or type a new token to override.');
  }
  const apiTokenInput = await password({
    message: 'Canvas API token — Canvas → Account → Settings → Approved Integrations → New Access Token (leave blank to generate HTML and paste manually):',
    mask: '*',
    validate: (v: string) => !v || v.length > 20 || 'Token looks too short — Canvas tokens are 70+ characters. Leave blank or paste the full token.',
  });
  const apiToken = apiTokenInput || defaults?.apiToken || '';
```

Note: the variable is now `apiToken` (was the same before but was set directly from `password()`). Update the config object line to use `apiToken` (it already does).

- [ ] **Step 8: Inject defaults into remaining prompts**

Replace the `professorEmail` prompt:

```typescript
  const professorEmail = await input({
    message: 'Professor email for FERPA scan allowlist (optional — prevents your own address being flagged as PII, e.g. you@university.edu):',
    default: defaults?.professorEmail ?? '',
    validate: (v: string) => !v || (v.includes('@') && v.includes('.')) || 'Enter a valid email address or leave blank',
  });
```

Replace the `favoriteCoursesRaw` prompt:

```typescript
  const favoriteCoursesRaw = await input({
    message: 'Favorite Canvas course IDs, comma-separated (optional — find IDs in the Canvas course URL, e.g. 12345, 67890):',
    default: defaults?.favoriteCourses ?? '',
    validate: (v) => {
      if (!v.trim()) return true;
      return v.split(',').every(id => /^\d+$/.test(id.trim())) || 'Use only numeric Canvas course IDs separated by commas.';
    },
  });
```

Replace the `panoptoDomain` prompt:

```typescript
  const panoptoDomain = await input({
    message: 'Panopto domain (e.g. bsu.hosted.panopto.com, or leave blank to skip):',
    default: defaults?.panoptoDomain ?? '',
  });
```

Replace the `panoptoClientId` prompt:

```typescript
    const panoptoClientId = await input({
      message: 'Panopto API client ID (leave blank to skip — enables video search and caption download):',
      default: defaults?.panoptoClientId ?? '',
    });
```

For the Panopto client secret (`password()` — same special case as API token):

```typescript
    let panoptoClientSecret = '';
    if (panoptoClientId.trim()) {
      if (defaults?.panoptoClientSecret) {
        console.log('  ✓ Panopto client secret from worksheet — leave blank to use it, or type to override.');
      }
      const secretInput = await password({
        message: 'Panopto API client secret:',
        mask: '*',
      });
      panoptoClientSecret = secretInput || defaults?.panoptoClientSecret || '';
    }
```

- [ ] **Step 9: Pre-fill philosophy questions**

Find the philosophy questions loop inside the `if (buildKb)` block. Replace the `for...of` loop:

```typescript
      // BEFORE:
      for (const q of philosophyQuestions) {
        const answer = await input({ message: q });
        if (answer.trim()) answers.push(answer.trim());
      }

      // AFTER:
      for (let i = 0; i < philosophyQuestions.length; i++) {
        const answer = await input({
          message: philosophyQuestions[i],
          default: defaults?.philosophyAnswers?.[i] ?? '',
        });
        if (answer.trim()) answers.push(answer.trim());
      }
```

- [ ] **Step 10: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass (328 baseline + 20 new = 348 total). Zero failures.

If `runWizard` tests fail due to side effects from importing a module that calls `@inquirer/prompts` at import time, check that the import is lazy (it should be — `runWizard` is only called when invoked, not at import).

- [ ] **Step 11: Commit**

```bash
git add src/wizard.ts tests/wizard.test.ts
git commit -m "feat(sp13): add formatWorksheetSummary and pre-fill runWizard from defaults"
```

---

## Task 4: `src/index.ts` — register get_setup_worksheet and wire worksheetContent

**Files:**
- Modify: `src/index.ts`

No new tests — the logic is already covered by Tasks 1–3. This task is pure wiring.

- [ ] **Step 1: Add imports**

At the top of `src/index.ts`, add these two imports alongside the existing tool imports:

```typescript
import { getSetupWorksheet } from './tools/get-setup-worksheet.js';
import { parseWorksheet } from './utils/worksheet.js';
```

- [ ] **Step 2: Register `get_setup_worksheet` in the ListTools handler**

In the `ListToolsRequestSchema` handler, add `get_setup_worksheet` as the second tool in the list (after `get_started`):

```typescript
      {
        name: 'get_setup_worksheet',
        description: 'Get the blank setup worksheet template. Save it as setup-worksheet.md, ask the professor to fill it out, then pass the contents to setup_institution via worksheetContent. Faster than answering the wizard interactively.',
        inputSchema: { type: 'object', properties: {} },
      },
```

- [ ] **Step 3: Add `worksheetContent` parameter to `setup_institution` schema**

Find the `setup_institution` tool definition and update its `inputSchema`:

```typescript
      {
        name: 'setup_institution',
        description: 'Re-run the setup wizard to update institution config (brand colors, Canvas URL, API token). Pass worksheetContent from a filled setup-worksheet.md to pre-fill all answers.',
        inputSchema: {
          type: 'object',
          properties: {
            worksheetContent: {
              type: 'string',
              description: 'Full contents of a completed setup-worksheet.md. Pre-fills wizard prompts — professor confirms or overrides each value interactively.',
            },
          },
        },
      },
```

- [ ] **Step 4: Update the `setup_institution` handler**

Find:

```typescript
      if (name === 'setup_institution') {
        const config = await runWizard();
        return {
          content: [{ type: 'text', text: formatSetupSummary(config) }],
        };
      }
```

Replace with:

```typescript
      if (name === 'setup_institution') {
        const { worksheetContent } = (args ?? {}) as { worksheetContent?: string };
        const defaults = worksheetContent ? parseWorksheet(worksheetContent) : undefined;
        const config = await runWizard(defaults);
        return {
          content: [{ type: 'text', text: formatSetupSummary(config) }],
        };
      }
```

- [ ] **Step 5: Add the `get_setup_worksheet` handler**

Find the `get_started` handler block:

```typescript
      if (name === 'get_started') {
        return { content: [{ type: 'text', text: getStarted() }] };
      }
```

Add the new handler immediately after it:

```typescript
      if (name === 'get_setup_worksheet') {
        return { content: [{ type: 'text', text: getSetupWorksheet() }] };
      }
```

- [ ] **Step 6: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass. Zero failures.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts
git commit -m "feat(sp13): register get_setup_worksheet and wire worksheetContent to setup_institution"
```

---

## Task 5: `src/tools/get-started.ts` — add worksheet tip to no-config and partial-config states

**Files:**
- Modify: `src/tools/get-started.ts`
- Modify: `tests/get-started.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/get-started.test.ts` and add two new tests inside the existing `describe('getStarted', ...)` block:

```typescript
  it('no-config text mentions get_setup_worksheet', () => {
    vi.mocked(configExists).mockReturnValue(false);
    expect(getStarted()).toContain('get_setup_worksheet');
  });

  it('partial-config text mentions get_setup_worksheet', () => {
    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig, apiToken: '' });
    expect(getStarted()).toContain('get_setup_worksheet');
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run tests/get-started.test.ts
```

Expected: 2 new tests fail; existing 9 tests pass

- [ ] **Step 3: Update `noConfigText()` in `src/tools/get-started.ts`**

Open `src/tools/get-started.ts`. Find the `noConfigText()` function. Add this line at the end of the returned string, just before the `CONTEXT7_HINT`:

```typescript
'> **Tip:** Fill out `setup-worksheet.md` before running the wizard — call `get_setup_worksheet` to get the blank template.',
```

The exact insertion point will be wherever the function assembles its return lines array. Add it as the last content line before `CONTEXT7_HINT`.

- [ ] **Step 4: Update `partialConfigText()` in `src/tools/get-started.ts`**

Find the `partialConfigText()` function. Add the same tip line before `CONTEXT7_HINT`:

```typescript
'> **Tip:** Fill out `setup-worksheet.md` before running the wizard — call `get_setup_worksheet` to get the blank template.',
```

- [ ] **Step 5: Run tests to confirm they pass**

```
npx vitest run tests/get-started.test.ts
```

Expected: all 11 tests pass (9 existing + 2 new)

- [ ] **Step 6: Run the full test suite**

```
npx vitest run
```

Expected: all tests pass. Zero failures.

- [ ] **Step 7: Commit**

```bash
git add src/tools/get-started.ts tests/get-started.test.ts
git commit -m "feat(sp13): add worksheet tip to get_started no-config and partial-config states"
```

---

## Self-Review Checklist

Before calling this plan complete, verify:

- [ ] `WizardDefaults` defined in Task 1 — used consistently in Tasks 3 and 4 (same field names, same import path `./utils/worksheet.js`)
- [ ] `parseWorksheet` exported from `src/utils/worksheet.ts` — imported in `src/index.ts` as `./utils/worksheet.js`
- [ ] `formatWorksheetSummary` exported from `src/wizard.ts` — tested directly in `tests/wizard.test.ts`
- [ ] `runWizard(defaults?)` signature change is backward compatible — all existing callers (index.ts) work with no arguments
- [ ] `apiToken = apiTokenInput || defaults?.apiToken || ''` fallback logic correct — empty string means "use worksheet value or empty"
- [ ] `docs/setup-worksheet.md` added to `package.json` files array so `getSetupWorksheet()` can read it at runtime in npm-installed environments
- [ ] Philosophy loop changed from `for...of` to `for...let i` — only change in that block
- [ ] `get_started` no-config and partial-config states both mention `get_setup_worksheet` — full-config state does not (professor is already set up)
