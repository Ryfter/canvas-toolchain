# Local C&C Dashboard (v1 — Course Health) — Design Spec

**Date:** 2026-06-07
**Issue:** [#68](https://github.com/Ryfter/canvas-toolchain/issues/68)
**Scope:** Smallest viable cut of the dashboard idea. One read-only "course health" view served by a local Node HTTP server. Two launch surfaces — new MCP tool `open_dashboard` AND a standalone CLI binary. Course discovery via a configured root directory that's scanned recursively for `course-config.md` files.

---

## Goal

Professors using canvas-toolchain across multiple courses currently have no single place to glance at "how are my courses doing?" — they navigate file trees, check publish timestamps by date, and count transcripts manually. This v1 ships one consolidated read-only view that answers:

- Which courses am I working on?
- When was each last published to Canvas?
- How complete is each (page count, transcript coverage)?

Everything else proposed in #68 (run history, semester stats, vocab/config edits, write actions) is deferred to follow-up issues.

---

## Motivation

- The professor's own words: *"I want it to function first, and be awesome, then we can move to something more."* Explicitly lowest-priority — only opened up because the rest of the v1.x backlog shipped.
- The data already exists on disk; the dashboard surfaces it.
- A working web-server foundation makes future views (run history, semester stats) cheap follow-ups.

---

## Architectural Decisions (ADRs)

### ADR 1 — Read-only "course health" only at v1

**Decision:** Ship exactly one view. No write actions, no edit forms, no auth, no multi-page navigation. Future views (pipeline run history, semester stats, vocab edits) are separate follow-up issues.

**Rationale:** Function first. Write actions touch secrets and require a security-design conversation that doesn't belong in the lowest-priority backlog item.

### ADR 2 — Two launch surfaces (MCP tool + CLI) sharing one core module

**Decision:** `packages/command-and-control/src/dashboard/server.ts` exposes a pure `startDashboardServer({ port?, coursesRoot }): Promise<{ url, stop }>` function. The MCP tool `open_dashboard` calls into it. A new CLI binary `canvas-toolchain-dashboard` also calls into it. Both surfaces share the same code.

**Rejected alternatives:**
- *MCP-only:* leaves the Claude-free workflow unsupported.
- *CLI-only:* breaks the MCP-first muscle memory professors are building.

### ADR 3 — Configured root directory for course discovery (no manifest)

**Decision:** New optional field `coursesRoot: string` in `~/.command-and-control/config.json`, settable via new MCP tool `set_courses_root`. Dashboard walks that directory recursively, treats any folder containing `course-config.md` as a course.

**Rejected:**
- *Explicit per-launch paths:* high friction; faculty have to remember paths.
- *Manifest file:* requires every `setup_course` to remember to register; auto-discovery is more robust.

### ADR 4 — Plain Node HTTP server + server-rendered HTML (no Express, no React)

**Decision:** Use `node:http` directly. Server renders complete HTML pages (no client-side JS framework). Inline CSS in the page, like the rest of the CDS render output.

**Rationale:** Zero new runtime dependencies; pages load instantly; no build step for the UI; consistent with the toolchain's Canvas-safe-style aesthetic; faculty can save the page as a PDF if they want a snapshot.

---

## Architecture

```
C&C (command-and-control)
  src/dashboard/
    server.ts            [NEW — node:http server; single GET / route]
    data.ts              [NEW — walks coursesRoot, builds CourseHealth[] per course]
    views/
      layout.ts          [NEW — shared HTML shell + inline CSS]
      course_health.ts   [NEW — renders the table from CourseHealth[]]
  src/tools/
    set_courses_root.ts  [NEW MCP tool — atomic config write]
    open_dashboard.ts    [NEW MCP tool — starts server, returns URL]
  src/cli/
    dashboard.ts         [NEW — CLI entrypoint; exports nothing, called via bin]
  src/index.ts           [MODIFY — register the two new MCP tools]
  package.json           [MODIFY — add bin entry `canvas-toolchain-dashboard`]
```

**Key invariants:**
- Server is local-only — binds to `127.0.0.1`, never `0.0.0.0`.
- No authentication — relies on the localhost trust boundary.
- Server has zero new runtime dependencies (uses `node:http` + the existing `yaml` package for parsing course-config.md).
- Server lifetime is the parent process lifetime (MCP session for the tool path; explicit shutdown via Ctrl-C for the CLI path).

---

## Data Model

### `CourseHealth`

```ts
export interface CourseHealth {
  /** Display name from course-config.md front matter `title`. */
  name: string;
  /** Short identifier from front matter `short_name`. */
  shortName: string;
  /** Semester label from front matter `semester`. */
  semester: string;
  /** Absolute path to the course folder. */
  courseDir: string;
  /** Count of `*.md` files in the course folder, excluding course-config.md. */
  pageCount: number;
  /** ISO timestamp of last publish (latest mtime in publish-snapshots), or null. */
  lastPublishedAt: string | null;
  /** Transcript coverage: { withTranscript, totalWeeks } across week-* folders. */
  transcriptCoverage: { withTranscript: number; totalWeeks: number };
  /** Computed: 'green' | 'yellow' | 'red' per simple health rules below. */
  health: 'green' | 'yellow' | 'red';
}
```

### Health rules (simple, deterministic)

- **Green**: published in the last 30 days AND transcript coverage ≥ 80%.
- **Yellow**: published in the last 90 days OR transcript coverage ≥ 50%.
- **Red**: anything else (never published, or stale + low coverage).

These rules are intentionally simple. Tunable in a v2 follow-up if the professor objects.

### Discovery

`walkForCourses(coursesRoot): string[]` — recursive walk, skips `node_modules` / `.git` / `dist` / `output` / `publish-snapshots`. Returns absolute paths to every folder containing `course-config.md` (max recursion depth 5 to avoid pathological walks).

### Last-publish lookup

`~/.command-and-control/publish-snapshots/<courseId>/<timestamp>/` is the existing snapshot directory shape (from #64 publish_course). `lastPublishedAt` = the latest folder mtime under the matching course's snapshot dir; `null` if no snapshots exist.

Course-to-snapshot-dir mapping: by `short_name` (so `ITM370` course dir maps to `publish-snapshots/ITM370/`). When `short_name` doesn't match any snapshot dir, `lastPublishedAt = null`.

---

## MCP Tools

### `set_courses_root`

**Input:**
```ts
interface SetCoursesRootInput {
  coursesRoot: string;  // absolute path
}
```

**Output:**
```ts
type SetCoursesRootResult =
  | { ok: true; coursesRoot: string; configPath: string }
  | { ok: false; error: 'PATH_NOT_FOUND' | 'NOT_A_DIRECTORY'; message: string; fix: string[] };
```

**Behavior:**
1. Validate the path exists and is a directory.
2. Read existing `~/.command-and-control/config.json` (if absent, create with `{}`).
3. Merge `coursesRoot: <input>` and atomic-write (tmp + rename).

### `open_dashboard`

**Input:**
```ts
interface OpenDashboardInput {
  port?: number;  // optional fixed port; default = 0 (auto-assign)
}
```

**Output:**
```ts
type OpenDashboardResult =
  | { ok: true; url: string; port: number; coursesRoot: string; courseCount: number }
  | { ok: false; error: 'COURSES_ROOT_NOT_SET' | 'COURSES_ROOT_NOT_FOUND' | 'PORT_IN_USE'; message: string; fix: string[] };
```

**Behavior:**
1. Load config; fail `COURSES_ROOT_NOT_SET` if `coursesRoot` is absent. Fix: "Run set_courses_root first".
2. Fail `COURSES_ROOT_NOT_FOUND` if the configured directory doesn't exist.
3. Start the HTTP server on the requested port (or auto-assign). On EADDRINUSE: fail `PORT_IN_USE`.
4. Return `{ ok: true, url: 'http://127.0.0.1:<port>/', port, coursesRoot, courseCount }` after the server is listening.

The MCP tool does NOT auto-open a browser (it can't reliably across OSes from a node process under an MCP server's environment). The tool result includes the URL; Claude shows it to the user.

---

## CLI

`packages/command-and-control/src/cli/dashboard.ts` — entry point for the bin entry:

```ts
#!/usr/bin/env node
import { startDashboardServer } from '../dashboard/server.js';
import { loadConfig } from '../setup_cc.js';

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.coursesRoot) {
    console.error('coursesRoot is not set. Run set_courses_root via the MCP tool first, or edit ~/.command-and-control/config.json directly.');
    process.exit(1);
  }
  const { url } = await startDashboardServer({ coursesRoot: config.coursesRoot });
  console.log(`Dashboard running at ${url}`);
  console.log('Press Ctrl-C to stop.');
}

main().catch((err) => { console.error(err); process.exit(1); });
```

`package.json` `bin` entry:
```json
"bin": {
  "command-and-control-mcp": "dist/index.js",
  "canvas-toolchain-dashboard": "dist/cli/dashboard.js"
}
```

---

## Rendered HTML

Single-page HTML at `GET /`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Canvas Toolchain — Course Health</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1100px; margin: 2em auto; padding: 0 1em; color: #222; }
    h1 { color: #0033A0; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 1em; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #F4F3EF; }
    .health { display: inline-block; width: 14px; height: 14px; border-radius: 50%; vertical-align: middle; margin-right: 6px; }
    .health-green { background: #3B6D11; }
    .health-yellow { background: #B58606; }
    .health-red { background: #A32D2D; }
    .footer { margin-top: 2em; color: #777; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Course Health</h1>
  <p>Courses discovered under <code>{coursesRoot}</code></p>
  <table>
    <thead>
      <tr><th></th><th>Course</th><th>Semester</th><th>Pages</th><th>Last Published</th><th>Transcripts</th></tr>
    </thead>
    <tbody>
      <!-- one row per CourseHealth -->
    </tbody>
  </table>
  <p class="footer">Refresh the page to update. Generated {timestamp}.</p>
</body>
</html>
```

All metadata HTML-escaped. No JS. No external assets.

Empty state (no courses found under `coursesRoot`): friendly message + the path that was scanned.

---

## Error Handling

| Code | Where | Fix |
|---|---|---|
| `COURSES_ROOT_NOT_SET` | open_dashboard / cli | "Run set_courses_root with a folder path" |
| `COURSES_ROOT_NOT_FOUND` | open_dashboard / cli | "The configured coursesRoot does not exist; re-run set_courses_root" |
| `PATH_NOT_FOUND` | set_courses_root | "The path does not exist; check the value and re-run" |
| `NOT_A_DIRECTORY` | set_courses_root | "The path is not a directory; provide a folder path" |
| `PORT_IN_USE` | open_dashboard / startDashboardServer | "Try a different port, or stop the existing dashboard" |

---

## Testing (~16 new tests)

| File | Tests |
|---|---|
| `tests/dashboard/data.test.ts` | (5) Walks a fixture course tree; builds CourseHealth correctly; handles missing course-config.md; transcript coverage math; health rule classification (green/yellow/red boundaries). |
| `tests/dashboard/server.test.ts` | (3) `GET /` returns 200 + valid HTML; empty state when 0 courses; 404 on any other path. Server starts and stops cleanly. |
| `tests/dashboard/views/course_health.test.ts` | (3) Renders rows for each course; empty-state markup when no courses; HTML-escapes name/semester. |
| `tests/tools/set_courses_root.test.ts` | (3) Happy path writes config; `PATH_NOT_FOUND`; `NOT_A_DIRECTORY`. |
| `tests/tools/open_dashboard.test.ts` | (2) Happy path returns URL + port; `COURSES_ROOT_NOT_SET` when config absent. (Real server start tested via `server.test.ts`.) |

**Total: ~16 new tests.**

### What's intentionally not tested

- The CLI binary's argv handling (it has none in v1).
- Real browser rendering of the page.
- Cross-OS browser auto-open (deferred to v2; v1 returns URL only).

---

## Out of Scope

| Item | Why |
|---|---|
| Pipeline run history view | v2 follow-up issue |
| Semester stats from CI trajectory | v2 follow-up |
| Vocab/config edit forms | Touches secrets; needs security-design conversation |
| Auto-refresh / WebSockets | Manual refresh is fine for v1 |
| Multi-user / auth | Localhost-only — trust boundary covers it |
| Drill-in per course | v2 follow-up |
| Auto-open browser | Cross-OS reliability issue; CLI prints URL, user copies it |
| Theming / dark mode | YAGNI |

---

## Acceptance Criteria

1. `set_courses_root` writes `coursesRoot` to `~/.command-and-control/config.json` atomically.
2. `open_dashboard` starts a server, returns `{ ok: true, url, port, coursesRoot, courseCount }`. The URL is reachable; `GET /` returns the rendered HTML.
3. The HTML table lists every discovered course with name, semester, page count, last-published timestamp (or "never"), transcript coverage, and a green/yellow/red health indicator.
4. Empty state renders cleanly when no courses are discovered.
5. CLI binary `canvas-toolchain-dashboard` (after `npm link` or installed install) starts the same server, prints the URL, runs until Ctrl-C.
6. All ~16 new tests pass; no existing tests regress.
7. Documentation. `packages/command-and-control/CLAUDE.md` documents `set_courses_root`, `open_dashboard`, the CLI binary, and the empty-state behavior.
