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

- **Working on this repo (human or AI agent)?** Read [`AGENTS.md`](AGENTS.md) first — it maps the tools, skills, packages, and workflow conventions, and links to every per-package handoff doc.
- **Latest repo health review:** [`docs/repo-health-check-2026-06-07.md`](docs/repo-health-check-2026-06-07.md).

## What lives where

| Path | What it owns |
| --- | --- |
| `packages/command-and-control/` | Single professor-facing MCP entrypoint; workflow orchestration, registry, adapters |
| `packages/canvas-design-studio/` | Canvas-safe HTML generation, design review, transcript enrichment |
| `packages/curriculum-intelligence/` | Course analysis, semester comparison, topic currency, planning |
| `packages/shared-types/` | TypeScript contracts shared across packages |
| `packages/shared-llm/` | Shared LLM client (Anthropic + Ollama providers) |
| `installer/` | Go + Fyne native installer and auto-updater |
| `D:\Dev\Canvas-Download` (sibling repo) | Python Canvas backup downloader, reached via a CLI bridge |

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
