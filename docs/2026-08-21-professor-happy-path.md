# Professor happy path — `npx canvas-toolchain` → first shell edit

**Date:** 2026-08-21 · **Scope:** Ten lines, no Fable. See also [`2026-08-21-shell-edit-reliability.md`](2026-08-21-shell-edit-reliability.md).

Ten numbered steps from MCP start to a successful shell brief edit. Credentials optional for steps 1–9 (generate-and-paste path).

1. **Node ≥20** (or install the native installer from [Releases](https://github.com/Ryfter/canvas-toolchain/releases) — it wires MCP for you).
2. **Start MCP:** `npx canvas-toolchain` (published to npm as of v2.2.1, same day); **from source:** `git clone … && cd canvas-toolchain && npm install && node packages/canvas-toolchain/bin/canvas-toolchain.mjs`.
3. **Wire client:** `{ "mcpServers": { "canvas-toolchain": { "command": "npx", "args": ["canvas-toolchain"] } } }` — restart the AI app.
4. **Smoke (maintainer / from source):** `node scripts/smoke-npx.mjs node packages/canvas-toolchain/bin/canvas-toolchain.mjs` → `OK: canvas-toolchain@<version>` (stdio MCP `initialize`; see script header in [`scripts/smoke-npx.mjs`](../scripts/smoke-npx.mjs)).
5. **“Am I configured?”** Ask your client to run **`get_cc_status`** — the C&C status tool (presence-only booleans for keys, Canvas, packages). Design Studio alone exposes **`get_started`**; it is **not** on C&C.
6. **Register course:** `setup_course` `{ courseId: "ITM370", displayName: "…" }` (once per course).
7. **Get an editable shell:** `plan_next_semester` `{ courseId, sourceSemesterId, newSemesterId }` — or `import_course` `{ archivePath, outputDir }` from a Canvas Backup `.zip` if you have no CI plan yet.
8. **Locate briefs:** `~/.curriculum-intelligence/courses/<courseId>/semesters/<semesterId>/next-plan/week-XX/*.md` — or `node scripts/shell-edit-doctor.mjs --courseId ITM370 --semesterId Fall2026`.
9. **First shell edit:** change a brief’s markdown body (keep the `---` YAML front matter), or call `draft_assignment_brief` for an LLM draft (needs `setup_anthropic`).
10. **Done:** the brief file on disk reflects your edit — that is first shell edit success; run `export_course_folder` → `generate_course` when you want paste-ready HTML.

## MCP stdio smoke (existing — no new script)

[`scripts/smoke-npx.mjs`](../scripts/smoke-npx.mjs) is the repo’s stdio MCP smoke. It spawns any server command, sends JSON-RPC `initialize`, and exits 0 when `serverInfo` returns.

```bash
# From repo root (from-source gate)
node scripts/smoke-npx.mjs node packages/canvas-toolchain/bin/canvas-toolchain.mjs

# After npm publish
node scripts/smoke-npx.mjs npx canvas-toolchain
```

Integration smoke (fixtures, not stdio): `npm run smoke:integration --workspace=packages/command-and-control`.

## Status tools by package

| Package | Tool name | Use |
| --- | --- | --- |
| Command & Control (`npx canvas-toolchain`) | **`get_cc_status`** | “What’s configured?” — mode, key presence, Canvas/LLM files, installed packages |
| Canvas Design Studio (standalone MCP) | **`get_started`** | Design Studio orientation only; from C&C use **`get_cc_status`** instead |
