# DRAFT — v2.2.0 release notes

**Status: draft for the maintainer to review. Not published. Do not attach this file to a GitHub Release as-is.**

Derived from `git log v2.1.0..HEAD` (2026-08-14). Intended home after review: the top of [`.github/RELEASE_TEMPLATE/installer-release.md`](../.github/RELEASE_TEMPLATE/installer-release.md), which the installer workflow uses as the Release body. Format matches that template.

Paste from the heading below.

---

## What's new in v2.2.0

**One product name, any AI client — and the installer's module picker works again.**

- **One command, one name.** The toolchain is now just **Canvas Toolchain**. Talk to it from any MCP-capable AI client with `npx canvas-toolchain` (after this release is on npm) or via the native installer. The installer still auto-wires Claude Desktop, Claude Code, Codex CLI, Gemini CLI, Cursor, VS Code, Kiro, and Antigravity; any other MCP client uses the same JSON snippet. ([#140](https://github.com/Ryfter/canvas-toolchain/pull/140))
- **The installer's "Additional modules" list works again.** After v2.1.0 the live catalog moved to schema v2, and every copy of the *published* installer showed *"Module catalog unavailable."* This installer understands catalog v1 and v2, so the picker loads. **If you installed 2.1.0, update to 2.2.0 to get the list back** — a source-tree fix does not reach an already-installed wizard. ([#152](https://github.com/Ryfter/canvas-toolchain/pull/152))
- **Canvas host names are forgiven everywhere, not just in the wizard.** Typing `yourschool` (or pasting a full `https://…` URL) now becomes a real Canvas host whether you set it in the installer *or* in chat. Already-saved broken hosts heal the next time they are read. A new `setup_canvas_backup` step writes Canvas Backup's required config from the Canvas connection you already gave, without writing the API token into a second file. ([#141](https://github.com/Ryfter/canvas-toolchain/pull/141))
- **Status tells the truth about your key.** `get_cc_status` now counts an Anthropic key that lives in `~/.command-and-control/anthropic-config.json`, not only one sitting in an environment variable. It also reports — presence only, never the secret — whether Canvas, the LLM-provider file, and the generated Canvas Backup config are in place. ([#152](https://github.com/Ryfter/canvas-toolchain/pull/152))
- **Canvas Backup's public link is the real repo.** The module directory no longer points at a 404. Companion programs stay listed and explained; nothing auto-installs them. ([#152](https://github.com/Ryfter/canvas-toolchain/pull/152))
- **The manuals match the product.** Professor-facing docs now agree on which AI apps the installer wires, which tools Command & Control actually exposes, and that v2.2.0 is the unification release. ([#155](https://github.com/Ryfter/canvas-toolchain/pull/155))

Nothing you already do goes away. Generate-and-paste without a Canvas token is still first-class. Existing modules and credentials stay where they are.

Full diff: [v2.1.0...v2.2.0](https://github.com/Ryfter/canvas-toolchain/compare/v2.1.0...v2.2.0)

## First-run bypass (unsigned installer)

This installer is **not code-signed** (the project ships for free; signing certificates are not). A new user hits the operating system's warning **before** the wizard opens. That is expected. One-time bypass:

### Windows — SmartScreen

1. Double-click `canvas-toolchain-installer-windows-x64.exe`. SmartScreen warns "Windows protected your PC."
2. Click **More info**.
3. Click **Run anyway**.

That's it. Once the installer runs, it does not re-prompt.

### macOS — Gatekeeper

1. Double-click `canvas-toolchain-installer-macos-arm64.pkg`. Gatekeeper says "Apple could not verify…"
2. Click **Done**.
3. Open **System Settings → Privacy & Security**.
4. Scroll to the bottom; click **Open Anyway** next to the canvas-toolchain installer notice.
5. Re-double-click the `.pkg`; click **Open** at the second Gatekeeper prompt.

> **Intel Macs are not supported.** Apple Silicon (M1 or later) only.

## Download

| OS | File |
| --- | --- |
| Windows 10/11 (64-bit) | `canvas-toolchain-installer-windows-x64.exe` |
| macOS 12+ (Apple Silicon) | `canvas-toolchain-installer-macos-arm64.pkg` |

---

## Maintainer notes (do not paste into the GitHub Release)

Commits on `v2.1.0..HEAD` used for this draft:

| SHA | Subject |
| --- | --- |
| `ec15820` | chore(channel): cut over to catalogVersion 2 (#133) — this is what broke the already-released 2.1.0 picker |
| `8fb193b` | chore(catalog): list ASR Bench as a companion (#134) |
| `9a8af05` | fix(cc): resolve packages in get_cc_status (#135) |
| `0c60099` | docs(roadmap) + CDS widget-test leak (#136) |
| `e2e1b74` | v2.2.0 unification (#140) |
| `2c6f454` | Canvas host normalization + Backup config (#141) |
| `b0dfddd` | catalog v2 installer + companion URL + status (#152) |
| `4214f3a` | docs(agents): catalog contract + status-tool rules (#153) |
| `0ac3408` | chore(deps): bump hono to 4.13.2 (#154) |
| `eb396ac` | docs: reconcile living docs (#155) |

`#133` / `#134` / `#135` / `#136` / `#153` / `#154` are real but not called out above: the catalog cutover is the *cause* of the picker bug that `#152` ships the fix for; the rest are companion listing, internal status-probe, test/docs, agent-handoff, or a lockfile bump.

Still true after this tag, and out of these notes on purpose:

- `npx canvas-toolchain` is only live **after** the npm job succeeds. Until then the README headline still 404s (#150).
- Issue #151 (one definition of "installed") is **not** in this release. Design only; see [`docs/superpowers/specs/2026-08-14-setup-readiness-brief.md`](superpowers/specs/2026-08-14-setup-readiness-brief.md).
