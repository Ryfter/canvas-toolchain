# Usage Feedback via GitHub — Implementation Plan (#77)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `submit_usage_feedback` MCP tool that turns the #76 institution profile into an anonymized GitHub issue so the author can see which tools professors use.

**Architecture:** One pure transform module (`src/feedback/submission.ts`) applies a default-deny anonymization policy and renders the issue body/title; one MCP tool (`src/tools/submit_usage_feedback.ts`) wraps it in a stateless two-call confirm gate and shells out to `gh issue create` through an injectable runner; a `.github/ISSUE_TEMPLATE/usage-feedback.md` template establishes the `usage-feedback` label.

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import suffixes), vitest, the `yaml` package (already a C&C dep), `node:child_process` `execFile`, `node:os`/`node:fs` for the temp body-file.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-09-usage-feedback-github-design.md`

**Reused from #76:** `loadProfile`, `getProfilePath`, and the `InstitutionProfile` / `ProfileTool` types from `src/discovery/profile.js`.

**Conventions to follow:**
- All paths below are relative to `packages/command-and-control/`.
- Run tests from that package dir: `npm test` (alias for `vitest run`). Single file: `npx vitest run tests/<path> -t '<name>'`.
- Result shape for the tool: `{ ok: true, … } | { ok: false, error, message, fix }` (mirrors `save_institution_profile`).
- Commit co-author trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Work on `main` (no worktree). Never use `--no-verify`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/feedback/submission.ts` (create) | Pure: `SAFE_IDENTIFIER_KEYS`, `SAFE_TOOL_KEYS`, `buildSubmissionPayload`, `renderIssueBody`, `renderIssueTitle`. No I/O. |
| `src/tools/submit_usage_feedback.ts` (create) | MCP tool: two-call confirm gate, injectable `load` + `GhRunner` deps, default `gh` runner. |
| `.github/ISSUE_TEMPLATE/usage-feedback.md` (create, repo root) | Issue template that establishes the `usage-feedback` label + documents the format. |
| `src/index.ts` (modify) | Register `submit_usage_feedback` as a core tool. |
| `tests/feedback/submission.test.ts` (create) | Unit tests for the pure transform. |
| `tests/tools/submit_usage_feedback.test.ts` (create) | Unit tests for the tool with injected deps. |

---

## Task 1: Anonymization transform — `buildSubmissionPayload`

**Files:**
- Create: `src/feedback/submission.ts`
- Test: `tests/feedback/submission.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/feedback/submission.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSubmissionPayload } from '../../src/feedback/submission.js';
import type { InstitutionProfile } from '../../src/discovery/profile.js';

const profile: InstitutionProfile = {
  identifiers: { 'Canvas LMS': 'bsu.instructure.com', Panopto: 'bsu.hosted.panopto.com', lms: 'canvas' },
  tools: [
    { id: 'panopto', name: 'Panopto', scope: 'global', module: 'video', source: 'detected' },
    { id: 'iclicker', name: 'iClicker', scope: 'global', module: 'none', source: 'self-reported' },
  ],
};

describe('buildSubmissionPayload', () => {
  it('anonymized (default): drops identifying keys, keeps safe-allowlist keys', () => {
    const p = buildSubmissionPayload(profile);
    expect(p.named).toBe(false);
    expect(p.identifiers).toEqual({ lms: 'canvas' });
    expect(p.tools.map((t) => t.id)).toEqual(['panopto', 'iclicker']);
  });

  it('anonymized with no safe keys → empty identifiers, tools still present', () => {
    const p = buildSubmissionPayload({
      identifiers: { 'Canvas LMS': 'bsu.instructure.com' },
      tools: profile.tools,
    });
    expect(p.identifiers).toEqual({});
    expect(p.tools).toHaveLength(2);
  });

  it('named: keeps the full identifiers map verbatim', () => {
    const p = buildSubmissionPayload(profile, { named: true });
    expect(p.named).toBe(true);
    expect(p.identifiers).toEqual(profile.identifiers);
  });

  it('field-guards tools: strips any key not in SAFE_TOOL_KEYS', () => {
    const dirty = {
      identifiers: {},
      tools: [{ id: 'x', name: 'X', scope: 'global', module: 'none', source: 'detected', apiToken: 'SECRET' }],
    } as unknown as InstitutionProfile;
    const p = buildSubmissionPayload(dirty);
    expect(Object.keys(p.tools[0])).toEqual(['id', 'name', 'scope', 'module', 'source']);
    expect((p.tools[0] as Record<string, unknown>).apiToken).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/feedback/submission.test.ts`
Expected: FAIL — `Cannot find module '../../src/feedback/submission.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/feedback/submission.ts`:

```ts
import type { InstitutionProfile, ProfileTool } from '../discovery/profile.js';

/** Coarse, non-identifying identifier keys kept in anonymized mode. Default-deny: anything
 *  not in this set is dropped. Compared lower-cased. */
export const SAFE_IDENTIFIER_KEYS = ['lms', 'institutiontype', 'sizebucket', 'region'] as const;

/** Tool fields allowed to leave the machine. Mirrors #76's ProfileTool exactly; guards against a
 *  future profile change leaking a new field. */
export const SAFE_TOOL_KEYS = ['id', 'name', 'scope', 'module', 'source'] as const;

export interface SubmissionPayload {
  named: boolean;
  identifiers: Record<string, string>;
  tools: ProfileTool[];
}

export interface BuildOptions {
  named?: boolean;
}

const SAFE_ID_SET = new Set<string>(SAFE_IDENTIFIER_KEYS);

export function buildSubmissionPayload(
  profile: InstitutionProfile,
  opts: BuildOptions = {},
): SubmissionPayload {
  const named = opts.named === true;

  const identifiers: Record<string, string> = {};
  for (const [k, v] of Object.entries(profile.identifiers ?? {})) {
    if (named || SAFE_ID_SET.has(k.toLowerCase())) identifiers[k] = v;
  }

  const tools: ProfileTool[] = (profile.tools ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    scope: t.scope,
    module: t.module,
    source: t.source,
  }));

  return { named, identifiers, tools };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/feedback/submission.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/feedback/submission.ts tests/feedback/submission.test.ts
git commit -m "feat(feedback): buildSubmissionPayload — default-deny anonymization (#77)"
```

---

## Task 2: Render the issue body and title

**Files:**
- Modify: `src/feedback/submission.ts`
- Test: `tests/feedback/submission.test.ts` (add to the existing file)

- [ ] **Step 1: Write the failing test**

In `tests/feedback/submission.test.ts`: **extend the existing submission.js import** to
`import { buildSubmissionPayload, renderIssueBody, renderIssueTitle } from '../../src/feedback/submission.js';`,
**add** `import { parse as parseYaml } from 'yaml';` to the top import block (next to the existing imports — do not add a second import lower in the file), then append these describe blocks:

```ts
describe('renderIssueBody', () => {
  it('includes the parser marker and a YAML block that round-trips', () => {
    const payload = buildSubmissionPayload(profile);
    const body = renderIssueBody(payload);
    expect(body).toContain('<!-- canvas-toolchain usage-feedback v1 -->');
    expect(body).toContain('**Mode:** anonymized');
    const yamlMatch = body.match(/```yaml\n([\s\S]*?)\n```/);
    expect(yamlMatch).not.toBeNull();
    const parsed = parseYaml(yamlMatch![1]) as { named: boolean; tools: unknown[] };
    expect(parsed.named).toBe(false);
    expect(parsed.tools).toHaveLength(2);
  });

  it('shows the no-identifiers note when the safe subset is empty', () => {
    const body = renderIssueBody(buildSubmissionPayload({ identifiers: {}, tools: profile.tools }));
    expect(body).toContain('None (anonymized).');
  });
});

describe('renderIssueTitle', () => {
  it('anonymized → generic title with tool count', () => {
    expect(renderIssueTitle(buildSubmissionPayload(profile))).toBe('usage-feedback: anonymous — 2 tools');
  });

  it('named → institution name when an identifier names it, else "named"', () => {
    const withName = buildSubmissionPayload({ identifiers: { institution: 'Boise State' }, tools: [] }, { named: true });
    expect(renderIssueTitle(withName)).toBe('usage-feedback: Boise State — 0 tools');
    const noName = buildSubmissionPayload({ identifiers: { lms: 'canvas' }, tools: profile.tools }, { named: true });
    expect(renderIssueTitle(noName)).toBe('usage-feedback: named — 2 tools');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/feedback/submission.test.ts`
Expected: FAIL — `renderIssueBody is not a function` / `renderIssueTitle is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/feedback/submission.ts` (new import at top, new functions at bottom):

```ts
import { stringify as stringifyYaml } from 'yaml';
```

```ts
/** Pick the institution name for a named-mode title, if one of these keys is present. */
const NAME_KEYS = ['institution', 'name', 'institutionname'];

export function renderIssueTitle(payload: SubmissionPayload): string {
  const n = payload.tools.length;
  if (payload.named) {
    const hit = Object.entries(payload.identifiers).find(([k]) => NAME_KEYS.includes(k.toLowerCase()));
    return `usage-feedback: ${hit ? hit[1] : 'named'} — ${n} tools`;
  }
  return `usage-feedback: anonymous — ${n} tools`;
}

export function renderIssueBody(payload: SubmissionPayload): string {
  const idEntries = Object.entries(payload.identifiers);
  const idTable = idEntries.length
    ? ['| Key | Value |', '|---|---|', ...idEntries.map(([k, v]) => `| ${k} | ${v} |`)].join('\n')
    : payload.named
      ? '_None recorded._'
      : 'None (anonymized).';

  const toolTable = payload.tools.length
    ? [
        '| Tool | Module | Scope | Source |',
        '|---|---|---|---|',
        ...payload.tools.map((t) => `| ${t.name} | ${t.module} | ${t.scope} | ${t.source} |`),
      ].join('\n')
    : '_No tools recorded._';

  const yamlBlock = stringifyYaml({
    named: payload.named,
    identifiers: payload.identifiers,
    tools: payload.tools,
  }).trimEnd();

  return [
    '<!-- canvas-toolchain usage-feedback v1 -->',
    `**Mode:** ${payload.named ? 'named' : 'anonymized'}`,
    '',
    '## Identifiers',
    idTable,
    '',
    '## Tools',
    toolTable,
    '',
    '<details><summary>Machine-readable</summary>',
    '',
    '```yaml',
    yamlBlock,
    '```',
    '</details>',
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/feedback/submission.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/feedback/submission.ts tests/feedback/submission.test.ts
git commit -m "feat(feedback): renderIssueBody + renderIssueTitle (#77)"
```

---

## Task 3: The MCP tool — confirm gate + injectable deps

**Files:**
- Create: `src/tools/submit_usage_feedback.ts`
- Test: `tests/tools/submit_usage_feedback.test.ts`

This task implements the tool against **injected** `load` + `gh` deps only (the real `gh` runner is Task 4). The default deps object is added in Task 4; in this task `defaultDeps` is referenced but its `gh` is a stub that throws "not yet wired" — every test injects its own deps, so the stub is never hit.

- [ ] **Step 1: Write the failing test**

Create `tests/tools/submit_usage_feedback.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { submitUsageFeedback } from '../../src/tools/submit_usage_feedback.js';
import type { InstitutionProfile } from '../../src/discovery/profile.js';

const profile: InstitutionProfile = {
  identifiers: { lms: 'canvas', 'Canvas LMS': 'bsu.instructure.com' },
  tools: [{ id: 'panopto', name: 'Panopto', scope: 'global', module: 'video', source: 'detected' }],
};

function ghSpy(overrides: Partial<{ available: boolean; url: string; throwOnCreate: boolean }> = {}) {
  return {
    available: vi.fn(async () => overrides.available ?? true),
    createIssue: vi.fn(async () => {
      if (overrides.throwOnCreate) throw new Error('gh boom');
      return overrides.url ?? 'https://github.com/Ryfter/canvas-toolchain/issues/123';
    }),
  };
}

describe('submitUsageFeedback', () => {
  it('review stage (no confirm): returns body, never touches gh', async () => {
    const gh = ghSpy();
    const r = await submitUsageFeedback({}, { load: () => profile, gh });
    expect(r.ok).toBe(true);
    if (r.ok && r.stage === 'review') {
      expect(r.body).toContain('## Tools');
      expect(r.title).toContain('usage-feedback:');
    } else throw new Error('expected review stage');
    expect(gh.available).not.toHaveBeenCalled();
    expect(gh.createIssue).not.toHaveBeenCalled();
  });

  it('send stage (confirm:true, gh available): creates the issue and returns the URL', async () => {
    const gh = ghSpy({ url: 'https://github.com/Ryfter/canvas-toolchain/issues/7' });
    const r = await submitUsageFeedback({ confirm: true }, { load: () => profile, gh });
    expect(r).toEqual({ ok: true, stage: 'submitted', issueUrl: 'https://github.com/Ryfter/canvas-toolchain/issues/7' });
    expect(gh.createIssue).toHaveBeenCalledOnce();
    expect(gh.createIssue.mock.calls[0][0].label).toBe('usage-feedback');
  });

  it('send stage with gh unavailable → GH_UNAVAILABLE, createIssue never called', async () => {
    const gh = ghSpy({ available: false });
    const r = await submitUsageFeedback({ confirm: true }, { load: () => profile, gh });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('GH_UNAVAILABLE');
    expect(gh.createIssue).not.toHaveBeenCalled();
  });

  it('empty profile → NO_PROFILE, gh never called', async () => {
    const gh = ghSpy();
    const r = await submitUsageFeedback({ confirm: true }, { load: () => ({ identifiers: {}, tools: [] }), gh });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NO_PROFILE');
    expect(gh.available).not.toHaveBeenCalled();
  });

  it('createIssue throws → GH_SUBMIT_FAILED with the error surfaced', async () => {
    const gh = ghSpy({ throwOnCreate: true });
    const r = await submitUsageFeedback({ confirm: true }, { load: () => profile, gh });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('GH_SUBMIT_FAILED');
      expect(r.message).toContain('gh boom');
    }
  });

  it('named:true rides the full identifiers into the rendered body', async () => {
    const gh = ghSpy();
    const r = await submitUsageFeedback({ named: true }, { load: () => profile, gh });
    if (r.ok && r.stage === 'review') expect(r.body).toContain('bsu.instructure.com');
    else throw new Error('expected review stage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/submit_usage_feedback.test.ts`
Expected: FAIL — `Cannot find module '../../src/tools/submit_usage_feedback.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/tools/submit_usage_feedback.ts`:

```ts
import { loadProfile, type InstitutionProfile } from '../discovery/profile.js';
import { buildSubmissionPayload, renderIssueBody, renderIssueTitle } from '../feedback/submission.js';

export interface SubmitUsageFeedbackInput {
  named?: boolean;
  confirm?: boolean;
}

export interface GhRunner {
  /** True iff gh is installed AND authenticated. */
  available(): Promise<boolean>;
  /** Create the issue; resolve to its URL. Throws on failure. */
  createIssue(args: { title: string; body: string; label: string }): Promise<string>;
}

export interface SubmitDeps {
  load: () => InstitutionProfile;
  gh: GhRunner;
}

export type SubmitUsageFeedbackResult =
  | { ok: true; stage: 'review'; named: boolean; title: string; body: string; note: string }
  | { ok: true; stage: 'submitted'; issueUrl: string }
  | { ok: false; error: string; message: string; fix: string[] };

const FEEDBACK_LABEL = 'usage-feedback';

// Real gh runner is wired in Task 4. Until then this stub is never reached (all tests inject gh).
const notWired: GhRunner = {
  available: async () => false,
  createIssue: async () => {
    throw new Error('gh runner not wired');
  },
};

const defaultDeps: SubmitDeps = {
  load: () => loadProfile(),
  gh: notWired,
};

export async function submitUsageFeedback(
  input: SubmitUsageFeedbackInput = {},
  deps: SubmitDeps = defaultDeps,
): Promise<SubmitUsageFeedbackResult> {
  const profile = deps.load();
  if (!profile.tools || profile.tools.length === 0) {
    return {
      ok: false,
      error: 'NO_PROFILE',
      message: 'No institution profile with tools was found.',
      fix: ['Run discover_tools, then save_institution_profile, before submitting feedback.'],
    };
  }

  const payload = buildSubmissionPayload(profile, { named: input.named });
  const title = renderIssueTitle(payload);
  const body = renderIssueBody(payload);

  if (input.confirm !== true) {
    return {
      ok: true,
      stage: 'review',
      named: payload.named,
      title,
      body,
      note: 'Review the body above. Call again with confirm:true to submit it as a public GitHub issue.',
    };
  }

  if (!(await deps.gh.available())) {
    return {
      ok: false,
      error: 'GH_UNAVAILABLE',
      message: 'GitHub CLI (gh) was not found or is not authenticated.',
      fix: ['Install gh from https://cli.github.com', 'Run `gh auth login`', 'Then retry with confirm:true.'],
    };
  }

  try {
    const issueUrl = await deps.gh.createIssue({ title, body, label: FEEDBACK_LABEL });
    return { ok: true, stage: 'submitted', issueUrl };
  } catch (err) {
    return {
      ok: false,
      error: 'GH_SUBMIT_FAILED',
      message: err instanceof Error ? err.message : String(err),
      fix: ['Inspect the gh error above', 'Verify repo access', 'Retry with confirm:true.'],
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/submit_usage_feedback.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/submit_usage_feedback.ts tests/tools/submit_usage_feedback.test.ts
git commit -m "feat(feedback): submit_usage_feedback tool — two-call confirm gate (#77)"
```

---

## Task 4: Default `gh` runner (real CLI)

**Files:**
- Modify: `src/tools/submit_usage_feedback.ts`
- Test: `tests/tools/submit_usage_feedback.test.ts` (add one runner-construction test)

The default runner shells out via `execFile` (args array — no shell string, no interpolation), passing the body through a temp `--body-file` written `0o600` then unlinked. It cannot be unit-tested against a real `gh` deterministically, so the test only asserts the runner is constructed with both methods and that `available()` resolves to a boolean without throwing (works whether or not `gh` is installed on the dev box).

- [ ] **Step 1: Write the failing test**

In `tests/tools/submit_usage_feedback.test.ts`: **extend the existing tool import** to
`import { submitUsageFeedback, makeGhRunner } from '../../src/tools/submit_usage_feedback.js';`
(do not add a second import line lower in the file), then append this describe block:

```ts
describe('makeGhRunner (default runner)', () => {
  it('exposes available() + createIssue() and available() resolves to a boolean', async () => {
    const runner = makeGhRunner('Ryfter/canvas-toolchain');
    expect(typeof runner.available).toBe('function');
    expect(typeof runner.createIssue).toBe('function');
    const avail = await runner.available();
    expect(typeof avail).toBe('boolean'); // true or false depending on the box; must not throw
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/submit_usage_feedback.test.ts -t 'makeGhRunner'`
Expected: FAIL — `makeGhRunner is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/tools/submit_usage_feedback.ts` — new imports at top, `makeGhRunner` near the bottom, and replace `defaultDeps.gh` to use it:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

/** GitHub repo the feedback issues are filed against. */
export const FEEDBACK_REPO = 'Ryfter/canvas-toolchain';

/** Build the real gh-backed runner for a given repo slug. */
export function makeGhRunner(repo: string): GhRunner {
  return {
    async available(): Promise<boolean> {
      try {
        await execFileAsync('gh', ['auth', 'status']);
        return true;
      } catch {
        return false;
      }
    },
    async createIssue({ title, body, label }): Promise<string> {
      const file = join(tmpdir(), `ctk-usage-feedback-${process.pid}-${Date.now()}.md`);
      await writeFile(file, body, { encoding: 'utf-8', mode: 0o600 });
      try {
        const { stdout } = await execFileAsync('gh', [
          'issue', 'create',
          '--repo', repo,
          '--title', title,
          '--label', label,
          '--body-file', file,
        ]);
        const url = stdout.trim().split('\n').filter(Boolean).pop() ?? '';
        if (!/^https?:\/\//.test(url)) throw new Error(`Unexpected gh output: ${stdout.trim()}`);
        return url;
      } finally {
        await unlink(file).catch(() => {});
      }
    },
  };
}
```

Then change the `defaultDeps` definition (remove the `notWired` stub) to:

```ts
const defaultDeps: SubmitDeps = {
  load: () => loadProfile(),
  gh: makeGhRunner(FEEDBACK_REPO),
};
```

Delete the now-unused `notWired` constant.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/submit_usage_feedback.test.ts`
Expected: PASS (7 tests — the 6 from Task 3 plus the runner test). `available()` returns `false` on a box without `gh` auth and `true` on one with it; either way the assertion holds.

- [ ] **Step 5: Commit**

```bash
git add src/tools/submit_usage_feedback.ts tests/tools/submit_usage_feedback.test.ts
git commit -m "feat(feedback): default gh runner via execFile + temp body-file (#77)"
```

---

## Task 5: Issue template establishing the `usage-feedback` label

**Files:**
- Create: `.github/ISSUE_TEMPLATE/usage-feedback.md` (at the **repo root**, i.e. `D:/Dev/canvas-toolchain/.github/ISSUE_TEMPLATE/usage-feedback.md`)

No automated test (static GitHub asset). Verification is visual + the build/lint in Task 6.

- [ ] **Step 1: Create the template**

Create `.github/ISSUE_TEMPLATE/usage-feedback.md`:

```markdown
---
name: Usage feedback (institution profile)
about: Share an anonymized inventory of the tools your institution uses, to help prioritize integrations.
title: 'usage-feedback: '
labels: usage-feedback
---

<!-- canvas-toolchain usage-feedback v1 -->

This template is normally filled in for you by the `submit_usage_feedback` MCP tool
(run it with `confirm:true`). It anonymizes your institution profile by default — only a
coarse tool inventory is shared; no credentials, hostnames, or student data.

If you are submitting by hand, paste the tool's rendered body below. It contains:

- **Mode:** anonymized or named
- **Identifiers:** coarse, non-identifying descriptors only (anonymized mode)
- **Tools:** a table of the tools detected/declared on your instance
- A machine-readable YAML block

Thank you for helping shape what gets built next.
```

- [ ] **Step 2: Verify it parses as YAML front matter**

Run: `npx vitest run tests/feedback/submission.test.ts` (sanity that nothing else broke; the template itself has no test).
Expected: still PASS. Manually confirm the front matter block is valid (three `---` fences, `labels: usage-feedback`).

- [ ] **Step 3: Commit**

```bash
git add .github/ISSUE_TEMPLATE/usage-feedback.md
git commit -m "feat(feedback): usage-feedback issue template + label (#77)"
```

---

## Task 6: Register the tool in the MCP server

**Files:**
- Modify: `src/index.ts` (import near line 28; ListTools entry after the `save_institution_profile` block ending ~line 266; CallTool switch case after the `save_institution_profile` case ~line 770)

- [ ] **Step 1: Add the import**

After the line `import { saveInstitutionProfile } from './tools/save_institution_profile.js';` (≈ line 28) add:

```ts
import { submitUsageFeedback } from './tools/submit_usage_feedback.js';
```

- [ ] **Step 2: Add the ListTools descriptor**

Immediately after the closing `}` of the `save_institution_profile` tool object (the `},` ending around line 266), add a new object:

```ts
    {
      name: 'submit_usage_feedback',
      description:
        'Submit an anonymized inventory of your institution\'s tools as a GitHub issue, so the author can prioritize integrations. Opt-in. Two-call gate: call once to review the exact payload, then call again with confirm:true to submit via gh. named:true includes full identifiers (default is anonymized).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          named: { type: 'boolean', description: 'Include full institution identifiers (default false = anonymized).' },
          confirm: { type: 'boolean', description: 'false/omitted = review only; true = submit the GitHub issue.' },
        },
      },
    },
```

- [ ] **Step 3: Add the CallTool switch case**

After the `save_institution_profile` case (ending ~line 770), add:

```ts
      case 'submit_usage_feedback':
        result = await submitUsageFeedback(args as unknown as Parameters<typeof submitUsageFeedback>[0]);
        break;
```

- [ ] **Step 4: Build + full test suite + smoke**

```bash
npm run build
npm test
npm run smoke:integration
```

Expected: build clean; all tests pass (the new `submission` + `submit_usage_feedback` suites included); smoke green.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(feedback): register submit_usage_feedback as a core tool (#77)"
```

---

## Task 7: Documentation

**Files:**
- Modify: `packages/command-and-control/CLAUDE.md` (Implemented bullet list)
- Modify: `AGENTS.md` (repo root — the C&C tool list / handoff section)

- [ ] **Step 1: Add the CLAUDE.md bullet**

In `packages/command-and-control/CLAUDE.md`, after the `save_institution_profile` bullet in the "Implemented" list, add:

```markdown
- `submit_usage_feedback` MCP tool — opt-in (#77). Turns the master institution profile into an **anonymized** GitHub issue (`usage-feedback` label on `Ryfter/canvas-toolchain`) so the author can see which tools professors use and prioritize integrations. Default-deny anonymization: only coarse `SAFE_IDENTIFIER_KEYS` (`lms`, `institutionType`, `sizeBucket`, `region`) survive; `named:true` opts into full identifiers. Stateless two-call confirm gate — call once to review the exact payload, call again with `confirm:true` to submit via `gh issue create`. No browser fallback: missing/unauthed `gh` → `GH_UNAVAILABLE`. Never transmits tokens or student data; tools are field-guarded to `SAFE_TOOL_KEYS`.
```

- [ ] **Step 2: Update AGENTS.md**

In the repo-root `AGENTS.md`, add `submit_usage_feedback` to the C&C tool inventory / current-state section in the same style as the surrounding entries (one line: opt-in anonymized GitHub usage-feedback submission, two-call confirm gate, closes #77; #75 remains externally blocked).

- [ ] **Step 3: Commit**

```bash
git add packages/command-and-control/CLAUDE.md AGENTS.md
git commit -m "docs(feedback): document submit_usage_feedback (#77)"
```

---

## Final verification (after all tasks)

```bash
cd packages/command-and-control
npm run build      # clean
npm test           # all green, including tests/feedback + tests/tools/submit_usage_feedback
npm run smoke:integration
```

Then dispatch the whole-implementation code reviewer over the #77 commit range before closeout.
```