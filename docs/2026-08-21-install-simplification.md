# Install simplification — pain map and cut list

**Date:** 2026-08-21 · **Scope:** Analysis only. No code in this doc.

> **Status update (later the same day):** npm publish landed (`canvas-toolchain@2.2.1`)
> and the v2.2.1 installer release shipped with catalog v2 support — pain point 1 and
> the stale-installer half of pain point 2 are resolved. Kept as the analysis that
> drove that work; remaining points still apply.

---

## Current install paths (what exists today)

| Path | Steps | Who it's for |
|------|-------|--------------|
| **`npx canvas-toolchain`** (README headline) | Install Node ≥20 → run npx → hand-wire MCP JSON per client | Developers, MCP power users |
| **Native installer** (GitHub Releases) | Download ~85–119 MB → bypass SmartScreen/Gatekeeper → 5-screen wizard → wait for npm install+build → optional credentials → restart MCP client | Professors (intended primary) |
| **From source** | `git clone` → `npm install` (triggers full build via `prepare`) → wire MCP manually | Contributors |
| **Post-install setup** | Open MCP client → run 1–13 named `setup_*` tools → optional Canvas Backup (separate Python repo) | Everyone |

The installer auto-wires Claude Desktop, Claude Code, Codex, Gemini CLI, Cursor, VS Code, Kiro, Antigravity. Every other MCP client gets a copy-paste JSON snippet on the Summary screen.

---

## Pain points (ranked)

### 1. README's fastest path is broken

`npx canvas-toolchain` returns **404** — package unpublished (#150 closed prematurely; org + `NPM_TOKEN` still missing). v2.2.0 exists on `main` but has no tag and no npm publish. A professor following the README hits a wall immediately.

### 2. Native installer is heavy, scary, and stale on disk

- **118 MB** Windows / **85 MB** macOS download; **not code-signed** — SmartScreen and Gatekeeper block first run (documented only in release notes, not the download page).
- Wizard runs **`npm install` + `npm run build` on the professor's laptop** (~minutes, network-dependent) even though CI already built `dist/` into the payload.
- **Released v2.1.0 installer rejects catalog v2** — every user sees "Module catalog unavailable." Fix merged (#152); needs a new installer cut.
- **Intel Mac and Linux:** no installer asset. darwin-x64 exists in scripts only.

### 3. No single definition of "installed" (#151)

Installer = files extracted + npm build OK. README = stdio MCP process started. `get_cc_status` = presence-only booleans (improved #152, still no ready/blocked verdict). User guide = tutorial through named `setup_*` tools. A professor can finish the wizard, open the AI app, and not know the next sentence.

### 4. Setup is fragmented after install

- Credentials screen is optional; Summary nags for `setup_anthropic` / `setup_canvas` anyway.
- **13 `setup_*` tools** across C&C, CDS (unreachable from C&C), and opt-in modules — docs still reference tools the professor cannot call.
- **Canvas Backup** is a separate Python repo; installer optionally installs global Python 3.12 but never configures Backup.
- Module picks in the wizard only write `pending-module-installs.json` — actual install happens later via chat.

### 5. MCP wiring is manual for edge cases

Eight hosts get automatic config (three JSON shapes + Codex TOML + VS Code `servers`). Undetected hosts are skipped silently. Summary accordion says paste into "Windsurf, ChatGPT Desktop" — neither is in the host table. Paths with spaces break JSON if unquoted.

---

## Target UX

**Ideal professor journey (≤2 user actions after download):**

1. **Double-click** `Canvas Toolchain Installer` (or one terminal command — see sketch below).
2. Installer drops a **prebuilt runtime** (no on-laptop `tsc`), wires every **detected** MCP host, launches the AI client.
3. First MCP message: *"I'm setting up Canvas Toolchain"* → model runs readiness + one next question. No tool names required.

**Ideal MCP-developer journey:** `npx canvas-toolchain` plus one-liner host registration (or `canvas-toolchain setup --detect-hosts`).

---

## Recommended one-command install sketch

**Phase 1 — tonight's bleed-stop (maintainer + thin scripts, no wizard rewrite):**

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/scripts/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/scripts/install.ps1 | iex
```

Script behavior:
1. Detect OS/arch → download latest **release installer asset** from GitHub API.
2. Print SmartScreen/Gatekeeper bypass **before** launch (one screen, not buried in release notes).
3. Run installer silently with defaults: `~/canvas-toolchain`, wire all detected hosts, skip optional Python unless `--with-backup`.
4. Exit message: *"Open Cursor (or Claude Desktop). Say: I'm setting up Canvas Toolchain for the first time."*

**Phase 2 — after npm publish:**

```bash
npx --yes canvas-toolchain@latest setup --detect-hosts
```

Thin Node wrapper: verify Node ≥20, ensure package present, call shared host-wiring (port Go logic or shell out to a JSON config generator). No monorepo clone, no `prepare` build on user machine.

**Not in scope:** Canvas Backup bundling, code signing, #151 Option A engine.

## Risks

| Risk | Mitigation |
|------|------------|
| Publishing v2.2.0 without `NPM_TOKEN` recipe correct | Use checklist + Bypass-2FA token (fix-156) |
| New installer still runs npm build | Phase 2 payload change: ship `node_modules` + built `dist` only |
| `install.sh` curl\|bash trust | Same as Homebrew/rustup; document checksum optional |
| Option A (#151) scope creep | Kevin picks A/B/C; tonight = Option C + scripts |

---

## Recommended cut list

**Cut or defer:**
- README claiming `npx` is "Fastest" until npm publish lands — label installer **Recommended** and npx **Requires Node**.
- On-laptop `npm run build` in installer payload step (ship prebuilt artifacts).
- Workflows screen "informational" checkboxes (Canvas/CI/Registry) — they store state nothing reads.
- Credentials screen in wizard — defer to first MCP conversation (Option B/C).
- Python auto-install in wizard — link to Canvas Backup repo instead.
- Module catalog fetch in wizard — catalog is for chat install; remove network dependency from install path.
- Docs listing CDS-only tools as C&C commands — audit pass (#155 started).

**Keep:**
- Native installer as professor path (double-click familiarity).
- Eight-host auto-wire (high leverage).
- Generate-and-paste without any credentials (first-class Ready).
- `get_cc_status` as diagnostic (grow into doctor later, not tonight).

**Ship order:** npm publish → installer release → install scripts → copy alignment → Kevin decides #151.
