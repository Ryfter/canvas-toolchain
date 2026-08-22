# canvas-toolchain

**Canvas Toolchain** helps a professor refresh a Canvas LMS course every semester. It combines three apps — **Canvas Toolchain — Curriculum Intelligence**, **Canvas Toolchain — Design Studio**, and **Canvas Toolchain — Command & Control** — behind a single MCP entrypoint, plus a Python sidecar for downloading Canvas data and a native installer.

```text
Canvas Backup archive
  -> Curriculum Intelligence   (analyze past course, plan the next one)
  -> Canvas Design Studio      (generate Canvas-safe HTML)
  -> Canvas-safe HTML
  -> optional Canvas publishing
```

Professors drive the whole thing by talking to the **Canvas Toolchain** MCP server (installed via the native installer, or `npx canvas-toolchain` if you have Node) from any MCP-capable AI client. Each underlying app also stays independently usable. Direct Canvas API publishing is always optional — the no-token "generate HTML and paste it in" path is first-class.

**Optional modules and companion programs:** see [docs/modules.md](docs/modules.md).

## Where to start

**Canvas Toolchain** runs as an MCP server you talk to from any MCP-capable AI client.

The **installer auto-wires** these eight hosts (verbatim from `installer/tasks/mcphost.go` `SupportedHosts()`): Claude Desktop, Claude Code, Codex CLI, Gemini CLI, Cursor, VS Code, Kiro, and Antigravity.

**Any other MCP-capable client** works via the manual JSON snippet below — it is not auto-wired.

### Recommended: native installer

Download the Windows x64 / macOS arm64 installer from
[Releases](https://github.com/Ryfter/canvas-toolchain/releases) — it bundles Node, the
toolchain, and an auto-updater, and writes the MCP config for every client it detects.

> **First run:** the installer is not code-signed. Windows SmartScreen and macOS Gatekeeper
> may block it — use **More info → Run anyway** (Windows) or **Open Anyway** in System
> Settings → Privacy & Security (macOS). See the release notes for screenshots.

### With Node.js: `npx`

If you already have Node ≥ 20, you can start the unified MCP server without cloning the repo:

```bash
npx canvas-toolchain
```

That speaks MCP on stdio — wire it into a client below; it is not an interactive CLI.

### From source

```bash
git clone https://github.com/Ryfter/canvas-toolchain.git
cd canvas-toolchain
npm install        # install IS the build — no separate build step
npx canvas-toolchain   # smoke: starts the MCP server (Ctrl+C to stop)
```

> Requires Node ≥ 20. If your checkout lives in a folder with spaces (e.g.
> `~/Documents/Canvas Toolchain`), quote the path anywhere it appears in JSON config.

### Wire it into your client

Everywhere below, `npx canvas-toolchain` also accepts an absolute path form:
`node <checkout>/packages/command-and-control/dist/index.js`.

**Claude Desktop** (`claude_desktop_config.json`) / **Claude Code** (`.mcp.json`) / **Cursor** / **VS Code** — mcpServers JSON:

```json
{
  "mcpServers": {
    "canvas-toolchain": { "command": "npx", "args": ["canvas-toolchain"] }
  }
}
```

**Codex CLI:**

```bash
codex mcp add canvas-toolchain -- npx canvas-toolchain
```

**Gemini CLI** (`~/.gemini/settings.json`):

```json
{ "mcpServers": { "canvas-toolchain": { "command": "npx", "args": ["canvas-toolchain"] } } }
```

**Any other MCP-capable client** (not in the installer host table above): any client that can run a
stdio MCP server works via this same JSON snippet — command `npx`, args `["canvas-toolchain"]`. Restart the client
after editing its config. That includes hosts the installer does not auto-wire.

**Migration:** existing configs that point at the old bin names (`canvas-design-mcp`,
`command-and-control-mcp`) should switch to `npx canvas-toolchain` (or the new bins
`canvas-toolchain-server`, `canvas-toolchain-design-studio`,
`canvas-toolchain-curriculum-intelligence` if you still want a single-package server).

**Working on this repo (human or AI agent)?** Read [`AGENTS.md`](AGENTS.md) first.

## Documentation

| Doc | What's in it |
| --- | --- |
| 🧭 [**Feature overview**](docs/tool-overview.md) | Concise outcome-focused summary of what Canvas Toolchain helps instructors do, with emphasis on accessibility, Canvas management, shell speed/quality, and instructor-led AI review |
| 🗺️ [**Roadmap**](docs/roadmap.md) | What ships next and in what order — the WCAG 2.2 gate phases, upcoming releases, the v2.0 plug-in direction, and the unscheduled ideas backlog |
| 🚀 [**User Guide & Tutorial**](docs/user-guide.md) | **Start here.** What you can do, how to use it, a hands-on end-to-end tutorial, and a task-by-task command catalog (*what each command is · how it works · why you'd use it*) |
| 📘 [**Commands & Credentials reference**](docs/commands-and-credentials.md) | Every command (MCP tool) with its parameters, and every API key/secret — what it's for, why, and whether it's optional |
| 🧩 [**Module view**](docs/architecture-modules.md) | The toolchain broken into modules: what each is, why it exists, what it does, and its commands |
| ♿ [**Accessibility checks**](docs/accessibility.md) | Every automated accessibility check the toolchain runs — what each one catches, how it works (with the contrast math), where it runs (advisory vs blocking), how to fix findings, and its limitations |
| 🎨 [**Visual guide**](docs/visual-guide/README.md) | Picture-first tour — diagrams of the pipeline, architecture, and setup ([rendered PNG/SVG](docs/visual-guide/images/) + an editable [Excalidraw scene](docs/visual-guide/pipeline.excalidraw)) |

## What lives where

| Path | Package | What it owns |
| --- | --- | --- |
| `packages/canvas-toolchain/` | `canvas-toolchain` | **npx entrypoint launcher** — the published bin professors run (`npx canvas-toolchain`) |
| `packages/command-and-control/` | `@canvas-toolchain/command-and-control` | Single professor-facing MCP server (`canvas-toolchain-server`); workflow orchestration, registry, adapters |
| `packages/canvas-design-studio/` | `@canvas-toolchain/canvas-design-studio` | Canvas-safe HTML generation (`canvas-toolchain-design-studio`), design review, transcript enrichment |
| `packages/curriculum-intelligence/` | `@canvas-toolchain/curriculum-intelligence` | Course analysis, semester comparison, topic currency, planning (`canvas-toolchain-curriculum-intelligence`) |
| `packages/shared-types/` | `@canvas-toolchain/shared-types` | TypeScript contracts shared across packages |
| `packages/shared-llm/` | `@canvas-toolchain/shared-llm` | Shared LLM client (Anthropic + Ollama providers) |
| `packages/module-contract/` | `@canvas-toolchain/module-contract` | The `CanvasToolchainModule` plug-in contract for opt-in capability modules |
| `packages/module-video/` | `@canvas-toolchain/module-video` | Lecture Video module (Panopto as the first provider) |
| `packages/module-oral-assessment/` | `@canvas-toolchain/module-oral-assessment` | Oral/video assessment authoring (Rhetorix-first) |
| `packages/module-group-builder/` | `@canvas-toolchain/module-group-builder` | Create and rotate balanced student groups |
| `packages/module-roster/` | `@canvas-toolchain/module-roster` | Roster & Identity Manager (PeopleSoft → de-identified roster + pseudonyms) |
| `packages/module-peerassessment/` | `@canvas-toolchain/module-peerassessment` | Export a Canvas group set to a PeerAssessment.com import CSV |
| `installer/` | — | Go + Fyne native installer and auto-updater |
| [`canvas-backup`](https://github.com/Ryfter/canvas-backup) (separate repo) | — | Python Canvas backup downloader, reached via a CLI bridge |

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
