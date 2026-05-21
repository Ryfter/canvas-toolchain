# Command & Control MCP — Claude Instructions

Read this before changing the coordinator or asking Claude to continue the cross-app workflow.

## What This Project Does

Command & Control is the single professor-facing MCP entrypoint for the Canvas course refresh toolchain.

```text
Canvas Backup archive
  -> Curriculum Intelligence analysis and planning
  -> Canvas Design Studio course folder
  -> Canvas-safe HTML
  -> optional Canvas publishing
```

The coordinator is not meant to replace the domain tools. Each app stays independently usable:

- `Canvas-Download` / `canvas-backup` owns downloading Canvas data and creating the local archive.
- `Curriculum-Intelligence` / `curriculum-intelligence-mcp` owns analysis, semester comparison, topic currency, and next-semester planning.
- `canvas-design-studio` / `canvas-design-mcp` owns Canvas-safe HTML generation, design review, and optional page publishing.
- `Command-and-Control-MCP` owns the one-entrypoint workflow, status reporting, and model-routing layer.

## Current Integration State

Implemented:

- Curriculum Intelligence is a real local npm dependency: `curriculum-intelligence-mcp`.
- Canvas Design Studio is a real local npm dependency: `canvas-design-mcp`.
- `import_course` and `generate_course` call real Design Studio functions.
- `download_canvas_archive` calls the Python Canvas Backup CLI through a bridge instead of pretending a downloader npm package exists.
- `npm run smoke:integration` verifies the cross-app contract with fixtures: archive analysis, Design Studio import, and HTML generation.
- Local registry foundation for installable templates, themes, prompts, and adapter configs lives in `src/registry/local_registry.ts`.
- `install_resource` installs registry resources from `file://`, `github://`, or `ryfter://` URLs through `src/registry/install_resource.ts`.
- `list_installed_resources` and `uninstall_resource` operate on the local registry index and support bundle cascade metadata.
- `search_registry` searches free GitHub `index.json` registries or the configured premium registry.
- `install_resources_from_lockfile` installs plain-text or JSON URL lockfiles with per-resource status reporting.
- Template resource validation lives in `src/resources/template.ts` with local runtime slot validation in `src/resources/slots.ts`.
- Theme resource validation lives in `src/resources/theme.ts` and enforces prompt-first image metadata.
- Prompt-set validation lives in `src/resources/prompt_set.ts` and enforces slot keys, prompt strings, placeholders, and output schemas.
- Bundle installation support is implemented in `src/registry/install_resource.ts` and records bundle includes for cascade uninstall.
- Brand adapter foundation lives in `src/brand/brand_adapter.ts`; `ManualAdapter` fills and validates professor-provided kits.

Still pending:

- Bulk Panopto transcript download.
- Course-wide publish as one reviewed transaction.
- Pomelli and layout adapter stubs.
- A single native installer.

## Reasoning Behind the Current Shape

Do not port the whole toolchain to Go yet. Go may be useful later for a single installer or for a future Canvas Backup rewrite, but the working product logic is already tested in TypeScript and Python. The lowest-risk path is to harden the TypeScript coordinator and reach Python through a small, explicit CLI bridge.

Do not make Canvas API publishing required. The no-token/manual HTML paste path remains a first-class professor workflow. Direct Canvas publishing is optional convenience.

Keep the local archive as the source of truth. Google Drive is only a mirror.

## Files to Read First

| Need | File |
| --- | --- |
| Cross-app contracts and verification | `docs/integration-contracts.md` |
| Accepted architecture review backlog | `docs/architecture-review-followups.md` |
| Agent handoff and repo layout | `AGENTS.md` |
| Tool registrations | `src/index.ts` |
| Design Studio bridge | `src/passthrough/design_tools.ts` |
| Canvas Backup bridge | `src/passthrough/downloader_tools.ts` |
| Workflow tools | `src/tools/workflows/` |
| Local registry foundation | `src/registry/local_registry.ts` |
| Registry implementation plan | `docs/superpowers/plans/2026-05-21-local-registry.md` |
| Install resource resolver/tool | `src/registry/install_resource.ts`, `docs/superpowers/plans/2026-05-21-install-resource.md` |
| List/uninstall registry tools | `src/registry/local_registry.ts`, `docs/superpowers/plans/2026-05-21-list-uninstall-resources.md` |
| Search registry tool | `src/registry/search_registry.ts`, `docs/superpowers/plans/2026-05-21-search-registry.md` |
| Lockfile install tool | `src/registry/lockfile_install.ts`, `docs/superpowers/plans/2026-05-21-lockfile-install.md` |
| Template validator | `src/resources/template.ts`, `docs/superpowers/plans/2026-05-21-template-validator.md` |
| Theme validator | `src/resources/theme.ts`, `docs/superpowers/plans/2026-05-21-theme-validator.md` |
| Prompt-set validator | `src/resources/prompt_set.ts`, `docs/superpowers/plans/2026-05-21-prompt-set-validator.md` |
| Bundle install | `src/registry/install_resource.ts`, `docs/superpowers/plans/2026-05-21-bundle-install.md` |
| Brand adapters | `src/brand/`, `docs/superpowers/plans/2026-05-21-brand-adapter.md` |

## Verification

Run these before claiming the coordinator is healthy:

```powershell
npm test
npm run build
npm run smoke:integration
```

When changing file contracts between apps, also run:

```powershell
cd D:\Dev\Curriculum-Intelligence; npm test; npm run build
cd D:\Dev\canvas-design-studio; npm test; npm run build
cd D:\Dev\Canvas-Download; .\.venv\Scripts\python.exe -m pytest
```

## Downloader Bridge

`download_canvas_archive` discovers Canvas Backup in this order:

1. `CANVAS_BACKUP_COMMAND`
2. `CANVAS_BACKUP_REPO` plus its `.venv`
3. sibling checkout `../Canvas-Download` plus its `.venv`
4. `canvas-backup` on `PATH`

The bridge returns stdout/stderr plus the parsed archive path when Canvas Backup prints it.

Architecture review follow-ups for this bridge are tracked in `docs/architecture-review-followups.md`. The highest-priority items are a self-contained `canvas-backup.exe`, a persisted downloader executable path in `setup_cc`, and JSON-lines progress forwarded through MCP progress notifications.

## Design Studio Bridge

Use these C&C pass-throughs for the current integrated workflow:

- `import_course`: Canvas Backup archive -> Canvas Design Studio `course/` folder
- `generate_course`: Canvas Design Studio `course/` folder -> Canvas-safe HTML output

`publish_course` is intentionally still a placeholder. Course-wide publish needs a safer reviewed transaction model, because page publishing can touch live student-facing Canvas content.
