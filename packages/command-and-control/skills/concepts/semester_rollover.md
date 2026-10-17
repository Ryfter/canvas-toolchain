---
id: "semester_rollover"
description: "Rolling a course into a new semester: archive and ingest the old term, analyze it, copy the shell, move every due date onto the new calendar, then rebuild."
related: [analyze_course, download_canvas_archive, export_course_folder, fetch_academic_calendar, full_pipeline, generate_recommended_outline, import_previous_shell, ingest_canvas_archive, plan_next_semester, setup_canvas_backup, shift_dates, update_course_materials]
---

# Semester rollover

Between terms the course has to move forward in time without losing its
structure: last term's assignments become this term's briefs, and every due date
has to land on the right day of a different calendar. The toolchain splits that
into two phases with a hard boundary between them — **copy the content, then move
the dates** — and keeps an immutable `originalDue` on every brief so the date
shift is a pure function of the source, not a running total.

## The order that works

1. [[setup_canvas_backup]] — once per term. Writes
   `~/.command-and-control/canvas-backup.generated.toml`.
2. [[download_canvas_archive]] — archive last term's shell. This is the local
   source of truth.
3. [[ingest_canvas_archive]] — read the archive's manifests and write
   `topic-map.json` for that semester.
4. [[analyze_course]] — score each assignment's currency and emit
   `KEEP | UPDATE | DROP | ADD` verdicts, appending a trajectory entry.
5. [[import_previous_shell]] — copy the source term into `next-plan/`, one brief
   per week under `next-plan/week-NN/`.
6. [[fetch_academic_calendar]] — write `next-plan/calendar.json` for the new
   term.
7. [[shift_dates]] — rewrite every brief's `due` from the new calendar.
8. [[generate_recommended_outline]] — write `next-plan/plan-outline.md`.
9. [[update_course_materials]] — render the updated materials and hand off to
   [[export_course_folder]].

Two operations bundle the sequence rather than replacing it:
[[plan_next_semester]] runs steps 5 → 6 → 7 → 8 in exactly that order and returns
all four results, and [[full_pipeline]] runs analyze → plan → materials end to
end. Both are conveniences over the same steps; neither adds behavior.

## Safety rules

- **The token never lands in the backup config.** The generated TOML sets
  `token_env = "CANVAS_TOKEN"` and [[download_canvas_archive]] injects the token
  into the child process environment at spawn time, so the credential stays in
  `canvas-config.json` only. The file is written with mode `0o600`.
- **`archive.semester` is required and never guessed.** The generator refuses with
  `SEMESTER_REQUIRED`; `download_workers` is validated to 1–32.
- **The date shift is recomputed, never accumulated.** `shift_dates` reads
  `originalDue`, computes the offset from the *source* term's start, and applies
  it to the new term's `classesBegin`. Running it twice gives the same dates, and
  a brief with no `originalDue` is skipped entirely rather than guessed at.
- **Break collisions are explicit.** `onBreakCollision` is `flag` (default;
  leaves the date and sets `break_collision`), `bump-after`, or `bump-before`.
  With multiple `sections`, each gets its own `due_sections` map and optional
  calendar overrides, and `due` is the first section's value.
- **Prerequisites throw instead of silently degrading.** `shift_dates` needs the
  calendar and the plan config; either one missing is an error naming the
  operation to run first.
- **The source of truth is the archive.** There is no `previous/` directory: the
  source is either the ingested topic map for that semester, or a Canvas Design
  Studio course folder when you pass `source: 'cds'` (or `auto` with a `cdsPath`).

## Pitfalls

- **Re-running `import_previous_shell` overwrites the briefs.** It writes
  `next-plan/week-NN/<slug>.md` unconditionally, so hand edits made in that folder
  are lost on a re-run. Do the import and date shift first, then edit.
- **The calendar has no default.** `fetch_academic_calendar` needs a registrar
  `url`, or `startDate`/`endDate`, or a `semesterPattern`; without one it throws.
  It is also an *advanced* operation with no intent action of its own, despite
  being mandatory inside `plan_next_semester`.
- **`manualDates` on `plan_next_semester` goes nowhere.**
  `plan_next_semester` spreads a `manualDates` argument into
  `fetch_academic_calendar`, but that tool's input accepts only `url`,
  `startDate`, `endDate`, `breaks`, and `semesterPattern` — so manual dates
  supplied there are dropped. Set the calendar explicitly (or pass
  `startDate`/`endDate`) instead of relying on that argument.
- **Dates move before materials are rebuilt.** `update_course_materials` renders
  from `next-plan/`, so running it before `shift_dates` bakes the wrong dates
  into the generated pages.
- **Verdicts drive the materials pass.** The template chosen per assignment
  comes from the latest trajectory entry (`DROP` assignments are skipped), so
  [[analyze_course]] has to run before [[update_course_materials]].
- **The outline is deterministic and thin without a currency report.** It is
  generated from module structure alone and says so; a missing
  `currency-report.json` in the *source* semester produces that warning.

## Sources

- `packages/command-and-control/src/tools/workflows/plan_next_semester.ts` — the
  exact four-step order and the `manualDates` forwarding.
- `packages/curriculum-intelligence/src/tools/fetch_academic_calendar.ts` — the
  accepted inputs and `next-plan/calendar.json`.
- `packages/curriculum-intelligence/src/tools/import_previous_shell.ts` — brief
  layout, CI front matter, `due: TBD` + `originalDue`, plan-config write.
- `packages/curriculum-intelligence/src/tools/shift_dates.ts` — recomputation
  from `originalDue`, break-collision modes, multi-section handling.
- `packages/curriculum-intelligence/src/tools/generate_recommended_outline.ts` —
  deterministic outline, `plan-outline.md`, the missing-currency-report warning.
- `packages/curriculum-intelligence/src/tools/{ingest_canvas_archive,analyze_course}.ts`
  and `src/kb/{course_state,trajectory,next_plan}.ts` — topic-map and
  `history.jsonl` locations, `next-plan/` paths.
- `packages/command-and-control/src/passthrough/canvas_backup_config.ts` and
  `passthrough/downloader_tools.ts` — the generated TOML, `token_env`, the
  required keys, and the `CANVAS_TOKEN` env injection.
- `packages/command-and-control/src/tools/workflows/{full_pipeline,update_course_materials}.ts`
  — the bundled end-to-end sequence.
