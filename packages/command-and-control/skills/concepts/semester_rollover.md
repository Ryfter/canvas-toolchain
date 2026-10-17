---
id: "semester_rollover"
description: "Rolling a course into a new semester: archive and ingest the old term, analyze it, copy the shell, move every due date onto the new calendar, then rebuild."
related: [analyze_course, download_canvas_archive, fetch_academic_calendar, full_pipeline, generate_recommended_outline, import_previous_shell, ingest_canvas_archive, plan_next_semester, shift_dates, update_course_materials]
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
3. [[analyze_course]] — ingest the archive into `topic-map.json`, then score each
   assignment's currency and emit `KEEP | UPDATE | DROP | ADD` verdicts, appending
   a trajectory entry. It ingests the archive itself, so [[ingest_canvas_archive]]
   is not a separate step, and it auto-registers the course — which a bare
   `ingest_canvas_archive` requires.
4. [[import_previous_shell]] — copy the source term into `next-plan/`, one brief
   per week under `next-plan/week-NN/`.
5. [[fetch_academic_calendar]] — write `next-plan/calendar.json` for the new
   term.
6. [[shift_dates]] — rewrite every brief's `due` from the new calendar.
7. [[generate_recommended_outline]] — write `next-plan/plan-outline.md`.
8. [[update_course_materials]] — render the updated materials and hand off to
   [[export_course_folder]].

[[plan_next_semester]] bundles steps 4 → 5 → 6 → 7 in exactly that order and
returns all their results; [[full_pipeline]] runs analyze → plan → materials end
to end. The first is a thin wrapper over those steps, the second is not — its
analyze phase is C&C's `analyze_course`, which auto-registers the course and can
add news-feed, web-search, and transcript augmentations.

## Safety rules

- **The token never lands in the backup config.** The generated TOML sets
  `token_env = "CANVAS_TOKEN"` and [[download_canvas_archive]] injects the token
  into the child process environment at spawn time, so the credential stays in
  `canvas-config.json` only. The file is written with mode `0o600`.
- **The semester is required and never guessed.** `setup_canvas_backup` refuses
  with `SEMESTER_REQUIRED` without a `semester`, and validates `downloadWorkers`
  to 1–32. The generated TOML keys are `archive.semester` and
  `archive.download_workers`.
- **The date shift is recomputed, never accumulated.** `shift_dates` reads
  `originalDue`, computes the offset from the *source* term's start, and applies
  it to the new term's `classesBegin`. Running it twice gives the same dates, and
  a brief with no `originalDue` is skipped entirely rather than guessed at.
- **Break collisions are explicit — on the single-date path.**
  `onBreakCollision` is `flag` (default; leaves the date and sets
  `break_collision`), `bump-after`, or `bump-before`. With `sections`, each gets
  its own `due_sections` map and optional calendar overrides, `due` is the first
  section's value, and the collision result is discarded — so `break_collision` is
  never set.
- **Prerequisites throw instead of silently degrading.** `shift_dates` needs the
  calendar and the plan config; either one missing is an error naming the
  operation to run first.
- **The source of truth is the archive.** There is no `previous/` directory, so
  the source is the ingested topic map for that semester. A Canvas Design Studio
  course folder is used only when `cdsPath` is also supplied — and `cdsPath` is not
  in the MCP schemas, so `source: 'cds'` falls back to the archive.

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

- `packages/command-and-control/src/tools/workflows/{analyze_course,plan_next_semester}.ts`
  — the C&C analyze wrapper (auto-registration, augmentations) and the four-step
  plan order with the `manualDates` forwarding.
- `packages/curriculum-intelligence/src/tools/analyze_course.ts` — the ingest
  step it runs before scoring.
- `packages/curriculum-intelligence/src/tools/fetch_academic_calendar.ts` — the
  accepted inputs and `next-plan/calendar.json`.
- `packages/curriculum-intelligence/src/tools/import_previous_shell.ts` — brief
  layout, CI front matter, `due: TBD` + `originalDue`, plan-config write,
  `cdsPath` requirement.
- `packages/curriculum-intelligence/src/tools/shift_dates.ts` — recomputation
  from `originalDue`, break-collision modes, multi-section handling.
- `packages/curriculum-intelligence/src/tools/generate_recommended_outline.ts` —
  deterministic outline, `plan-outline.md`, the missing-currency-report warning.
- `packages/curriculum-intelligence/src/tools/ingest_canvas_archive.ts` and
  `src/kb/{course_state,trajectory,next_plan}.ts` — topic-map and `history.jsonl`
  locations, `next-plan/` paths.
- `packages/command-and-control/src/passthrough/canvas_backup_config.ts` and
  `passthrough/downloader_tools.ts` — the generated TOML, `token_env`, the
  required keys, and the `CANVAS_TOKEN` env injection.
- `packages/command-and-control/src/tools/workflows/{full_pipeline,update_course_materials}.ts`
  — the bundled end-to-end sequence.
