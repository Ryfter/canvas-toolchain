# Architecture Review Follow-ups

This file records follow-up items accepted from the Gemini / Antigravity architecture review.

Reviewed inputs:

- `D:\Dev\Command-and-Control-MCP\Gemini-Results.md`
- `C:\Users\krank\.gemini\antigravity\brain\5b3b88c7-2bf2-45ee-b576-9fbff068c9cd\architectural_review.md`

The two files largely overlap. The external architectural review is more actionable; it adds explicit downloader path registration and a planning sidecar recommendation.

## Current Verdict

The review is directionally sound. None of the findings require undoing the current integration-hardening pass. The right next step is to track these as staged improvements, because the current bridge and file contracts are working and verified.

Keep the current architecture:

- TypeScript for Command & Control, Curriculum Intelligence, and Canvas Design Studio.
- Python for Canvas Backup for now.
- CLI bridge from Command & Control to Canvas Backup.
- Local archive as source of truth.
- Manual Canvas HTML paste as a first-class workflow.

Do not rewrite the stack into Go yet. Use Go later for a professor-friendly installer/launcher if setup friction remains the main adoption blocker.

## Accepted Backlog

| Priority | Item | Decision | Reasoning |
| --- | --- | --- | --- |
| P1 | Self-contained `canvas-backup.exe` | Accept | The CLI bridge is pragmatic, but professors should not have to manage Python or `.venv` paths. Package Canvas Backup with PyInstaller or PyOxidizer before broad professor adoption. |
| P1 | Configurable downloader executable path | Accept | `CANVAS_BACKUP_COMMAND` works for agents and power users, but `setup_cc` should persist a downloader path in `~/.command-and-control/config.json` for repeatable professor setup. |
| P1 | Long-running download progress | **Done** | Canvas Backup emits `{"type":"progress","message":"..."}` + `{"type":"complete",...}` JSON lines. C&C's bridge uses `spawn` to stream those lines and forwards each as `notifications/progress` when the MCP client provides a `progressToken`. |
| P2 | Non-destructive planning metadata | Accept with design work | `export_course_folder` strips CI fields today. That keeps Design Studio clean, but weakens roundtripping. Design a namespaced `ci:` block or `planning-manifest.json` sidecar before changing the exporter. |
| P2 | Live web search for currency scanning | Accept | Fresh topics need current web context. Prefer a dedicated search adapter or MCP search tool feeding snippets into `scan_recent_developments`; do not make web search required for offline/basic workflows. |
| P2 | Semantic currency scoring | Accept | `newsHits >= 3` is useful but too mechanical. Add a two-stage scoring path: collect candidate hits, then use a fast LLM/local model to judge relevance. Keep deterministic scoring as a fallback. |
| P3 | Evergreen course topic list | Accept | Let course config declare core topics that should not be over-penalized for low news volume. Useful for foundational course material. |
| P3 | Go launcher/installer | Accept later | Good long-term fit for one-click setup. Not a reason to rewrite tested domain logic now. |

## Additional Items from Claude Code Review

Identified during the gap-cleanup pass after Codex's initial triage.

| Priority | Item | Decision | Reasoning |
| --- | --- | --- | --- |
| P1 | `downloader.executablePath` in `CcConfig` + `setup_cc` | **Done** | The env-var-only approach doesn't survive shell restarts for professors. Persisted via `setup_cc({ downloaderPath: '...' })` so professors configure it once. |
| P1 | Replace raw stdout/stderr in `DownloadCanvasArchiveResult` with `logPath` | **Done** | Canvas Backup stdout can contain Canvas API tokens and student data. Writing to a temp log file keeps that out of LLM context. |
| P1 | Document `archivePathFromStdout` as format-coupled | **Done** | The regex `Archived(?: course)? .+ to (.+)$` is tied to Canvas Backup's current CLI wording. Scoped the `--json-progress` spec to include a structured final summary line with the archive path so this parser can be replaced. |
| P2 | Canvas Backup deep import paths verified | **Done** | `canvas-design-mcp/dist/tools/import-course.js` and `generate-course.js` confirmed correct. No `exports` map so deep imports work; Design Studio must be built (`npm run build`) before C&C can import it. Document in build order. |
| P2 | PyPI publish as precursor to PyInstaller | Accept | Before bundling with PyInstaller, publish `canvas-backup` to PyPI with a proper entry point. Professors can then install with `pip install canvas-backup` and the bridge resolves `canvas-backup` on PATH without needing `.venv` or an explicit path. PyInstaller is the right long-term answer but PyPI is lower overhead while the tool is still changing. |

## Deferred or Not Accepted Yet

| Item | Status | Reasoning |
| --- | --- | --- |
| Full Go rewrite | Not accepted | Rewriting tested TypeScript/Python logic would slow delivery and increase regression risk. |
| Course-wide publish in one command | Deferred | Needs a reviewed transaction model. Live Canvas publishing can touch student-facing content and should remain explicit page by page until safeguards exist. |
| Replacing repo docs with memory only | Not accepted | Agent memory can help, but durable reasoning must remain in repo markdown so Claude, Codex, Gemini, and humans share the same source of truth. |

## Proposed Implementation Order

1. Add `downloader.executablePath` to C&C config and `setup_cc`.
2. Add a Canvas Backup packaging experiment with PyInstaller or PyOxidizer.
3. Add `--json-progress` or `--progress-jsonl` to Canvas Backup.
4. Update C&C downloader bridge to parse progress incrementally.
5. Migrate C&C tool registration to the higher-level SDK `registerTool` API where progress context is easier to access.
6. Design `ci:` front matter namespace versus `planning-manifest.json` sidecar.
7. Add live search adapter for `scan_recent_developments`.
8. Add semantic currency review as an optional fast LLM pass.
9. Explore a Go launcher/installer after the above reduces product uncertainty.

## Progress Implementation Note

The current MCP TypeScript SDK supports progress notifications from tool handlers through `ctx.mcpReq.notify()` with method `notifications/progress`, using a client-provided `ctx.mcpReq._meta.progressToken`. Progress values must increase. Clients can reset their timeout on progress. This makes the review's progress recommendation technically feasible, but C&C may need a tool-registration refactor because it currently uses lower-level request handlers.

## Documentation Impact

Keep these files aligned when implementing any accepted item:

- `CLAUDE.md`
- `AGENTS.md`
- `docs/integration-contracts.md`
- `docs/architecture-review-followups.md`
- `D:\Dev\Canvas-Download\docs\project-design.md`
- `D:\Dev\Curriculum-Intelligence\DECISIONS.md`
