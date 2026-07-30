# Canvas Toolchain unification — one name, one command, any model

**Date:** 2026-07-30 · **Status:** approved (design conversation, option B chosen) · **Target release:** v2.2.0

## Problem

A colleague was handed a source copy of the repo and could not start anything:

1. `npx canvas-toolchain` → "could not determine executable to run" (root package has no `bin`).
2. `npx canvas-design-mcp` → not recognized (workspace bins point at `dist/index.js`, which does not exist until `npm run build` — a step no doc mentions).
3. Naming drift: releases say v2.1.0 while every package.json says 1.0.0; MCP servers register as `command-and-control` etc. while the installer writes `canvas-toolchain` into host configs; docs mix component names and product name.
4. Shipped source contains ~43 hard-coded "Claude" strings and the installer has Claude-specific UI, contradicting the product claim of running on any MCP-capable model.
5. Institution-specific "BSU/Boise State" strings crept back into the public repo (worst: `packages/module-peerassessment/src/build.ts`).

## Goals

- `npx canvas-toolchain` works **anywhere** — inside a repo copy and, via the npm registry, with no clone at all (option B).
- **No undocumented steps.** Plain `npm install` in the repo produces a runnable tree; every remaining path (quickstart, MCP wiring per host, publish runbook) is written down.
- The product is called **Canvas Toolchain** everywhere a user reads.
- Model-agnostic: no model brand baked into shipped strings; Claude, Codex, Gemini, Grok, and local models are all first-class hosts.
- Institution scrub restored and guarded in CI.

## Workstream 1 — entrypoint + npm publishing

### In-repo

- Root package.json: add `"prepare": "npm run build"` so `npm install` auto-builds all workspaces. Install *is* the build.
- Root package.json: add `"bin": {"canvas-toolchain": "bin/canvas-toolchain.mjs"}`.
- `bin/canvas-toolchain.mjs`: resolves `@canvas-toolchain/command-and-control`'s `dist/index.js` and launches it (spawn `process.execPath`, stdio inherit — never write to stdout itself; stdout belongs to the MCP protocol). If dist is missing, print a clear "run `npm install` to build the toolchain first" message to **stderr** and exit 1.

### Registry (the option-B half)

- Rename the three unscoped workspace packages into the scope:
  - `canvas-design-mcp` → `@canvas-toolchain/canvas-design-studio`
  - `curriculum-intelligence-mcp` → `@canvas-toolchain/curriculum-intelligence`
  - `command-and-control-mcp` → `@canvas-toolchain/command-and-control`
  - Directory names and `dist/` layouts do **not** change (the native installer wires absolute paths to `dist/index.js`; it is unaffected). All cross-package imports (`from 'canvas-design-mcp/dist/…'`) update to the scoped names.
- New workspace `packages/canvas-toolchain`: the unscoped **`canvas-toolchain`** package. Contents: the `bin` launcher and a semver dependency on `@canvas-toolchain/command-and-control`. This is what `npx canvas-toolchain` fetches from the registry.
- All workspace packages drop `"private"` where present, gain `"files"` covering `dist/` (plus runtime assets), `publishConfig.access: "public"`, repository/license fields.
- **Versioning:** every package version locks to the release version. This release sets all to **2.2.0**; the release workflow keeps them locked thereafter.
- **Publish workflow:** extend the existing tag-triggered release workflow — after build + test, `npm publish --workspaces --access public` with `--provenance` (plus the root `canvas-toolchain` package). Publishes only on `vX.Y.Z` tags, same trust gates as the installer release.
- **Manual prerequisites (Kevin, documented in the runbook):** create the `@canvas-toolchain` org on npmjs.com (both the scope and the bare `canvas-toolchain` name are confirmed unclaimed as of 2026-07-30); add `NPM_TOKEN` (granular, publish-only) as a repo secret.

### Verification

- Clean temp clone (path containing spaces + parentheses, mirroring the colleague's `Canvas Toolchain (K Rank)` folder): `npm install` → `npx canvas-toolchain` responds to an MCP `initialize` over stdio.
- `npm pack --workspaces` dry-run: every tarball contains its `dist/` and its manifest deps resolve to published names (no `"*"` leaking into tarballs — `npm publish` in a workspace rewrites `*` to the concrete version; verify in the packed manifests).
- Registry end-to-end can only be verified after the org/token exist; the runbook includes a post-publish `npx canvas-toolchain@latest` smoke from an empty temp dir.

## Workstream 2 — naming unification

- C&C's MCP server registration name → `canvas-toolchain` (matches what the installer already writes into all 8 host configs).
- Design Studio / Curriculum Intelligence keep their component registration names but are presented in docs as "Canvas Toolchain — Design Studio" style.
- User-facing docs (README, docs/, installer screens, wizard output, dashboard) consistently say **Canvas Toolchain**.
- Version drift fixed by the 2.2.0 lockstep above.
- Frozen history under `docs/superpowers/` (specs/plans) is left untouched.

## Workstream 3 — model-agnostic pass

**Changes:** every shipped string that names a model brand where it means "the AI assistant" — tool descriptions, course-scaffold templates, wizard/setup output, rubric footer, module install notes ("next Claude reconnect" → "next MCP host reconnect"), installer texts ("ask Claude" → "ask your AI assistant"), the installer's "Launch Claude Desktop" summary button (shown only when the Claude Desktop host was wired; label stays host-specific because the action is host-specific — the generalization is that it is driven by which host got wired, not hard-coded).

**Not changed:** the Anthropic provider adapter, provider model IDs in config defaults (real provider settings; Ollama/local is already a peer provider in shared-llm), harness instruction files (CLAUDE.md, AGENTS.md, GEMINI.md — each agent's own entrypoint), and historical spec/plan docs.

**Docs:** README gains two quickstarts — *no-clone* (`npx canvas-toolchain` + per-host MCP config snippets for Claude Desktop/Code, Codex, Gemini, Cursor/VS Code, and a generic stdio JSON block covering Grok and local models) and *from-source* (clone → `npm install` → verify → wire), with an explicit note that paths containing spaces need quoting in host JSON.

## Workstream 4 — institution re-scrub + CI guard

- Genericize the leaked strings (`BSU-approved` → `institution-approved`, "Boise State professor" → "a university professor", etc.). Product name Rhetorix / Rhetorix Lab stays. Guard-grep lines inside frozen plan docs that *describe* the rule are not leaks; leave them.
- New CI step (in `ci.yml`): tree grep for institution identifiers fails the build on any match, excluding the guard's own definition. Prove fail-before/pass-after during implementation.

## Out of scope

- Rewriting git history; renaming package directories; scrubbing the issue tracker.
- The colleague's second error transcript (".NET SSL" wording, `Status: configured for…`) — produced by a non-Node tool, nothing in this repo emits those strings; his fix is Workstream 1.
- Grade round-trip, new features, vitest 4 migration.

## Risks

- **better-sqlite3 / sqlite-vec native deps:** registry installs compile or fetch prebuilds on the user's machine; the npx smoke in the runbook is the gate. (The native installer path is unaffected — it ships node_modules.)
- **`prepare` lengthens `npm install`** in the repo by one full build; accepted — it is what makes install self-sufficient.
- **Scoped-name rename** touches many imports; TypeScript build + full test suite is the safety net.
