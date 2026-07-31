# PeerAssessment.com Export Module (`module-peerassessment`) — Design

**Date:** 2026-06-14
**Status:** Approved (design)
**Author:** Kevin Rank (brainstormed with Claude)

## Goal

Turn the Canvas groups for a course into a PeerAssessment.com **student/group import CSV**, so the instructor no longer has to assemble that file by hand. This is the outbound half of a PeerAssessment.com workflow only — "adding students." Importing peer-assessment scores back into the Canvas gradebook is **out of scope** (see Non-Goals).

## Context

This is the last item in the canvas-toolchain "module wave," following `module-oral-assessment`, `module-group-builder`, and `module-roster`. It slots onto the end of the existing term pipeline:

```
PeopleSoft export → module-roster (vault + de-identified roster CSV)
                  → module-group-builder (groups, optionally pushed to Canvas)
                  → module-peerassessment (PeerAssessment.com import CSV)   ← this module
```

By the time the instructor builds groups, the roster vault is populated and the PeopleSoft export is on hand, so this module can rely on both.

### FERPA posture

PeerAssessment.com is **email-based**: it emails each student an assessment link, so the import file necessarily contains real PII (email, name, login, student ID). The institution holds a contract with PeerAssessment.com, satisfying FERPA's "school official" exception, so instructor-upload is legitimate. The module is therefore **not** held to the toolchain's PII-free pseudonym model for this external tool — email/name/IDs are the required round-trip keys. PII is used **transiently** at build time and **never written to the vault**; the only at-rest artifact is the import CSV the instructor uploads. The tool emits a one-line FERPA courtesy note in its report. No DPA gate is enforced (the contract already exists).

## The data contract

PeerAssessment.com's import CSV header (exact, instructor-confirmed):

```
Team,Login ID,Email,First Name,Last Name,Student ID #
```

One row per student. `Team` is the Canvas group name the student belongs to.

## Architecture — inputs & data flow

For each student the module must answer two questions: **which team**, and **what are the five identity fields**.

| Column        | Primary source                  | Fallback source                          |
|---------------|---------------------------------|------------------------------------------|
| Team          | Canvas group name (live)        | —                                        |
| Email         | Canvas user `email` (live)      | PeopleSoft `email`                       |
| First Name    | Canvas `sortable_name` split    | PeopleSoft `name` split                  |
| Last Name     | Canvas `sortable_name` split    | PeopleSoft `name` split                  |
| Login ID      | Canvas `login_id` (live)        | PeopleSoft `userId`                      |
| Student ID #  | Canvas `sis_user_id` (live)     | PeopleSoft `studentNumber` (via vault)   |

**Why the fallback exists:** a teacher-scoped Canvas token frequently returns `login_id` and `sis_user_id` as empty (the same limitation `module-roster` already warns about). When Canvas withholds either ID, the module fills it from the PeopleSoft export, bridged through the roster **vault** (`canvas_id ↔ student_number`). When Canvas supplies everything, the PeopleSoft export is not consulted.

### Inputs

- **Required:** `courseId` and `groupSetName` — the Canvas course and the group-set (category) to read. The module reads each group and its members (canvas_ids) live from Canvas.
- **Optional:** `peopleSoftFile` — path to the PeopleSoft export, consulted only to fill Login ID / Student ID# (and, defensively, email/name) when Canvas withholds them. If omitted and Canvas withholds an ID, that student is reported as incomplete.
- **Optional:** `outputDir` — defaults under `CC_HOME` (`~/.command-and-control/peerassessment/`).
- **Optional:** `dryRun` — when true, produce the report only, write no file.

### Output

- A CSV at `<outputDir>/peerassessment-import-<courseId>-<groupSetName>.csv` with the exact 6-column header above, RFC-4180 escaped, one row per grouped student.
- A **pre-upload report** (returned from the tool, and the sole output when `dryRun`).

## Components (file structure)

```
packages/module-peerassessment/src/
  types.ts          # PeerAssessmentRow, BuildInput, BuildReport, CanvasGroupMember, etc.
  paths.ts          # ccHome()/outputDir resolution (honors CC_HOME), mirrors roster/paths.ts
  canvas/groups.ts  # PaCanvasClient: read a group set + members + per-user fields, live
  source/peoplesoft.ts # load + index the PeopleSoft export as an ID/PII backstop (reuses roster parse)
  source/vault.ts   # read-only bridge: canvas_id -> student_number via the roster vault
  join/resolve.ts   # assemble each row: Canvas-first, PeopleSoft+vault fallback; split names
  report.ts         # validation: missing required fields, ungrouped students, duplicate emails
  output.ts         # renderImportCsv(rows) / writeImportCsv(path, rows) — RFC 4180
  build.ts          # orchestrator: read groups -> resolve rows -> validate -> (write) -> report
  tools.ts          # build_peerassessment_import MCP tool (ModuleTool)
  index.ts          # default export: { id: 'peerassessment', name: ..., tools }
```

Each unit has one responsibility and a clear interface; the Canvas reader and the PeopleSoft/vault sources are injected so `build.ts` is testable without network or disk.

### Tool surface

One `ModuleTool`: **`build_peerassessment_import`**.

- **Input:** `{ courseId: string, groupSetName: string, peopleSoftFile?: string, outputDir?: string, dryRun?: boolean }`
- **Behavior:** reads the named Canvas group set live; resolves every member's six fields (Canvas-first, PeopleSoft/vault fallback); validates; unless `dryRun`, writes the CSV; returns the report.
- **Why one tool, no propose→commit:** the only artifact is a local CSV the instructor uploads themselves — it never writes to Canvas or the vault — so the heavyweight propose/commit split (which `module-roster` needs because it persists identity state) is unwarranted here. `dryRun` covers the "preview before writing" need.

## Error handling — the pre-upload report

The tool never silently ships a bad file. The report lists:

- **Incomplete students** — in a group but missing a required column after fallback (e.g., no Login ID from either source), listed by name.
- **Ungrouped students** — enrolled in the course but in no group in the named set (they won't appear in the file).
- **Duplicate emails** — PeerAssessment.com keys on email; duplicates are flagged.
- **FERPA note** — one line: PeerAssessment.com is institution-approved; the file contains student PII.

When `dryRun` is false, the report also states the output path and row count written. A build that produces zero valid rows writes no file and says so.

## Name splitting

Canvas `sortable_name` is `"Last, First"` — split on the first comma into Last/First. The PeopleSoft `name` fallback reuses `module-roster`'s existing name-normalization (which already handles `"Last, First"` reordering). A name with no comma is treated as a single token in Last Name with First Name blank, and flagged in the report as needing review.

## Testing

Hermetic, no network or live disk dependency:

- The Canvas reader (`PaCanvasClient`) and the PeopleSoft/vault sources are **injected** into `build.ts` (same DI pattern as `module-roster`/`module-group-builder`).
- Tests feed fixture group sets + fixture PeopleSoft rows and assert: the exact 6-column CSV bytes (header + escaping), correct Canvas-first/PeopleSoft-fallback selection per field, and the report contents (incomplete, ungrouped, duplicate-email cases).
- CSV escaping covered for commas, quotes, and newlines in names.
- Registry test: `module-peerassessment` appears in C&C `KNOWN_MODULES`.

## Non-Goals

- **No score/grade import.** Turning PeerAssessment.com's exported results into Canvas grades is explicitly out of scope; it is low-value to automate (spreadsheet work an instructor or an ad-hoc AI session can finish) and would require new Canvas grade-write capability the toolchain deliberately does not yet have.
- **No LTI / no live PeerAssessment.com API.** File-based round-trip only; this module produces an upload file.
- **No vault writes.** This module is a pure consumer of identity data; it never mutates the roster vault.
- **No new at-rest PII store.** PII is transient at build time; only the import CSV persists.

## Open questions

None blocking. If a future term shows Canvas reliably returns `login_id`/`sis_user_id` for the instructor's token, the PeopleSoft fallback becomes dead weight but harmless (it is only consulted on missing fields).
