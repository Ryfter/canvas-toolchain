# canvas-toolchain

A toolchain that helps a professor refresh a Canvas LMS course every semester. It combines three apps — **Curriculum Intelligence**, **Canvas Design Studio**, and **Command & Control** — behind a single MCP entrypoint, plus a Python sidecar for downloading Canvas data and a native installer.

```text
Canvas Backup archive
  -> Curriculum Intelligence   (analyze past course, plan the next one)
  -> Canvas Design Studio      (generate Canvas-safe HTML)
  -> Canvas-safe HTML
  -> optional Canvas publishing
```

Professors drive the whole thing by talking to the **Command & Control** MCP server from any MCP-capable AI client (Claude Desktop, Claude Code, ChatGPT, Gemini). Each underlying app also stays independently usable. Direct Canvas API publishing is always optional — the no-token "generate HTML and paste it in" path is first-class.

## Where to start

- **Installing as a user?** Download the native installer (Windows x64 / macOS arm64) from [Releases](https://github.com/Ryfter/canvas-toolchain/releases) — it bundles Node, the toolchain, and an auto-updater behind a five-screen wizard.
- **Working on this repo (human or AI agent)?** Read [`AGENTS.md`](AGENTS.md) first — it maps the tools, skills, packages, and workflow conventions, and links to every per-package handoff doc.
- **Latest repo health review:** [`docs/repo-health-check-2026-06-07.md`](docs/repo-health-check-2026-06-07.md).

## Documentation

| Doc | What's in it |
| --- | --- |
| 🚀 [**User Guide & Tutorial**](docs/user-guide.md) | **Start here.** What you can do, how to use it, a hands-on end-to-end tutorial, and a task-by-task command catalog (*what each command is · how it works · why you'd use it*) |
| 📘 [**Commands & Credentials reference**](docs/commands-and-credentials.md) | Every command (MCP tool) with its parameters, and every API key/secret — what it's for, why, and whether it's optional |
| 🧩 [**Module view**](docs/modules.md) | The toolchain broken into modules: what each is, why it exists, what it does, and its commands |
| ♿ [**Accessibility checks**](docs/accessibility.md) | Every automated accessibility check the toolchain runs — what each one catches, how it works (with the contrast math), where it runs (advisory vs blocking), how to fix findings, and its limitations |
| 🎨 [**Visual guide**](docs/visual-guide/README.md) | Picture-first tour — diagrams of the pipeline, architecture, and setup ([rendered PNG/SVG](docs/visual-guide/images/) + an editable [Excalidraw scene](docs/visual-guide/pipeline.excalidraw)) |

## What lives where

| Path | What it owns |
| --- | --- |
| `packages/command-and-control/` | Single professor-facing MCP entrypoint; workflow orchestration, registry, adapters |
| `packages/canvas-design-studio/` | Canvas-safe HTML generation, design review, transcript enrichment |
| `packages/curriculum-intelligence/` | Course analysis, semester comparison, topic currency, planning |
| `packages/shared-types/` | TypeScript contracts shared across packages |
| `packages/shared-llm/` | Shared LLM client (Anthropic + Ollama providers) |
| `packages/module-contract/` | The `CanvasToolchainModule` plug-in contract for opt-in capability modules |
| `packages/module-video/` | Lecture Video module (Panopto as the first provider) |
| `packages/module-oral-assessment/` | Oral/video assessment authoring (Rhetorix-first) |
| `packages/module-group-builder/` | Create and rotate balanced student groups |
| `packages/module-roster/` | Roster & Identity Manager (PeopleSoft → de-identified roster + pseudonyms) |
| `packages/module-peerassessment/` | Export a Canvas group set to a PeerAssessment.com import CSV |
| `installer/` | Go + Fyne native installer and auto-updater |
| [`canvas-backup`](https://github.com/Ryfter/canvas-backup) (separate repo) | Python Canvas backup downloader, reached via a CLI bridge |

## Verification

From the repo root:

```powershell
npm test          # all TypeScript workspace tests
npm run build     # compile all packages
npm run smoke:integration --workspace=packages/command-and-control
```

Installer (from `installer/`):

```powershell
go vet ./...
go test ./...
go build -o ct-installer.exe .
```

See [`AGENTS.md`](AGENTS.md) for the full cross-package verification matrix and the installer's local-payload build notes.
