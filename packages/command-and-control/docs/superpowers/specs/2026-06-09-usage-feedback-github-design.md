# Usage Feedback via GitHub — Design (#77)

> **Status:** Approved design, pre-implementation.
> **Depends on:** #76 (institution profile — shipped, decision d002), #78 (module architecture — shipped).
> **Decision record:** to be created (d003) after spec approval.

## Goal

Let an opted-in professor submit a standardized, anonymized profile of the tools/infrastructure
their institution uses, as a **GitHub issue**, so the toolchain author (Kevin) can gauge real-world
usage and prioritize which integrations to build next.

Payload = the institution profile produced by #76
(`~/.command-and-control/institution-profile.md`: a `## Identifiers` block + a `## Tools` fenced-YAML
block holding `identifiers` + `tools[]`).

Strictly opt-in. Anonymized by default. No credentials, no student data — institution descriptors +
tool inventory only.

## Design decisions (locked during brainstorming, 2026-06-09)

| # | Question | Choice |
|---|---|---|
| Q1 | How much institutional identity rides along? | **Submitter's choice** — default anonymized, `named:true` opt-in. |
| Q2 | How does submission reach GitHub? | **Tool drives `gh` directly** (`gh issue create`). |
| Q3 | Review gate + `gh`-missing handling? | **Two-call confirm gate, no browser fallback** — `gh` missing → structured error, stop. |
| Q4 | What does "anonymized" do to identifiers? | **Default-deny allowlist** — keep only coarse safe keys, drop everything else. |

## Architecture

One new core MCP tool, backed by one pure transform module. No new dependencies (`gh` is an
external CLI invoked through an injected runner; `yaml` is already a C&C dependency from #76).

```text
src/discovery/profile.ts            (existing #76 — loadProfile, types)  ← reused, unchanged
src/feedback/submission.ts          (NEW — pure transform + renderer)
src/tools/submit_usage_feedback.ts  (NEW — MCP tool: confirm gate + gh runner)
src/index.ts                        (MODIFY — register submit_usage_feedback as a core tool)
.github/ISSUE_TEMPLATE/usage-feedback.md  (NEW — issue template + usage-feedback label)
```

### Unit 1 — `src/feedback/submission.ts` (pure, no I/O)

Responsibilities: turn a loaded `InstitutionProfile` into a submission payload, applying the
anonymization policy, then render that payload to a Markdown issue body. No filesystem, no network,
no `gh` — fully unit-testable.

```ts
import type { InstitutionProfile, ProfileTool } from '../discovery/profile.js';

/** Coarse, non-identifying identifier keys kept in anonymized mode. Default-deny: anything
 *  not in this set is dropped. Lower-cased comparison. */
export const SAFE_IDENTIFIER_KEYS = ['lms', 'institutiontype', 'sizebucket', 'region'] as const;

/** Tool fields allowed to leave the machine. Guard against a future profile change leaking a
 *  new field. Matches #76's ProfileTool exactly. */
export const SAFE_TOOL_KEYS = ['id', 'name', 'scope', 'module', 'source'] as const;

export interface SubmissionPayload {
  named: boolean;
  identifiers: Record<string, string>; // safe subset (anon) or full map (named)
  tools: ProfileTool[];                // field-guarded copy
}

export interface BuildOptions {
  named?: boolean; // default false
}

/** Apply the anonymization policy. Pure. */
export function buildSubmissionPayload(
  profile: InstitutionProfile,
  opts: BuildOptions = {},
): SubmissionPayload {
  const named = opts.named === true;

  const identifiers: Record<string, string> = {};
  for (const [k, v] of Object.entries(profile.identifiers ?? {})) {
    if (named || SAFE_IDENTIFIER_KEYS.includes(k.toLowerCase() as (typeof SAFE_IDENTIFIER_KEYS)[number])) {
      identifiers[k] = v;
    }
  }

  // Field-guard every tool: copy only known-safe keys, drop anything else.
  const tools: ProfileTool[] = (profile.tools ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    scope: t.scope,
    module: t.module,
    source: t.source,
  }));

  return { named, identifiers, tools };
}

/** Render the payload to the Markdown issue body. Pure. */
export function renderIssueBody(payload: SubmissionPayload): string { /* … see below … */ }

/** Title: anonymized → generic; named → institution name when present. Pure. */
export function renderIssueTitle(payload: SubmissionPayload): string { /* … see below … */ }
```

**Anonymization policy (the crux):**

- `named: false` (default) — keep only identifier keys whose lower-cased name is in
  `SAFE_IDENTIFIER_KEYS`. The current #76 profiles hold free-form service→host pairs
  (`Canvas LMS: bsu.instructure.com`), **all of which are identifying and therefore stripped** —
  in practice an anonymized payload today is tools-only, gaining coarse fields only if a future
  profile adds e.g. `institutionType: R1`.
- `named: true` (opt-in) — keep the full `identifiers` map verbatim.
- **Always** — `tools[]` is field-guarded to `SAFE_TOOL_KEYS`. #76 already guarantees tools hold no
  tokens/student data; the guard is defense-in-depth so a future field addition can't silently leak.

**`renderIssueBody`** produces:

```markdown
<!-- canvas-toolchain usage-feedback v1 -->
**Mode:** anonymized   <!-- or: named -->

## Identifiers
| Key | Value |
|---|---|
| lms | canvas |
_(or "None (anonymized)." when the safe subset is empty)_

## Tools
| Tool | Module | Scope | Source |
|---|---|---|---|
| iClicker | none | global | self-reported |
| Panopto | module-video | global | detected |

<details><summary>Machine-readable</summary>

```yaml
named: false
identifiers:
  lms: canvas
tools:
  - id: panopto
    name: Panopto
    scope: global
    module: module-video
    source: detected
```
</details>
```

The HTML comment marker (`<!-- canvas-toolchain usage-feedback v1 -->`) lets future aggregation
tooling reliably find and parse submissions; the human table is for at-a-glance reading.

**`renderIssueTitle`:**
- anonymized → `usage-feedback: anonymous — <N> tools`
- named → `usage-feedback: <institution name or "named"> — <N> tools` (institution name taken from a
  `name`/`institution` identifier key if present in named mode, else the literal `named`).

### Unit 2 — `src/tools/submit_usage_feedback.ts` (MCP tool)

Responsibilities: orchestrate load → build → (review | send). Injectable deps for testing, mirroring
`discover_tools`' pattern.

```ts
import { loadProfile, getProfilePath, type InstitutionProfile } from '../discovery/profile.js';
import { buildSubmissionPayload, renderIssueBody, renderIssueTitle } from '../feedback/submission.js';

export interface SubmitUsageFeedbackInput {
  named?: boolean;   // default false — include full identifiers
  confirm?: boolean; // default false — call 1 reviews, call 2 sends
}

export interface GhRunner {
  /** Returns the created issue URL. Throws on gh-missing / gh-unauthed / create failure. */
  createIssue(args: { title: string; body: string; label: string }): Promise<string>;
  /** True iff gh is installed AND authenticated. */
  available(): Promise<boolean>;
}

export interface SubmitDeps {
  load: () => InstitutionProfile;
  gh: GhRunner;
}

export type SubmitUsageFeedbackResult =
  | { ok: true; stage: 'review'; named: boolean; title: string; body: string; note: string }
  | { ok: true; stage: 'submitted'; issueUrl: string }
  | { ok: false; error: string; message: string; fix: string[] };

export async function submitUsageFeedback(
  input: SubmitUsageFeedbackInput = {},
  deps: SubmitDeps = defaultDeps,
): Promise<SubmitUsageFeedbackResult>;
```

**Behavior:**

1. Load the profile. If it's empty (no tools), return
   `{ ok:false, error:'NO_PROFILE', message, fix:['Run discover_tools then save_institution_profile first.'] }`.
2. `buildSubmissionPayload(profile, { named: input.named })`; render title + body.
3. **`confirm !== true` (review stage)** — return `stage:'review'` with the exact `title`/`body` and a
   `note: 'Review the body above. Call again with confirm:true to submit as a GitHub issue.'`. **`gh`
   is never invoked at this stage.**
4. **`confirm === true` (send stage)** —
   - `await deps.gh.available()`; if false →
     `{ ok:false, error:'GH_UNAVAILABLE', message:'GitHub CLI not found or not authenticated.',
        fix:['Install gh (https://cli.github.com), then run `gh auth login`.'] }`. **Stop. No fallback.**
   - else `const url = await deps.gh.createIssue({ title, body, label:'usage-feedback' })`; return
     `stage:'submitted'` with `issueUrl: url`. On `createIssue` throw → structured
     `{ ok:false, error:'GH_SUBMIT_FAILED', message:<err>, fix:[…] }`.

**Default `gh` runner** (`defaultDeps.gh`) shells out via `node:child_process execFile` (no shell
string interpolation — args array, body passed via a temp `--body-file` written 0o600 then unlinked):
- `available()` → `gh auth status` exit 0.
- `createIssue()` → `gh issue create --repo <REPO> --title <t> --label usage-feedback --body-file <tmp>`,
  parse the printed issue URL from stdout.

`<REPO>` is the canvas-toolchain GitHub slug, a module-level constant.

### Unit 3 — `.github/ISSUE_TEMPLATE/usage-feedback.md`

A new issue template (front matter: `name`, `about`, `title: 'usage-feedback: '`, `labels: usage-feedback`)
so the `usage-feedback` label exists and submissions are filterable via `gh issue list --label usage-feedback`.
The tool sets the label explicitly too; the template guarantees label existence and documents the format
for anyone submitting by hand.

### Unit 4 — `src/index.ts` registration

Register `submit_usage_feedback` as a **core** (always-on) tool — feedback is not module-gated.
Input schema: `{ named?: boolean, confirm?: boolean }`, both optional, both default false.

## Data flow

```text
institution-profile.md ──loadProfile──▶ InstitutionProfile
                                          │
                            buildSubmissionPayload({named})   ← default-deny anonymization
                                          │
                         renderIssueTitle + renderIssueBody
                                          │
                  confirm:false ──▶ return {stage:'review', title, body}   (gh untouched)
                  confirm:true  ──▶ gh.available()? ──no──▶ {error:'GH_UNAVAILABLE'}  STOP
                                          │yes
                                  gh.createIssue ──▶ {stage:'submitted', issueUrl}
```

## Error handling

All failures return the canonical `{ ok:false, error, message, fix }` shape (mirrors
`set_active_llm_provider`, `save_institution_profile`):

| error | When | fix |
|---|---|---|
| `NO_PROFILE` | profile absent / no tools | run discover_tools + save_institution_profile first |
| `GH_UNAVAILABLE` | `gh` missing or unauthed at send | install gh + `gh auth login` |
| `GH_SUBMIT_FAILED` | `gh issue create` threw | inspect the gh error in `message`; retry |

No partial sends: the review stage never touches `gh`; the send stage either returns a URL or a
structured error.

## Scope (v1 — YAGNI)

**In:** opt-in submission flow, default-deny anonymization, the issue template + label, two-call
review gate. Author reads submissions manually (`gh issue list --label usage-feedback`).

**Out (deferred until there's submission volume):** aggregation/tally tooling, dedup, repeat-submitter
tracking, a submissions dashboard, any non-GitHub transport, named-mode institution-name capture UI.

## Testing

**`submission.ts` (pure, no mocks needed):**
- anonymized drops `Canvas LMS`/`Panopto` host identifiers, keeps a planted `lms: canvas`.
- anonymized with no safe keys → empty identifiers, tools still present.
- named keeps the full identifiers map verbatim.
- tool field-guard: a profile tool with a planted stray key (e.g. `apiToken`) is stripped from output.
- `renderIssueBody` includes the `<!-- canvas-toolchain usage-feedback v1 -->` marker + a YAML block
  that round-trips through `yaml.parse`.
- `renderIssueTitle`: anonymized → `…anonymous — N tools`; named → institution name when present.

**`submit_usage_feedback.ts` (injected `load` + `gh`):**
- review stage (`confirm` omitted) returns `stage:'review'` with body; injected `gh.createIssue`/
  `gh.available` are **never called** (spy asserts zero invocations).
- send stage with `gh.available()=true` calls `createIssue` once and returns `stage:'submitted'` + URL.
- send stage with `gh.available()=false` returns `GH_UNAVAILABLE`; `createIssue` never called.
- empty profile → `NO_PROFILE`, `gh` never called.
- `createIssue` throw → `GH_SUBMIT_FAILED` with the error message surfaced.

No network and no real `gh` in tests — the runner is injected.

## Security & privacy

- Default anonymized; identifiers default-denied to a coarse allowlist.
- Tool field-guard prevents future-field leakage.
- `gh` invoked via `execFile` with an args array (no shell interpolation); body via temp `--body-file`
  written 0o600 and unlinked after.
- Submission is a public GitHub issue — the review stage exists precisely so the professor sees the
  exact public payload before call 2 sends it.
- Never reads or transmits `canvas-config.json`, tokens, or any student data.
```