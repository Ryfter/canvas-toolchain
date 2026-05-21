# Curriculum Intelligence v1.0 — Design Spec

**Date:** 2026-05-18
**Supplements:** `2026-05-17-curriculum-intelligence-design.md` (v0.6 spec)
**Status:** Approved for implementation

---

## 1. Purpose

v0.6 shipped the analysis and planning layer: ingest Canvas archives, diff semesters, score topic currency, recommend verdicts, build a quote bank, scan transcripts. v1.0 adds the **planning-to-production layer**: take what the analysis said, build a plan for next semester, let the professor review it, and export a folder that Canvas Design Studio can consume directly.

This tool is generic — not tied to any institution. Any professor can install it locally and use it with any Canvas LMS export and any academic calendar.

---

## 2. Workflow

```
v0.6 analysis                v1.0 planning                  CDS production
─────────────────            ───────────────────────────    ─────────────────
diff_semesters      ──┐
recommend_for_topic ──┤      import_previous_shell
score_topic_currency──┘  →   fetch_academic_calendar    →   export_course_folder
                             shift_dates                       ↓
                             generate_recommended_outline   course/ folder
                             draft_assignment_brief            ↓
                             update_examples              import_course (CDS)
```

**Steps:**
1. `import_previous_shell` — read last semester's Canvas archive or CDS `course/` folder; write `next-plan/` skeleton
2. `fetch_academic_calendar` — parse institution's registrar page (or accept manual dates); write `calendar.json`
3. `shift_dates` — apply calendar to all `due:` fields in `next-plan/`; handle multi-section per-section offsets
4. `generate_recommended_outline` — use diff + verdict data to produce week-by-week outline in `next-plan/plan-outline.md`
5. `draft_assignment_brief` — LLM-draft updated brief for each assignment; flag for replacement if deeply stale
6. `update_examples` — mechanical pass (year/tool refs) then optional LLM pass; staleness flag
7. Professor reviews `next-plan/` in conversation with Claude, requests adjustments
8. `export_course_folder` — translate `next-plan/` to CDS `course/` format; one folder per section for multi-section courses

---

## 3. New tools (7)

### `import_previous_shell`

Reads last semester's content and creates a `next-plan/` skeleton for the new semester.

**Input:**
```ts
{
  courseId: string;
  sourceSemesterId: string;         // which semester to copy from
  newSemesterId: string;            // which semester is being planned
  source: 'archive' | 'cds' | 'auto';  // 'auto' tries CDS folder first, falls back to archive
}
```

**Output:** `next-plan/` folder populated with brief stubs; `plan-config.json` written.

**Behavior:**
- `archive`: reads from the ingested Canvas archive (`topic-map.json` + raw assignment content)
- `cds`: reads from a CDS `course/` folder if one exists for the source semester
- `auto`: checks for a CDS folder first; uses archive if not found
- All assignment content copied as-is into `next-plan/week-XX/` files with CI front matter prepended

---

### `fetch_academic_calendar`

Parses an institution's academic calendar page or accepts manual date inputs. Saves `calendar.json` to the plan.

**Input:** At least one of:
```ts
{
  courseId: string;
  semesterId: string;
  url?: string;                     // institution registrar page URL
  startDate?: string;               // ISO date, e.g. "2026-08-24"
  endDate?: string;
  breaks?: Array<{ name: string; start: string; end: string }>;
  semesterPattern?: string;         // e.g. "Fall2026" — uses US academic calendar conventions
}
```

**URL parsing:** Institution-agnostic. Scans for common vocabulary:
- Start markers: "Classes Begin", "First Day of Classes", "Instruction Begins"
- End markers: "Last Day of Classes", "End of Instruction", "Dead Week begins"
- Finals: "Final Examinations", "Finals Week"
- Breaks: "Spring Break", "Thanksgiving", "Fall Break", "Winter Break", holiday names

Returns what it can extract; marks `"partial": true` and lists `"missing"` fields if the page structure is not recognized. Professor can fill gaps with manual overrides.

**`semesterPattern` fallback:** Uses common US academic semester conventions as defaults (Spring ≈ mid-January to early May, Fall ≈ late August to mid-December). Not institution-specific — institutions with unusual calendars should use `url` or manual dates.

**Output (`calendar.json`):**
```json
{
  "semesterId": "Fall2026",
  "classesBegin": "2026-08-24",
  "classesEnd": "2026-12-11",
  "deadWeek": { "start": "2026-12-07", "end": "2026-12-11" },
  "finals": { "start": "2026-12-14", "end": "2026-12-18" },
  "breaks": [
    { "name": "Labor Day", "start": "2026-09-07", "end": "2026-09-07" },
    { "name": "Thanksgiving Break", "start": "2026-11-23", "end": "2026-11-27" }
  ],
  "source": "url",
  "partial": false
}
```

---

### `shift_dates`

Applies the calendar to all assignment `due:` fields in `next-plan/`. Handles multi-section courses.

**Input:**
```ts
{
  courseId: string;
  semesterId: string;
  onBreakCollision: 'bump-before' | 'bump-after' | 'flag';  // default: 'flag'
  sections?: Array<{
    sectionId: string;
    calendarOverrides?: Partial<SemesterCalendar>;  // per-section start/end/breaks
  }>;
}
```

**Behavior:**
- Calculates day-of-week offsets from the source semester start date
- Applies proportionally to the new semester's calendar
- Assignments landing on a break day: bumped before, bumped after, or flagged (based on `onBreakCollision`)
- Multi-section: each section's dates are computed independently using its calendar overrides; stored as `due_sections: { "01": "2026-09-10", "02": "2026-09-11" }` in front matter

---

### `generate_recommended_outline`

Produces a week-by-week module outline for the new semester, informed by the diff and verdict data.

**Input:**
```ts
{
  courseId: string;
  semesterId: string;   // the new semester being planned (next-plan/ must exist)
}
```

**Behavior:**
- Reads diff and verdict data from v0.6 analysis (`diff-vs-*.json`, `currency-report.json`). If verdict data is not present for the source semester, the outline is generated from the diff alone (module adds/removes) with a warning that `recommend_for_topic` should be run first for richer output.
- Maps `ADD` verdicts → suggested new week slots
- Maps `DROP` verdicts → modules removed or flagged
- Maps `UPDATE` verdicts → modules retained with update note
- Maps `KEEP` verdicts → modules carried forward unchanged
- Writes `next-plan/plan-outline.md` — human-readable week table with verdict annotations

**Output (`plan-outline.md` excerpt):**
```markdown
| Week | Module | Topics | Verdict | Notes |
|------|--------|--------|---------|-------|
| 01   | Introductions | Course overview, policies | KEEP | — |
| 07   | Gamification | Incentive design, AI nudges | UPDATE | newsHits=3, new agent-based cases available |
| 12   | Stack Overflow case study | AI and developer tools | DROP | 0 news hits, semestersSince=6 |
```

---

### `draft_assignment_brief`

Drafts an updated assignment brief for one assignment using the LLM, informed by the verdict and previous content.

**Input:**
```ts
{
  courseId: string;
  semesterId: string;
  assignmentId: string;
  includeDetails?: boolean;  // include full verdict details in LLM context (default: false)
}
```

**Behavior:**
- Reads previous brief content + verdict + currency class + news hits from plan
- Calls `LlmClient.complete()` with structured prompt
- Sets `replacement_recommended: true` if verdict is `DROP` or `semestersSince >= 6`
- When `replacement_recommended`, brief includes a note: "This assignment has not been meaningfully updated in 3+ years — consider replacing it with a new concept rather than editing further."
- Writes updated brief to `next-plan/week-XX/<assignment>.md`

---

### `update_examples`

Refreshes stale references in a brief. Two-pass: mechanical first, optional LLM second.

**Input:**
```ts
{
  courseId: string;
  semesterId: string;
  assignmentId: string;
  llmPass?: boolean;          // default: false
}
```

**Pass 1 — mechanical (always runs):**
- Replace 4-digit year references older than current year
- Replace known outdated AI tool names (configurable list; defaults include common model version patterns)
- Replace statistics with explicit year anchors (e.g., "In 2023, 40% of...")
- Returns list of substitutions made

**Pass 2 — LLM (optional, `llmPass: true`):**
- Claude reads the full brief and identifies any claim, example, or case study that references something that has evolved since the brief was written
- Returns proposed rewrites for each flagged section in the tool response (not auto-written to disk — professor reviews in conversation, then asks Claude to apply)
- Sets `staleness: high` and `replacement_recommended: true` if the brief is fundamentally dated (more than surface references need changing)

---

### `export_course_folder`

Translates the approved `next-plan/` into a CDS-compatible `course/` folder.

**Input:**
```ts
{
  courseId: string;
  semesterId: string;
  outputPath?: string;   // default: courses/<courseId>/export/<semesterId>/
}
```

**Behavior:**
- Reads all files in `next-plan/`
- Strips CI-specific front matter fields (`verdict`, `currency`, `lastTaught`, `semestersSince`, `newsHits`, `staleness`, `replacement_recommended`)
- Writes CDS-format `course-config.md` + `week-XX/<type>.md` files
- Multi-section: produces one `course/` folder per section (`output/<semesterId>-<sectionId>/`); content files are copied (same content, section-specific `due:` dates applied)
- Returns `{ outputPaths: string[], sectionCount: number }`

**CDS format compatibility:** Output matches the folder structure Canvas Design Studio's `import_course` and `generate_week` tools expect. CI front matter is replaced with CDS front matter.

---

## 4. `next-plan/` folder structure

```
semesters/<newSemesterId>/
└── next-plan/
    ├── plan-config.json       ← source, target, sections, status
    ├── calendar.json          ← written by fetch_academic_calendar
    ├── plan-outline.md        ← written by generate_recommended_outline
    ├── week-01/
    │   ├── assignment.md
    │   └── engage-assignment.md
    ├── week-02/
    │   └── ...
    └── ...
```

**Brief file front matter:**
```yaml
---
title: "Gamification and Incentivizing AI - Part 1"
week: 7
type: assignment
points: 20
due: TBD                        # set by shift_dates
due_sections:                   # multi-section only
  "01": "2026-10-11"
  "02": "2026-10-12"
verdict: UPDATE
currency: current
lastTaught: Spring2025
semestersSince: 1
newsHits: 3
staleness: moderate
replacement_recommended: false
---
```

**`plan-config.json`:**
```json
{
  "courseId": "ITM370",
  "sourceSemesterId": "Spring2026",
  "targetSemesterId": "Fall2026",
  "source": "archive",
  "sections": ["01"],
  "status": "draft",
  "toolsRun": ["import_previous_shell", "fetch_academic_calendar", "shift_dates"]
}
```

---

## 5. Multi-section support

Courses with multiple sections (e.g., `ITM105`) share content but have independent date tracks.

- `shift_dates` `sections` array provides per-section calendar overrides (different start dates, meeting patterns, break dates)
- Brief front matter stores `due_sections: { "01": "...", "02": "..." }` when sections differ
- `export_course_folder` produces one `course/` folder per section, each with section-specific `due:` dates
- Single-section courses (e.g., `ITM370`) are unaffected — the `sections` array is omitted and behavior is identical to v0.6

---

## 6. Academic calendar generics

`fetch_academic_calendar` is institution-agnostic by design:

- URL parser looks for common vocabulary patterns, not page structure assumptions
- `semesterPattern` inference uses US academic calendar conventions as a baseline only
- All parsed results include a `source` field (`"url"`, `"manual"`, `"pattern"`)
- `"partial": true` is returned when the URL parser could not extract all fields — professor fills gaps manually
- Institutions with non-standard calendars (quarter system, trimesters, international) use manual dates

---

## 7. Testing strategy

All tests are fixture-based. No network calls in the test suite.

| Test file | What it covers |
|-----------|---------------|
| `tests/tools/import_previous_shell.test.ts` | Archive fixture → `next-plan/` skeleton; CDS folder fixture → same result; `auto` source selection |
| `tests/tools/fetch_academic_calendar.test.ts` | HTML fixture → correct `calendar.json`; unknown page → `partial: true` + `missing` list; manual dates; `semesterPattern` |
| `tests/tools/shift_dates.test.ts` | Known source dates + calendar → correct target dates; break-collision (bump-before, bump-after, flag); multi-section per-section offsets |
| `tests/tools/generate_recommended_outline.test.ts` | Diff + verdict fixture → outline reflects ADD/DROP/UPDATE/KEEP correctly |
| `tests/tools/draft_assignment_brief.test.ts` | Injected mock `LlmClient`; `replacement_recommended` fires on DROP verdict and `semestersSince >= 6` |
| `tests/tools/update_examples.test.ts` | Year refs replaced; tool name refs replaced; stale pattern triggers flag; LLM pass uses injected mock |
| `tests/tools/export_course_folder.test.ts` | `next-plan/` fixture → CDS-format output; CI fields stripped; multi-section produces one folder per section |

**Smoke test extension:** `scripts/smoke-real-archive.ts` extended to run the full v1.0 pipeline against real ITM 370 data, printing the generated outline and first two brief drafts.

---

## 8. Out of scope for v1.0

Deferred to later milestones:

- Second-brain `TopicSource` adapter (waits for that app to exist)
- `OllamaAdapter` for local LLMs (waits until A/B testing against Anthropic is needed)
- Model routing harness across Gemini / Claude / Grok / local
- Canvas API direct publish from CI (CDS owns that layer)

---

## 9. Types

The following types are added to `src/types/index.ts`:

```ts
interface SemesterCalendar {
  semesterId: string;
  classesBegin: string;       // ISO date
  classesEnd: string;
  deadWeek?: { start: string; end: string };
  finals?: { start: string; end: string };
  breaks: Array<{ name: string; start: string; end: string }>;
  source: 'url' | 'manual' | 'pattern';
  partial: boolean;
  missing?: string[];         // field names not found when partial: true
}

interface SectionCalendarOverride {
  sectionId: string;
  calendarOverrides?: Partial<SemesterCalendar>;
}

interface PlanConfig {
  courseId: string;
  sourceSemesterId: string;
  targetSemesterId: string;
  source: 'archive' | 'cds' | 'auto';
  sections: string[];
  status: 'draft' | 'approved';
  toolsRun: string[];
}
```

---

## 10. Open items resolved from v0.6 spec

| v0.6 open item | Resolution |
|----------------|------------|
| Does Canvas Design Studio expose a reusable archive parser? | No — CDS has `import-course.ts` but it is internal to CDS. CI reads archives independently via its own parsers. |
| Exact shape of `course/` folder CDS expects | Confirmed: `course-config.md` + `week-XX/<type>.md` files with YAML front matter. `export_course_folder` writes this format exactly. |
| Canonical course-id format | Resolved in v0.6: short alphanumeric (`ITM370`, `ITM105-01`). No change. |
