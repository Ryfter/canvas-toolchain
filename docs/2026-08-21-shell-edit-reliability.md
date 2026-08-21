# Shell edit reliability — agent path audit

**Date:** 2026-08-21  
**Scope:** LLM ability to modify Canvas shells via Canvas Toolchain (Conductor overnight lane)  
**Sources:** `TO-WORK-ON/`, `docs/`, `packages/*/`, `BATON.md`, integration contracts, CI/C&C agent handoffs

---

## Primary entrypoint

**Command & Control MCP** (`packages/command-and-control/src/index.ts`, launched via `npx canvas-toolchain` or the native installer) is the single professor-facing entrypoint. There is no separate “shell edit” CLI or skill — agents reach shell editing through MCP tools registered on C&C.

| Intent | Primary tool(s) | Where files land |
| --- | --- | --- |
| Full-semester refresh (dates + outline) | `plan_next_semester` | `~/.curriculum-intelligence/courses/<courseId>/semesters/<newSemesterId>/next-plan/` |
| Stepwise planning | `import_previous_shell` → `fetch_academic_calendar` → `shift_dates` → … | same `next-plan/` tree |
| Archive → editable CDS folder | `import_course` (CDS passthrough) | caller-supplied `outputDir` (often `./course` or `~/.canvas-design-studio/course/<courseId>/`) |
| LLM rewrites briefs | `draft_assignment_brief` / direct markdown edits in `next-plan/` | brief `.md` files under `week-XX/` |
| Hand off to HTML generator | `export_course_folder` → `generate_course` | `~/.curriculum-intelligence/courses/<courseId>/export/<semesterId>/` → `output/` |
| One-shot “update materials + export” | `update_course_materials` | reads `next-plan/`, exports CDS folder, renders HTML |

**Not on C&C (requires Design Studio MCP):** `generate_page`, `validate_canvas_html`, `publish_to_canvas`, `critique_canvas_page`, `redesign_canvas_page`. Agents connected only to C&C must re-run `generate_course` for the whole course or connect a second MCP server for page-scoped iteration.

**Secondary / standalone paths:** Curriculum Intelligence and Canvas Design Studio each expose their own MCP servers for power users; C&C re-exports 26 CI tools and exactly two CDS tools (`import_course`, `generate_course`).

---

## Minimal happy path (agent checklist)

Use this when the goal is “LLM edits shell content and produces paste-ready HTML.”

### Path A — semester plan (`next-plan/`)

Prerequisites: course registered (`setup_course`), prior semester ingested (`ingest_canvas_archive` or existing CDS folder).

1. **`plan_next_semester`** `{ courseId, sourceSemesterId, newSemesterId }`  
   — or manually: `import_previous_shell` → `fetch_academic_calendar` → `shift_dates` → `generate_recommended_outline`
2. **Edit briefs** — either:
   - MCP: `draft_assignment_brief` / `update_examples` per file, **or**
   - Agent filesystem: edit `~/.curriculum-intelligence/courses/<courseId>/semesters/<semesterId>/next-plan/week-XX/*.md` (preserve YAML front matter; use `title` field for human name)
3. **`export_course_folder`** `{ courseId, semesterId, preserveCiMetadata: true }` (optional sidecar; see fix #2)
4. **`generate_course`** `{ courseDir: <export path> }`
5. Paste HTML from `<courseDir>/output/` or continue with `preview_course_publish` → `publish_course`

Verify readiness without guessing paths:

```bash
node scripts/shell-edit-doctor.mjs --courseId ITM370 --semesterId Fall2026
```

### Path B — single assignment hotfix (no CI plan)

1. **`import_course`** `{ archivePath, outputDir, assignmentName }`
2. Edit the generated `.md` under `outputDir`
3. **`generate_course`** `{ courseDir: outputDir }` (whole course) — or connect Design Studio for `generate_page`

### Path C — generate-and-paste only (no credentials)

Skip all `setup_*`. Path B works with local archive + `import_course` → edit → `generate_course`.

---

## Failure modes (ranked by agent pain)

### F1 — Verdict lookup uses slug filename, trajectory uses full assignment title

**Symptom:** `update_course_materials` ignores DROP/UPDATE verdicts; everything renders as KEEP.  
**Cause:** `import_previous_shell` writes `week-01/my-great-assignment.md` (`toSlug(a.name)`), but `analyze_course` stores `perAssignment[].topic` as the raw Canvas title (`packages/curriculum-intelligence/src/tools/analyze_course.ts`). `update_course_materials` keys verdicts by basename without extension (`packages/command-and-control/src/tools/workflows/update_course_materials.ts`).  
**Agent workaround:** None reliable — slug ≠ title for most real assignments.  
**Fix:** see § Fixes #1.

### F2 — Hidden `next-plan/` path; agent edits wrong directory

**Symptom:** Agent writes markdown to `./course/` or repo cwd; tools read empty `next-plan/` or stale semester.  
**Cause:** CI state lives under `CURRICULUM_INTELLIGENCE_HOME` (default `~/.curriculum-intelligence`), not the CDS `course/` tree. Docs describe the folder name but not always the absolute path.  
**Agent workaround:** Run `shell-edit-doctor.mjs` or `get_course_state` before editing.  
**Fix:** see § Fixes #3 (doctor script + agent doc).

### F3 — MCP schema gaps hide required parameters

**Symptom:** Tool calls fail validation or silently use wrong source.

| Tool | Missing / wrong in C&C schema | Actual requirement |
| --- | --- | --- |
| `import_previous_shell` | no `cdsPath` property | needed when `source: "cds"` or `auto` with CDS input (`ci_tools.ts`) |
| `shift_dates` | `onBreakCollision` **required** | `plan_next_semester` defaults to `"flag"`; direct calls fail without it |
| `export_course_folder` | no `preserveCiMetadata` | supported in `export_course_folder.ts` but invisible to MCP clients |
| `import_course` | `outputDir` **required** | CDS accepts it; agents often omit because `generate_course` defaults `courseDir` |

**Fix:** see § Fixes #2.

### F4 — C&C / Design Studio tool split blocks iterate-and-validate loop

**Symptom:** Agent on C&C only regenerates entire course after each markdown tweak; cannot call `validate_canvas_html` or `generate_page`.  
**Cause:** By design (#151 brief) — only two CDS passthroughs on C&C.  
**Agent workaround:** Connect Design Studio MCP alongside C&C, or accept full `generate_course` each time.  
**Fix:** product decision — optional passthrough of `generate_page` + `validate_canvas_html` (not proposed for tonight; doc-only).

### F5 — Prerequisite chain not run

**Symptom:** `shift_dates` throws “No calendar.json”; `import_previous_shell` throws on missing topic map.  
**Cause:** Tools assume prior steps in the v1.0 sequence (`packages/curriculum-intelligence/AGENTS.md`).  
**Agent workaround:** Prefer `plan_next_semester` over ad-hoc tool order; run doctor script.

### F6 — YAML front matter corrupted by direct edits

**Symptom:** `export_course_folder` drops metadata; `generate_course` mis-reads page type / due dates.  
**Cause:** Agents strip `---` fences or invent CI-only fields in CDS `course/` files.  
**Agent workaround:** Edit body only; keep `title`, `week`, `type`, `due` in front matter; use `draft_assignment_brief` for rewrites.

### F7 — Install / publish blockers (not shell logic, but blocks all MCP)

**Symptom:** `npx canvas-toolchain` 404; installer “Module catalog unavailable” on v2.1.0.  
**Cause:** v2.2.0 unreleased (npm org + `NPM_TOKEN`); catalog v2 fix (#152) not in shipped installer (`BATON.md`, `TO-WORK-ON/status-2026-08-14.md`).  
**Fix:** maintainer publish path — not an agent-code fix tonight.

### F8 — Build order: C&C imports CDS/CI from `dist/`

**Symptom:** MCP tool handler throws “Cannot find module … dist/…”.  
**Cause:** Fresh clone without `npm run build`.  
**Agent workaround:** `npm run build` at repo root (root `prepare` should handle this after publish).

---

## Three concrete fixes for tonight

### Fix #1 — Match verdicts by brief `title`, not slug basename

**File:** `packages/command-and-control/src/tools/workflows/update_course_materials.ts`  
**Change:** When resolving `verdictMap.get(...)`, look up by YAML `title` from `parseBriefFile(readFileSync(briefPath))`, falling back to basename slug. Add test in `packages/command-and-control/tests/tools/workflows/update_course_materials.test.ts` with title `"Week 1 Engage"` and filename `week-1-engage.md`.  
**Why tonight:** Restores the core “analyze → plan → update materials” loop without professor intervention.

### Fix #2 — Align C&C MCP schemas with tool implementations

**Files:**

- `packages/command-and-control/src/passthrough/ci_tools.ts` — add `cdsPath` to `import_previous_shell`; add `preserveCiMetadata` to `export_course_folder`; make `onBreakCollision` optional with default `"flag"` on `shift_dates` (mirror `plan_next_semester.ts`).
- `packages/command-and-control/src/passthrough/design_tools.ts` — document default or make `outputDir` optional with resolve-to-`./course` behavior matching CDS.

**Why tonight:** Stops agents from failing tool validation before any shell work happens.

### Fix #3 — Agent path visibility (`scripts/shell-edit-doctor.mjs` + this doc)

**Files:**

- `scripts/shell-edit-doctor.mjs` (added tonight) — prints absolute paths, prerequisite file presence, brief count, and the minimal MCP sequence.
- `docs/2026-08-21-shell-edit-reliability.md` (this file) — link from `BATON.md` / orchestrator output.

**Why tonight:** Zero-risk; eliminates the most common “agent edited the wrong folder” failure without waiting for #151 readiness engine.

---

## What we are not fixing tonight

- Issue #151 setup/readiness engine (Kevin picks A/B/C)
- Passthrough of full Design Studio surface to C&C
- npm publish / installer release (maintainer)
- Verdict slug rename in `import_previous_shell` (Fix #1 is smaller and sufficient)

---

## References

- `BATON.md` — Conductor load brief, priority stack
- `docs/user-guide.md` §6–7 — tool catalog and recipes
- `packages/curriculum-intelligence/AGENTS.md` — v1.0 planning sequence
- `packages/command-and-control/docs/integration-contracts.md` — file contracts
- `docs/superpowers/specs/2026-08-14-setup-readiness-brief.md` — four definitions of “installed”
- `TO-WORK-ON/status-2026-08-14.md` — release/npm blockers
