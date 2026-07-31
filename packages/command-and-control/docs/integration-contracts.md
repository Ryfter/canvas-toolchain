# Command & Control Integration Contracts

Command & Control is the professor-facing coordinator. The domain tools stay independently useful, but the full refresh workflow depends on these file contracts.

## Workflow

```text
Canvas Backup archive
  -> Curriculum Intelligence analysis and next-plan
  -> Canvas Design Studio course folder
  -> Canvas-safe HTML
  -> optional Canvas publishing
```

## App Boundaries

| App | Owns | Does not own |
| --- | --- | --- |
| Canvas Backup (`canvas-backup`) | Canvas API download, local archive, due-date manifests, optional Google Drive mirror | Topic analysis, content rewriting, page design |
| Curriculum Intelligence (`@canvas-toolchain/curriculum-intelligence`) | Archive ingest, semester diff, topic currency, next-semester planning, CDS export | Canvas API download, Canvas-safe HTML rendering |
| Canvas Design Studio (`@canvas-toolchain/canvas-design-studio`) | Importing archive/course folders, Canvas-safe page generation, design review, optional publishing | Semester-level curriculum judgment |
| Command & Control (`@canvas-toolchain/command-and-control`) | One MCP entrypoint, high-level workflow tools, model routing, cross-app status | Replacing the domain apps |

## File Contracts

### Canvas Backup Archive

Required minimum structure:

```text
archive/
  manifests/
    course.json
    modules.json
    pages.json
    assignments.json
  modules/
    01-.../
      items.json
  pages/
    Page Title.html
    Page Title.json
  assignments/
    Assignment Title.html
    Assignment Title.json
```

Curriculum Intelligence reads the archive with `ingest_canvas_archive`.
Canvas Design Studio reads the same archive with `import_course`.

### Curriculum Intelligence State

Default home:

```text
~/.curriculum-intelligence/
  courses/<courseId>/
    semesters/<semesterId>/
      topic-map.json
      next-plan/
```

Command & Control sets `CURRICULUM_INTELLIGENCE_HOME` in tests and smoke scripts so runs are isolated.

### Canvas Design Studio Course Folder

Design Studio expects:

```text
course/
  course-config.md
  week-01/
    overview.md
    assignment.md
  output/
```

`import_course` creates the course folder from a Canvas Backup archive.
`generate_course` renders Canvas-safe HTML into `output/`.

## Current Integration Status

Last verified in the integration-hardening pass:

- C&C tests: `26 passed`
- C&C build: passed
- C&C fixture smoke: passed, producing 10 generated Canvas HTML pages from the ITM370 fixture archive
- Curriculum Intelligence: `141 passed`, build passed
- Canvas Design Studio: `391 passed`, build passed
- Canvas Backup: `20 passed`

Architecture review follow-ups from Gemini/Antigravity are triaged in `docs/architecture-review-followups.md`. That file is the durable backlog for accepted concerns that should not be lost in chat or external tool notes.

Implemented:

- Command & Control imports Curriculum Intelligence as `@canvas-toolchain/curriculum-intelligence`.
- Command & Control imports Canvas Design Studio as `@canvas-toolchain/canvas-design-studio`.
- `import_course` and `generate_course` are real Design Studio pass-through tools.
- `download_canvas_archive` invokes the Python Canvas Backup CLI through a small subprocess bridge.
- `npm run smoke:integration` verifies archive analysis, Design Studio import, and HTML generation against fixtures.

Not implemented yet:

- Bulk Panopto transcript download.
- Course-wide publish as one reviewed transaction.
- A single native installer.
- Self-contained Canvas Backup executable packaging.
- Persisted downloader executable path in `setup_cc`.
- Non-destructive CI planning metadata roundtrip.
- Live web search and semantic scoring for topic currency.

Implemented since integration-hardening:

- JSON-lines download progress bridged to MCP progress notifications. Canvas Backup emits `{"type":"progress","message":"..."}` lines during download and a `{"type":"complete","courseId":"...","archivePath":"..."}` completion event. C&C's `download_canvas_archive` case parses the completion event (replacing the fragile regex) and forwards progress events to the MCP client via `notifications/progress` when a `progressToken` is provided.
- Real `analyze_course` workflow. C&C calls CI's `analyzeCourse` which ingests the archive, diffs against prior semesters (same-season + most-recent), scores currency, generates verdicts, and writes a trajectory entry. C&C then augments the report with RSS news, web search scans (when `BRAVE_SEARCH_API_KEY` is set), and transcript ingestion (when `transcriptsPath` is supplied). The trajectory entry is archive-only and immutable; external signals appear in `result.augmentations` but never modify the trajectory entry.

## Downloader Bridge

`download_canvas_archive` invokes Canvas Backup in this order:

1. `CANVAS_BACKUP_COMMAND`, if set.
2. `CANVAS_BACKUP_REPO` plus its `.venv`, if set.
3. A sibling checkout at `../Canvas-Download` plus its `.venv`.
4. `canvas-backup` on `PATH`.

The local archive remains the source of truth. Google Drive is still only a mirror.

## Go Decision

Do not port the whole stack to Go yet. The official Go MCP SDK can build stdio servers, but the working product logic is already tested in TypeScript and Python. Use Go later for one of two narrower jobs:

- a single installer/launcher binary for professors;
- a future Canvas Backup rewrite if Python packaging becomes the main adoption blocker.

Until then, the lowest-risk path is to harden the current TypeScript MCP coordinator and keep Canvas Backup reachable through the CLI bridge.

This was an implementation decision, not a rejection of Go. The practical test is whether Go reduces professor setup friction more than it increases product risk. Today, a Go wrapper/installer is a better target than a rewrite of the MCP tools.

## Verification

**Build order matters.** `@canvas-toolchain/canvas-design-studio` is a `file:` dependency with no `exports` map. C&C imports directly from `dist/`. Build Design Studio before running C&C tests or build for the first time, or after any Design Studio change:

```powershell
cd D:\Dev\canvas-design-studio; npm run build
cd D:\Dev\canvas-toolchain\packages\command-and-control; npm install
```

Run from `D:\Dev\canvas-toolchain\packages\command-and-control`:

```powershell
npm test
npm run build
npm run smoke:integration
```

Run the domain checks when changing contracts:

```powershell
cd D:\Dev\Curriculum-Intelligence; npm test; npm run build
cd D:\Dev\canvas-design-studio; npm test; npm run build
cd D:\Dev\Canvas-Download; .\.venv\Scripts\python.exe -m pytest
```
