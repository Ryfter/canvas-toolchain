# Canvas Toolchain — AI Agent Handoff Guide

This guide is the entry point for any AI tool working on this monorepo. It maps the available CLIs and skills, explains which tool to reach for, and points to per-package handoff docs.

If you are a human reading this: skim "Quick orientation" and "What lives where," then read the per-package `CLAUDE.md` or `AGENTS.md` for the area you are touching.

---

## Quick orientation

**What this is.** A four-package TypeScript monorepo plus a Python sidecar that, together, refresh a Canvas LMS course every semester. The flow is:

```text
Canvas Backup archive
  -> Curriculum Intelligence analysis and planning
  -> Canvas Design Studio course folder
  -> Canvas-safe HTML
  -> optional Canvas publishing
```

**Single professor-facing entrypoint:** the Command & Control MCP server. Professors talk to it from any MCP-capable AI client (Claude Desktop, ChatGPT, Gemini). Each underlying app stays independently usable.

**Status:** v0.9 core workflow is complete. The native installer is the gating item for v1.0.

---

## What lives where

| Package | What it owns | Read first |
| --- | --- | --- |
| `packages/command-and-control/` | Single MCP entrypoint, workflow orchestration, registry, brand/layout adapters | `CLAUDE.md`, `AGENTS.md` |
| `packages/canvas-design-studio/` | Canvas-safe HTML generation, design review, transcript enrichment | `CLAUDE.md`, `AGENTS.md` |
| `packages/curriculum-intelligence/` | Course analysis, semester comparison, topic currency, planning | `CLAUDE.md`, `AGENTS.md` |
| `packages/shared-types/` | TypeScript contracts shared across packages | `src/index.ts` |
| `D:\Dev\Canvas-Download` (sibling) | Python Canvas backup downloader; reached via CLI bridge | repo README |

---

## The full AI toolkit map

Different tools have different strengths. Use the right one for the job — and document who did what when you commit or close an issue.

### Claude Code (this CLI)

**What it is.** The interactive CLI you are reading this in. Best for: conversational planning, file edits, running tests, coordinating multi-step tasks, dispatching subagents.

**Models.** Sonnet 4.6 (default — integration tasks, multi-file edits), Opus 4.7 (architecture, judgment, hard reviews), Haiku 4.5 (cheap mechanical tasks).

**Key skills (invoke via the `Skill` tool):**

- `superpowers:brainstorming` — turn ideas into specs before any code
- `superpowers:writing-plans` — turn specs into step-by-step task plans
- `superpowers:subagent-driven-development` — execute plans with fresh subagents per task and two-stage review
- `superpowers:executing-plans` — execute plans in this session in larger batches
- `superpowers:finishing-a-development-branch` — verify tests, present merge/PR options, clean up
- `superpowers:using-git-worktrees` — isolate work in a sibling worktree
- `superpowers:test-driven-development` — red/green/refactor discipline

**Specialized subagent types (dispatch via the `Agent` tool):**

- `Explore` — fast read-only search across the codebase
- `Plan` — design implementation plans
- `general-purpose` — multi-step research and tasks
- `octo:droids:octo-*` — code review, security audit, performance, debugger, etc.
- `octo:personas:*` — backend-architect, frontend-developer, ai-engineer, python-pro, typescript-pro, etc.
- `codex:codex-rescue` — hand a substantial coding task to Codex via the shared runtime

**Slash commands (user-invoked, type `/<name>`):**

- `/octo` — discoverable menu of octo agents and skills
- `/codex` — discoverable menu of Codex-handoff capabilities
- `/github` — GitHub MCP server (browser-installed tools like `mcp__github__*`)
- `/loop` — schedule self-paced iterations of a task
- `/schedule` — schedule a one-shot follow-up
- `/ultrareview` — multi-agent cloud review of the current branch or a PR

### Codex (ChatGPT CLI)

**What it is.** OpenAI's Codex CLI. Strong at pure code generation, algorithms, mechanical refactors, single-file work with a clear spec.

**Reach for it when.** A task is well-specified, isolated to 1-3 files, and mostly about writing code (not making architecture decisions). Examples: implementing a Go installer screen, writing a parser, porting an algorithm.

**Two ways to hand off:**

1. **In Claude Code:** dispatch the `codex:codex-rescue` subagent type. Pass a self-contained prompt with file paths and spec.
2. **In Codex CLI directly:** Kevin runs Codex in a separate terminal against the same repo.

**Label issues for Codex with:** `agent:codex`.

### Gemini / Antigravity CLI

**What it is.** Google's Antigravity CLI, Gemini-backed. Strong at architecture review, broad context reasoning, and HTML/Canvas rendering questions.

**Reach for it when.** You want an independent architecture review of a branch, a second opinion on a design, or layout/visual reasoning.

**How to hand off.** Kevin runs Antigravity CLI in a separate terminal. Point it at the relevant branch or directory and the spec.

**Label issues for Gemini with:** `agent:gemini`.

### GitHub MCP (`/github` plugin in Claude Code)

**What it is.** The `/github` slash command in Claude Code loads the GitHub MCP server, which surfaces `mcp__github__*` tools (issue create/read/write, PR create/review, file ops, search, etc.). This is **separate from** the `gh` CLI on your shell.

**Reach for it when.** You need direct API access to GitHub from inside a Claude Code session (create issues without shelling out, add review comments inline, etc.).

**Quick distinction:**

- `gh` = a shell command you (or Claude via the `Bash` tool) run from a terminal
- `/github` = the MCP plugin inside Claude Code that gives Claude direct API tools

Both end up calling the same GitHub REST/GraphQL APIs.

---

## Choosing the right agent for an issue

Labels on every issue (`agent:sonnet`, `agent:opus`, `agent:codex`, `agent:gemini`) record the recommended agent. Use this rubric:

| Signal | Agent |
| --- | --- |
| Architecture, design judgment, hard review | `agent:opus` (Claude Opus) |
| Multi-file integration, pattern matching, LLM calls | `agent:sonnet` (Claude Sonnet) |
| Mechanical code generation, algorithms, isolated implementation | `agent:codex` (Codex) |
| HTML/Canvas rendering, layout, broad-context review | `agent:gemini` (Gemini/Antigravity) |

When you finish a task, mention which agent actually did the work in the closing commit or comment — labels reflect plan, completion text reflects reality.

---

## Status labels and tracking

Every issue carries a status:

- `status:backlog` — known work, not yet started
- `status:ready` — ready to pick up
- `status:in-progress` — actively being worked on
- `status:in-review` — implementation complete, awaiting review
- `status:done` — merged and shipped

Milestones group work into releases:

- `v0.9 — Core Workflow` — feature-complete coordinator (all workflow tools)
- `v1.0 — Native Installer` — Go+Fyne installer (gating release item)
- `Future / Backlog` — post-v1.0 ideas

The GitHub Project "Canvas Toolchain Roadmap" pulls all of this together with board and roadmap views.

---

## Workflow for a new task

1. **Find or create the issue.** Status `status:backlog` → `status:ready` when picked up.
2. **Brainstorm if needed.** Use `superpowers:brainstorming` to produce a spec in `packages/<pkg>/docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
3. **Plan.** Use `superpowers:writing-plans` to produce a step-by-step plan in `packages/<pkg>/docs/superpowers/plans/YYYY-MM-DD-<topic>.md`.
4. **Move to `status:in-progress`** and execute. For non-trivial work, use `superpowers:subagent-driven-development`.
5. **Move to `status:in-review`** when implementation is done and tests pass. Open a PR.
6. **Move to `status:done`** when merged. Note the agent that did the work.

---

## Verification before claiming done

For any cross-package contract change, run:

```powershell
cd D:\Dev\canvas-toolchain; npm test; npm run build
cd D:\Dev\Curriculum-Intelligence; npm test; npm run build
cd D:\Dev\canvas-design-studio; npm test; npm run build
cd D:\Dev\Canvas-Download; .\.venv\Scripts\python.exe -m pytest
```

For changes inside a single package, the package-local `npm test` + `npm run build` is enough, plus C&C's `npm run smoke:integration` if you changed a contract C&C calls.

---

## Hard rules

- **Do not port the whole toolchain to Go.** Go is for the installer and possibly a future Canvas Backup rewrite. The working product logic stays in TypeScript and Python.
- **Direct Canvas API publishing stays optional.** The no-token manual generate-and-paste path is first-class forever.
- **Local archive is the source of truth.** Google Drive is only a mirror.
- **No `--no-verify` on commits**, no skipping hooks, no force-push to main.
- **One issue, one PR, one merge.** Update the status label as you go.

---

## Active specs and plans

The v1.0 native installer is the current gating item. Read these before picking up any installer work:

- [`installer/docs/specs/2026-05-26-installer-design.md`](installer/docs/specs/2026-05-26-installer-design.md) — full installer design spec (locked 2026-05-26)
- [`installer/docs/plans/2026-05-26-cc-credential-tools-and-update-nudge.md`](installer/docs/plans/2026-05-26-cc-credential-tools-and-update-nudge.md) — **Plan 1** (do first): C&C `setup_anthropic`, `setup_canvas`, and the update-availability MCP nudge. Ships as v0.9.1.
- [`installer/docs/plans/2026-05-26-installer-go-fyne.md`](installer/docs/plans/2026-05-26-installer-go-fyne.md) — **Plan 2**: the Go + Fyne installer itself. Depends on Plan 1's contracts. Hand to Codex via `codex:codex-rescue`.
- [`installer/docs/plans/2026-05-26-installer-ci-release-workflow.md`](installer/docs/plans/2026-05-26-installer-ci-release-workflow.md) — **Plan 3**: GitHub Actions release workflow. Depends on Plan 2's `installer/` directory existing.

GitHub Project view: [Canvas Toolchain Roadmap](https://github.com/users/Ryfter/projects/4).

---

## Per-package handoffs

- [`packages/command-and-control/CLAUDE.md`](packages/command-and-control/CLAUDE.md) — coordinator, registry, adapters
- [`packages/command-and-control/AGENTS.md`](packages/command-and-control/AGENTS.md) — repo layout, tool list, Panopto pipeline
- [`packages/canvas-design-studio/CLAUDE.md`](packages/canvas-design-studio/CLAUDE.md) — Canvas HTML rules, KB, design tokens
- [`packages/canvas-design-studio/AGENTS.md`](packages/canvas-design-studio/AGENTS.md) — transcript enrichment internals
- [`packages/curriculum-intelligence/AGENTS.md`](packages/curriculum-intelligence/AGENTS.md) — analysis engine internals
