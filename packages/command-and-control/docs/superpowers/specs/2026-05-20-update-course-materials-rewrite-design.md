# `update_course_materials` Rewrite — Design

**Status:** Draft (2026-05-20) — needs review
**Repos:** `D:\Dev\Command-and-Control-MCP` (workflow), `D:\Dev\canvas-design-studio` (rendering + audit), `D:\Dev\Curriculum-Intelligence` (verdict data)
**Size:** Large
**Decisions verified in conversation:**
- Template selection: verdict picks a template family by default, with opt-in `'review'` mode where professor picks among 2-3 candidates per assignment
- Accessibility: auto-fix mechanical violations, surface the rest for human review
- Publish: always return for review; never auto-publish

**Depends on:**
- Real `analyze_course` + trajectory log (spec already approved, plan in flight)
- Shared resource layer (spec #1)
- Template/theme library Phase 1 (spec #2)
- Registry mechanism (spec #8)
- Pomelli + Stitch adapters (specs #5, #6) — optional; workflow degrades gracefully without them

---

## 1. Problem

The current `update_course_materials` workflow stops short of what the toolchain is capable of. It drafts briefs and exports a CDS-format folder — but never calls CDS to actually render Canvas HTML, never runs accessibility checks, never uses philosophy KB or student personas, never lets CI's verdict signal influence the output. CDS has the rendering + audit machinery, CI has the verdict data, the shared resource layer has the KBs — none of it gets wired up. This rewrite connects everything.

## 2. Goals

1. From an analyzed course (verdicts present in trajectory log), produce review-ready Canvas HTML for every assignment.
2. The verdict (KEEP / UPDATE / DROP / ADD) drives template selection by default, with an opt-in review mode for professor confirmation.
3. Generated pages reflect the professor's philosophy KB and (when available) student personas.
4. Every generated page is audited for accessibility; mechanical violations are auto-fixed; judgment-required ones are flagged.
5. The workflow returns a comprehensive report — what was generated, what needs review, what was skipped, with paths to every artefact.
6. Publishing remains a separate, explicit step. This workflow never touches Canvas itself.

## 3. Non-goals

- Publishing to Canvas (separate, explicit step — keeps the "manual paste is first-class" principle intact).
- Auto-resolving every accessibility violation. Some require human judgment about content (e.g., what an image actually represents) — those get surfaced, not guessed.
- Re-generating already-clean pages when only dates changed (an optimisation; out of scope for v1).
- Multi-professor collaboration features. Single professor, single course at a time.

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ update_course_materials (rewritten C&C workflow)                     │
│                                                                      │
│ 1. Read trajectory log for courseId/semesterId                       │
│     → perAssignment verdicts                                         │
│ 2. Load philosophy KB + student personas (via shared resource layer) │
│ 3. Resolve template/theme/prompt-set selections from course config   │
│     (defaults: verdict-family default; override per assignment if    │
│      course is in 'review' mode)                                     │
│ 4. For each assignment in next-plan/:                                │
│     a. draftAssignmentBrief  (CI)                                    │
│     b. updateExamples        (CI)                                    │
│     c. pick template (by verdict OR review prompt)                   │
│     d. render: template × theme × prompt-set × content × context     │
│           (CDS generateCourse / generatePage)                        │
│     e. auditAccessibility (CDS)                                      │
│     f. if violations:                                                │
│           - mechanical → redesignCanvasPage auto-fix                 │
│           - judgment-required → flag in report                       │
│     g. validateCanvasHtml (CDS)                                      │
│     h. write final HTML to output/                                   │
│ 5. exportCourseFolder for CDS planning (existing behaviour)          │
│ 6. Compose summary report                                            │
│ 7. Return: { pages, needsReview, skipped, exportPath, summary }      │
└──────────────────────────────────────────────────────────────────────┘
```

## 5. Verdict → template-family mapping

Default mapping (overridable):

| Verdict | Template family | Notes |
|---|---|---|
| `KEEP` | `standard` | Date-shift only; minimal content change. |
| `UPDATE` | `refresh` | Includes a `callout` slot for "What's new this semester" framed from `diff` data. |
| `ADD` | `new-topic` | Extra `objectives` and `intro` weight; orients students who haven't seen this before. |
| `DROP` | *(not regenerated)* | Surfaced in report with rationale; manual archival decision. |

Template family is a tag on each template's `manifest.json`:

```jsonc
{ "tags": ["assignment", "family:standard", ...] }
```

Resolution algorithm:
1. Look up the family for the assignment's verdict.
2. Find installed templates in the local registry tagged `family:<family>` AND `assignment`.
3. If exactly one match → use it.
4. If multiple matches → use the course config's `templatePreference[<family>]` if set; otherwise prefer most recently installed.
5. If zero matches → fall back to the bundled `cds-defaults` template for that family (always present after migration).

## 6. Selection modes

Course config (extends existing config with):

```jsonc
{
  "templateSelection": "auto" | "review",
  "templateOverrides": {
    "<assignmentName>": { "templateId": "...", "templateVersion": "..." }
  },
  "themeId": "carthage-default",
  "themeVersion": "1.0.0",
  "promptSetId": "ranks-voice",
  "promptSetVersion": "1.0.0"
}
```

**`auto` mode (default):** workflow picks templates by verdict family without asking. Fast.

**`review` mode:** for each assignment, workflow returns up to 3 candidate templates (the family default + the next two highest-ranked alternatives). The workflow result includes a `pendingSelections` array; the caller (LLM / professor) confirms picks and re-invokes with `selections: {...}` to complete generation. Two-phase.

Per-assignment override in `templateOverrides` always wins — no review prompt, no verdict mapping.

## 7. Accessibility handling

After rendering each page:

```typescript
const audit = auditAccessibility(html);

// Categorise violations:
const mechanical = audit.warnings.filter(isMechanicallyFixable);
const judgment = audit.warnings.filter(requiresHumanJudgment);
const errors = audit.errors;  // hard violations (e.g., missing form labels on inputs)

// Auto-fix mechanical:
let fixed = html;
if (mechanical.length > 0) {
  const redesign = redesignCanvasPage({ html: fixed, findings: mechanical });
  fixed = redesign.html;
}

// Determine status:
if (errors.length > 0) {
  pageStatus = 'needs-review';        // hard violations remain
} else if (judgment.length > 0) {
  pageStatus = 'needs-review';        // human-judgment items
} else {
  pageStatus = 'clean';
}
```

**Mechanical (auto-fixable):**
- Missing `alt=""` on decorative images (add empty alt)
- Heading hierarchy skips (e.g., `<h1>` then `<h3>`) — renumber
- Low text contrast — bump to theme's compliant alternative
- Missing `aria-label` on Panopto iframes — add from session title

**Judgment-required (surfaced):**
- Image `alt` content (what does the image actually depict?)
- Descriptive link text ("click here" → ???)
- Whether a `<table>` is data or layout (different markup needed)
- Whether a colour-only signal needs an additional cue

**Hard errors (block 'clean' status):**
- Missing form labels
- Empty buttons / links
- Non-whitelisted Canvas RCE elements that survived earlier transforms

## 8. Output structure

```typescript
interface UpdateCourseMaterialsInput {
  courseId: string;
  semesterId: string;
  outputPath?: string;                      // default: ~/.command-and-control/output/<courseId>/<semesterId>/
  sections?: string[];
  /** Two-phase only: pass back the picks from a prior 'pendingSelections' result. */
  selections?: Record<string, { templateId: string; templateVersion: string }>;
  /** Skip mechanical auto-fix; surface everything. Default false. */
  noAutoFix?: boolean;
}

interface UpdateCourseMaterialsResult {
  courseId: string;
  semesterId: string;
  pendingSelections?: Array<{
    assignmentName: string;
    verdict: Verdict;
    candidates: Array<{ templateId: string; templateVersion: string; reason: string }>;
  }>;
  pages: Array<{
    assignmentName: string;
    verdict: Verdict;
    templateUsed: { id: string; version: string };
    themeUsed: { id: string; version: string };
    promptSetUsed: { id: string; version: string };
    htmlPath: string;
    status: 'clean' | 'needs-review' | 'skipped';
    needsReviewReasons?: string[];
    autofixApplied?: string[];
    unresolvedImagePrompts?: Array<{ slot: string; prompt: string }>;
  }>;
  droppedAssignments: Array<{ name: string; rationale: string }>;
  export: { exportPath: string };
  summary: {
    totalAssignments: number;
    cleanCount: number;
    needsReviewCount: number;
    droppedCount: number;
    skippedCount: number;
  };
  status: 'complete' | 'pending-selections';
}
```

`status: 'pending-selections'` returns early in `review` mode with `pendingSelections` populated; the caller re-invokes with `selections`.

`status: 'complete'` means generation finished; report is final.

## 9. Where the pieces come from

| Step | Source | Tool / module |
|---|---|---|
| Trajectory + verdicts | CI | `analyzeCourse` result OR direct read of `history.jsonl` |
| Philosophy KB | CDS storage | `loadKb().philosophyKb()` |
| Student personas | CDS storage | `loadKb().studentPersonas()` |
| Template / theme / prompt-set | Local registry | `~/.command-and-control/registry/` |
| Brief drafting | CI | `draftAssignmentBrief` |
| Example updates | CI | `updateExamples` |
| CDS export | CI | `exportCourseFolder` |
| HTML rendering | CDS | `generateCourse` (with template/theme/prompt-set IDs as inputs) |
| Accessibility audit | CDS | `auditAccessibility` |
| Redesign auto-fix | CDS | `redesignCanvasPage` |
| HTML validation | CDS | `validateCanvasHtml` |

The CDS `generateCourse` signature needs to be extended to accept `templateId`, `themeId`, `promptSetId` — currently it uses the baked-in catalog. This extension is part of the CDS migration in spec #2.

## 10. Test plan

- Unit: verdict → template family resolution.
- Unit: review-mode two-phase flow — first call returns `pendingSelections`, second call with `selections` completes.
- Unit: accessibility categorisation (mechanical vs judgment vs hard error).
- Unit: result shape — every assignment in the brief folder appears in `pages` or `droppedAssignments`.
- Integration: full workflow on the existing TEST101 fixture archive — analyze (with trajectory) then update, verify HTML output and report structure.
- Integration: course config override — `templateOverrides` for one assignment forces non-default template, others use verdict family.

## 11. Migration of existing workflow

Today's `update_course_materials` callers pass `{ courseId, semesterId, outputPath?, sections? }`. The new shape adds optional fields (`selections`, `noAutoFix`) but is backwards compatible. Existing callers continue to work; they get the new behaviour for free.

CDS's existing `generateCourse` signature change is the breaking part. Strategy:
1. Add new optional `templateId/themeId/promptSetId` params with fallbacks to current baked-in catalog.
2. Migrate baked-in catalog into the registry (spec #2's migration step).
3. Once registry has the seed bundle, switch the workflow to require registry-based selection.
4. Deprecate the baked-in catalog code path.

## 12. Open decisions for review

1. **`generateCourse` API change vs new tool.** Should we extend `generateCourse` to accept registry IDs (backwards compatible with fallbacks), or introduce a new tool `generateCourseFromRegistry` and leave `generateCourse` alone? Extension is simpler; new tool is cleaner separation. I lean extension with a feature-flag period.

2. **Per-page rendering granularity.** Today `generateCourse` does the whole course in one pass. With template selection per-assignment, the workflow may need to call `generatePage` per assignment instead. Per-page is more flexible (different templates per page) but slower (multiple LLM calls vs batched). I lean per-page for clarity; we can batch later if perf matters.

3. **Should DROP verdicts get any artefact at all?** Current spec says they're just listed in the report. An alternative: emit a "deprecation HTML" that, if published, marks the page as archived in Canvas. That's helpful for a clean course shell but requires Canvas-side conventions. Defer.

4. **What if the registry has no template for a verdict family?** Current spec falls back to `cds-defaults`. But what if `cds-defaults` itself isn't installed yet (fresh setup)? The workflow should bootstrap by auto-installing the default bundle on first run. Surface this in setup, not as an error.

5. **Image prompt handling in the result.** Each page may have unresolved image prompts (because image generation is pluggable and may not be configured). Should the workflow:
   - (a) Embed the prompt as a placeholder in the HTML ("[Hero image: <prompt>]") and surface in `unresolvedImagePrompts`
   - (b) Skip the slot entirely if no image source is configured
   - (c) Fail the page
   
   I lean (a). It produces something usable and surfaces the work for the professor to complete.

6. **Should `review` mode batch all candidate selections in one call, or interrupt per page?** Current spec says one call returns ALL pending selections at once; caller picks all at once. Alternative: per-page interrupt is more interactive but slower. I lean one-call.

## 13. Out of scope

- Auto-publishing to Canvas (intentionally; matches integration-contracts decision)
- Multi-section page customisation beyond what `exportCourseFolder` already does
- Re-rendering only the changed slots when re-running (full re-render is fine for v1)
- A diff view between previous-semester pages and new pages
