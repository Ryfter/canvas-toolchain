# SP14b — Worksheet Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `validateWorksheet()` to catch malformed hex colors and Canvas URLs in a filled setup worksheet before the wizard runs, exposed both as a validation gate in `setup_institution` and as a standalone `validate_worksheet` MCP tool.

**Architecture:** A pure utility function (`validateWorksheet`) lives in `src/utils/worksheet.ts` alongside `parseWorksheet`. A thin tool formatter (`validate-worksheet.ts`) wraps it for MCP output, exporting `formatWorksheetErrors` so `src/index.ts` can share the same formatting in the `setup_institution` guard. Three files change; two are new.

**Tech Stack:** TypeScript/ESM, Vitest, `@modelcontextprotocol/sdk`

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `src/utils/worksheet.ts` | Modify | Add `validateWorksheet(defaults: WizardDefaults): string[]` |
| `src/tools/validate-worksheet.ts` | **Create** | `formatWorksheetErrors` + `validateWorksheetTool` |
| `src/index.ts` | Modify | Import, tool definition, handler, `setup_institution` guard |
| `tests/worksheet.test.ts` | Modify | Add `validateWorksheet` describe block (~9 tests) |
| `tests/validate-worksheet.test.ts` | **Create** | Tests for `validateWorksheetTool` (~4 tests) |

---

## Task 1: `validateWorksheet` utility

**Files:**
- Modify: `src/utils/worksheet.ts` (append after line 95)
- Modify: `tests/worksheet.test.ts` (append new describe block)

- [ ] **Step 1: Add the `validateWorksheet` import to the test file**

Open `tests/worksheet.test.ts`. The first line reads:
```typescript
import { parseWorksheet } from '../src/utils/worksheet.js';
```
Change it to:
```typescript
import { parseWorksheet, validateWorksheet } from '../src/utils/worksheet.js';
```

- [ ] **Step 2: Write the failing tests**

Append this entire `describe` block to the end of `tests/worksheet.test.ts` (after line 146, after the closing `});` of the existing `parseWorksheet` describe):

```typescript
describe('validateWorksheet', () => {
  it('returns empty array when all fields are undefined', () => {
    expect(validateWorksheet({})).toEqual([]);
  });

  it('returns empty array for valid hex colors and url', () => {
    expect(
      validateWorksheet({
        primaryColor: '#0033A0',
        secondaryColor: '#D64309',
        canvasUrl: 'https://boisestate.instructure.com',
      })
    ).toEqual([]);
  });

  it('returns no error when primaryColor is undefined', () => {
    expect(validateWorksheet({ secondaryColor: '#D64309' })).toEqual([]);
  });

  it('returns error for primaryColor missing # prefix', () => {
    const errors = validateWorksheet({ primaryColor: '0033A0' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('0033A0');
    expect(errors[0]).toContain('Example: #0033A0');
  });

  it('returns error for primaryColor with wrong length', () => {
    const errors = validateWorksheet({ primaryColor: '#0033A' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('#0033A');
  });

  it('returns error for primaryColor with invalid characters', () => {
    const errors = validateWorksheet({ primaryColor: '#GGGGGG' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('#GGGGGG');
  });

  it('returns error for canvasUrl missing https://', () => {
    const errors = validateWorksheet({ canvasUrl: 'boisestate.instructure.com' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('boisestate.instructure.com');
    expect(errors[0]).toContain('Example: https://');
  });

  it('returns no error for valid canvasUrl', () => {
    expect(validateWorksheet({ canvasUrl: 'https://boisestate.instructure.com' })).toEqual([]);
  });

  it('returns two errors when both primaryColor and canvasUrl are invalid', () => {
    const errors = validateWorksheet({
      primaryColor: '#GGGGGG',
      canvasUrl: 'boisestate.instructure.com',
    });
    expect(errors).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```
npx vitest run tests/worksheet.test.ts
```

Expected: The 9 new `validateWorksheet` tests FAIL with "validateWorksheet is not a function" (or similar). The existing `parseWorksheet` tests continue to pass.

- [ ] **Step 4: Implement `validateWorksheet`**

Append this function to `src/utils/worksheet.ts` (after the closing `}` of `parseWorksheet`, after line 95):

```typescript
export function validateWorksheet(defaults: WizardDefaults): string[] {
  const errors: string[] = [];
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;

  if (defaults.primaryColor !== undefined && !hexRegex.test(defaults.primaryColor)) {
    errors.push(
      `Primary color "${defaults.primaryColor}" is not a valid 6-digit hex. Example: #0033A0`
    );
  }
  if (defaults.secondaryColor !== undefined && !hexRegex.test(defaults.secondaryColor)) {
    errors.push(
      `Secondary color "${defaults.secondaryColor}" is not a valid 6-digit hex. Example: #D64309`
    );
  }
  if (defaults.canvasUrl !== undefined && !defaults.canvasUrl.startsWith('https://')) {
    errors.push(
      `Canvas URL "${defaults.canvasUrl}" must start with https://. Example: https://boisestate.instructure.com`
    );
  }

  return errors;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```
npx vitest run tests/worksheet.test.ts
```

Expected: All tests PASS (existing 15 + new 9 = 24 total in this file).

- [ ] **Step 6: Commit**

```
git add src/utils/worksheet.ts tests/worksheet.test.ts
git commit -m "feat: add validateWorksheet utility for hex and URL format checks"
```

---

## Task 2: `validate-worksheet.ts` tool and tests

**Files:**
- Create: `src/tools/validate-worksheet.ts`
- Create: `tests/validate-worksheet.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/validate-worksheet.test.ts` with this content:

```typescript
import { describe, expect, it } from 'vitest';
import { validateWorksheetTool } from '../src/tools/validate-worksheet.js';

describe('validateWorksheetTool', () => {
  it('returns valid message for a worksheet with no errors', () => {
    const worksheet = [
      '## Primary Brand Color',
      '',
      'Your answer (6-digit hex): #0033A0',
      '',
      '## Canvas Base URL',
      '',
      'Your answer: https://boisestate.instructure.com',
    ].join('\n');
    expect(validateWorksheetTool(worksheet)).toContain('✓ Worksheet valid');
  });

  it('returns error message containing the bad value when hex is invalid', () => {
    const worksheet = [
      '## Primary Brand Color',
      '',
      'Your answer (6-digit hex): GGGGGG',
    ].join('\n');
    const result = validateWorksheetTool(worksheet);
    expect(result).toContain('❌');
    expect(result).toContain('GGGGGG');
  });

  it('returns valid with 0 field(s) parsed for empty worksheet', () => {
    expect(validateWorksheetTool('')).toContain('✓ Worksheet valid — 0 field(s) parsed');
  });

  it('returns 2 error(s) count and both bad values for a worksheet with two errors', () => {
    const worksheet = [
      '## Primary Brand Color',
      '',
      'Your answer (6-digit hex): GGGGGG',
      '',
      '## Canvas Base URL',
      '',
      'Your answer: boisestate.instructure.com',
    ].join('\n');
    const result = validateWorksheetTool(worksheet);
    expect(result).toContain('2 error(s)');
    expect(result).toContain('GGGGGG');
    expect(result).toContain('boisestate.instructure.com');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```
npx vitest run tests/validate-worksheet.test.ts
```

Expected: All 4 tests FAIL with "Cannot find module" (file doesn't exist yet).

- [ ] **Step 3: Create `src/tools/validate-worksheet.ts`**

```typescript
import { parseWorksheet, validateWorksheet } from '../utils/worksheet.js';
import type { WizardDefaults } from '../utils/worksheet.js';

export function formatWorksheetErrors(errors: string[]): string {
  return [
    `❌ Worksheet has ${errors.length} error(s). Fix these before running setup_institution:`,
    '',
    ...errors.map((e, i) => `  ${i + 1}. ${e}`),
    '',
    'Fix these values in your worksheet and re-run validate_worksheet or setup_institution.',
  ].join('\n');
}

export function validateWorksheetTool(worksheetContent: string): string {
  const defaults = parseWorksheet(worksheetContent);
  const errors = validateWorksheet(defaults);

  if (errors.length > 0) {
    return formatWorksheetErrors(errors);
  }

  const count = countParsedFields(defaults);
  return `✓ Worksheet valid — ${count} field(s) parsed. Run setup_institution to apply.`;
}

function countParsedFields(defaults: WizardDefaults): number {
  const { philosophyAnswers, ...rest } = defaults;
  let count = Object.values(rest).filter(v => v !== undefined).length;
  if (philosophyAnswers !== undefined) count += 1;
  return count;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```
npx vitest run tests/validate-worksheet.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

```
npx vitest run
```

Expected: All tests pass (should be ~387 total: 378 prior + 9 from Task 1 + 4 from Task 2 = 391; exact count depends on prior baseline).

- [ ] **Step 6: Commit**

```
git add src/tools/validate-worksheet.ts tests/validate-worksheet.test.ts
git commit -m "feat: add validateWorksheetTool and formatWorksheetErrors"
```

---

## Task 3: Wire into `src/index.ts`

**Files:**
- Modify: `src/index.ts`

This task has no new tests — coverage comes from integration behavior already tested indirectly. The changes are: (1) add imports, (2) add tool definition, (3) add `validate_worksheet` handler, (4) add validation gate inside the existing `setup_institution` handler.

- [ ] **Step 1: Add imports**

Find this line near the top of `src/index.ts` (around line 49):
```typescript
import { parseWorksheet } from './utils/worksheet.js';
```

Replace it with:
```typescript
import { parseWorksheet, validateWorksheet } from './utils/worksheet.js';
import { validateWorksheetTool, formatWorksheetErrors } from './tools/validate-worksheet.js';
```

- [ ] **Step 2: Add the `validate_worksheet` tool definition**

Find the `fetch_brand_colors` tool definition block (around lines 422–435):
```typescript
      {
        name: 'fetch_brand_colors',
        description: 'Fetch a brand standards URL ...',
        inputSchema: {
          type: 'object' as const,
          ...
          required: ['url'],
        },
      },
    ],
  }));
```

Insert a new tool definition **between** the closing `},` of `fetch_brand_colors` and `],` (i.e., between line 435 and 436):

```typescript
      {
        name: 'validate_worksheet',
        description: 'Check a filled setup-worksheet.md for format errors before running setup_institution. Returns a list of problems (bad hex colors, malformed URLs) or confirms the worksheet is ready.',
        inputSchema: {
          type: 'object' as const,
          required: ['worksheetContent'],
          properties: {
            worksheetContent: {
              type: 'string',
              description: 'Full contents of a filled setup-worksheet.md.',
            },
          },
        },
      },
```

- [ ] **Step 3: Add validation gate inside `setup_institution` handler**

Find the existing `setup_institution` handler (around lines 451–458):
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

Replace it with:
```typescript
      if (name === 'setup_institution') {
        const { worksheetContent } = (args ?? {}) as { worksheetContent?: string };
        const defaults = worksheetContent ? parseWorksheet(worksheetContent) : undefined;
        if (defaults) {
          const worksheetErrors = validateWorksheet(defaults);
          if (worksheetErrors.length > 0) {
            return {
              content: [{ type: 'text', text: formatWorksheetErrors(worksheetErrors) }],
              isError: true,
            };
          }
        }
        const config = await runWizard(defaults);
        return {
          content: [{ type: 'text', text: formatSetupSummary(config) }],
        };
      }
```

- [ ] **Step 4: Add the `validate_worksheet` handler**

Find the `fetch_brand_colors` handler (around lines 867–870):
```typescript
      if (name === 'fetch_brand_colors') {
        const { url } = args as { url: string };
        return { content: [{ type: 'text', text: await fetchBrandColors(url) }] };
      }

      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
```

Insert the new handler **between** the closing `}` of `fetch_brand_colors` and the `return { content: ... Unknown tool` fallback:

```typescript
      if (name === 'validate_worksheet') {
        const { worksheetContent } = args as { worksheetContent: string };
        return { content: [{ type: 'text', text: validateWorksheetTool(worksheetContent) }] };
      }
```

- [ ] **Step 5: Build to verify no TypeScript errors**

```
npx tsc --noEmit
```

Expected: No errors output.

- [ ] **Step 6: Run the full test suite**

```
npx vitest run
```

Expected: All tests pass. Check the count — should be 13 more than the pre-SP14b baseline (9 + 4).

- [ ] **Step 7: Commit**

```
git add src/index.ts
git commit -m "feat: wire validate_worksheet tool and setup_institution validation gate"
```

---

## After All Tasks: Update the roadmap

- [ ] **Update `docs/feature-roadmap.md`**

The "Coming Next" section currently reads:
```markdown
## Coming Next

### Worksheet Validation (SP14b)
...
```

Move it to "Now Available" under a new `## Now Available (v1.1.1)` heading (or similar version bump). Change the feature descriptions from future tense to past tense:

```markdown
## Now Available (v1.1.1)

### Worksheet Validation (SP14b)

| Feature | What professors can do |
|---|---|
| `validate_worksheet` tool | Pass filled worksheet contents; get a list of format errors (bad hex, missing `https://`) or confirmation it's ready |
| Validation gate in `setup_institution` | When a worksheet is provided, format errors are caught and returned before the wizard starts — no silent failures |
```

Delete the old "Coming Next" Worksheet Validation section.

- [ ] **Commit the roadmap update**

```
git add docs/feature-roadmap.md
git commit -m "docs: mark SP14b complete in feature roadmap"
```
