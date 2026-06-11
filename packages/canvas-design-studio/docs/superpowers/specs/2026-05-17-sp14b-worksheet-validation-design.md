# SP14b — Worksheet Validation Design Spec

**Goal:** Add `validateWorksheet()` to catch malformed field values in a filled setup worksheet before they reach the wizard — preventing `Color()` crashes on bad hex and Canvas API failures on bad URLs. Exposed both as an internal guard in `setup_institution` and as a standalone `validate_worksheet` MCP tool.

---

## What This Is Not

- Not a required-fields check — absent fields are fine; the wizard prompts for them interactively
- Not a cross-field validator (no "primary ≠ secondary" check)
- Not a schema validator for the worksheet markdown format — `parseWorksheet()` already handles that
- No changes to `parseWorksheet()`, `WizardDefaults`, or the wizard itself

---

## File Map

| File | Change |
|------|--------|
| `src/utils/worksheet.ts` | Add exported `validateWorksheet(defaults: WizardDefaults): string[]` |
| `src/tools/validate-worksheet.ts` | **New** — MCP tool formatter: `validateWorksheetTool(worksheetContent: string): string` |
| `src/index.ts` | Add `validate_worksheet` tool definition + handler; add validation gate in `setup_institution` handler |
| `tests/worksheet.test.ts` | Add `validateWorksheet` describe block (~8 tests) |
| `tests/validate-worksheet.test.ts` | **New** — ~4 tests for the tool formatter |

---

## `validateWorksheet(defaults: WizardDefaults): string[]`

Added to `src/utils/worksheet.ts`. Pure function — no I/O, no side effects.

**Rules:** Check only fields that would cause the wizard to crash or Canvas API calls to fail. All checks are "if present AND malformed" — `undefined` fields pass silently.

| Field | Rule | Error message |
|-------|------|---------------|
| `primaryColor` | `/^#[0-9A-Fa-f]{6}$/` | `Primary color "{value}" is not a valid 6-digit hex. Example: #0033A0` |
| `secondaryColor` | `/^#[0-9A-Fa-f]{6}$/` | `Secondary color "{value}" is not a valid 6-digit hex. Example: #D64309` |
| `canvasUrl` | Starts with `https://` | `Canvas URL "{value}" must start with https://. Example: https://example.instructure.com` |

Returns all errors found in a single call — professor sees everything at once, not one error at a time.

Returns `[]` (empty array) when valid.

---

## `src/tools/validate-worksheet.ts` (new)

```typescript
export function validateWorksheetTool(worksheetContent: string): string
```

Calls `parseWorksheet(worksheetContent)` then `validateWorksheet(defaults)`.

**When errors found:** Returns a markdown block listing each error:
```
❌ Worksheet has 2 error(s). Fix these before running setup_institution:

  1. Primary color "#GGGGGG" is not a valid 6-digit hex. Example: #0033A0
  2. Canvas URL "example.instructure.com" must start with https://. Example: https://example.instructure.com

Fix these values in your worksheet and re-run validate_worksheet or setup_institution.
```

**When valid:** Returns:
```
✓ Worksheet valid — 6 field(s) parsed. Run setup_institution to apply.
```
where N is the count of non-`undefined` values across all keys of the parsed `WizardDefaults` object (including `philosophyAnswers` if any answers were filled in — counts as 1).

---

## Integration in `src/index.ts`

### `setup_institution` handler

After `parseWorksheet(worksheetContent)`, before `runWizard(defaults)`, insert:

```typescript
const worksheetErrors = validateWorksheet(defaults);
if (worksheetErrors.length > 0) {
  return {
    content: [{ type: 'text', text: formatWorksheetErrors(worksheetErrors) }],
    isError: true,
  };
}
```

`formatWorksheetErrors(errors: string[]): string` is exported from `src/tools/validate-worksheet.ts` and imported into `src/index.ts`. This guard only runs when `worksheetContent` was provided — it does not affect the interactive wizard path.

### `validate_worksheet` tool definition

```typescript
{
  name: 'validate_worksheet',
  description: 'Check a filled setup-worksheet.md for format errors before running setup_institution. Returns a list of problems (bad hex colors, malformed URLs) or confirms the worksheet is ready.',
  inputSchema: {
    type: 'object',
    required: ['worksheetContent'],
    properties: {
      worksheetContent: {
        type: 'string',
        description: 'Full contents of a filled setup-worksheet.md.',
      },
    },
  },
}
```

Handler:
```typescript
if (name === 'validate_worksheet') {
  const { worksheetContent } = args as { worksheetContent: string };
  return { content: [{ type: 'text', text: validateWorksheetTool(worksheetContent) }] };
}
```

---

## Tests

### `tests/worksheet.test.ts` — new `validateWorksheet` describe block (~8 tests)

All tests call `validateWorksheet()` directly with a `WizardDefaults` object.

- Valid hex `#0033A0` → no error
- `undefined` primaryColor → no error (silently skipped)
- Bad primaryColor — missing `#` prefix (`"0033A0"`) → error containing `"0033A0"` and `"Example: #0033A0"`
- Bad primaryColor — wrong length (`"#0033A"`) → error
- Bad primaryColor — invalid characters (`"#GGGGGG"`) → error
- Bad canvasUrl — missing `https://` (`"example.instructure.com"`) → error containing `"Example: https://"`
- Valid canvasUrl `https://example.instructure.com` → no error
- Both primaryColor and canvasUrl bad → returns two errors

### `tests/validate-worksheet.test.ts` — new file (~4 tests)

All tests call `validateWorksheetTool()` with raw worksheet strings.

- Worksheet with valid values → result contains `✓ Worksheet valid`
- Worksheet with bad hex → result contains `❌` and the error message
- Empty worksheet → result contains `✓ Worksheet valid — 0 field(s) parsed`
- Worksheet with two errors → result contains both error messages and `2 error(s)`
