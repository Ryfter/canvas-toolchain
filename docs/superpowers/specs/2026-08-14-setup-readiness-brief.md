# Setup / readiness — decision brief (#151)

**Date:** 2026-08-14
**Status:** Brief only. Not approved. Not a plan. **Do not implement from this file.**
**Issue:** [#151](https://github.com/Ryfter/canvas-toolchain/issues/151) — *One setup/readiness engine — make install mean one thing (umbrella)*
**Sources:** `TO-WORK-ON/reviews/review-grok.md`, `review-codex.md`, `installer-map.md`, and the tree as of `eb396ac`. Claims below were re-checked by grep; review text that #141 / #152 / #155 already shipped is called out as done, not re-proposed.

This is a conversation starter for the maintainer. Options are labeled **A / B / C**. There is no hidden favorite.

---

## The problem

Nothing owns the sentence **"this professor can now use Canvas Toolchain."** The native wizard treats "installed" as *source extracted, `npm install` / `npm run build` finished, version marker written* (`installer/screens/summary.go`, `install.go`). The README treats it as *`npx canvas-toolchain` started a silent stdio process* (`README.md`). `get_cc_status` reports a third, presence-only snapshot (mode, key-present, a few config-file booleans) with no overall ready/blocked verdict (`packages/command-and-control/src/tools/get_cc_status.ts`). The tutorial then walks the professor through named `setup_*` tools to reconcile the other three. Install, credentials, host wiring, companions, and first useful work are separate truths, so they drift.

Two independent reviews (2026-08-13) converged on that diagnosis. They did **not** converge on the size of the fix.

Already shipped since those reviews, and **not** on the table here: catalog v2 in the installer source (#152, still needs a release to reach professors), `get_cc_status` reading `anthropic-config.json` as well as the env var (#152), Canvas host normalization + `setup_canvas_backup` (#141), and the docs no longer telling a Command & Control user to call `get_started` (#155). `get_started` still exists only on Design Studio; C&C still passthroughs exactly two CDS tools (`import_course`, `generate_course`). `readSetupState` / `applySetup` / `runDoctor` do not exist in the tree.

---

## Option A — one setup engine, three thin clients

Build a single engine in Command & Control (the reviews sketched `readSetupState()` / `applySetup()` / `runDoctor()`). The GUI installer, the npm path, and the AI conversation become clients of it. "Installed" is whatever the engine says for the journey the professor picked (manual-paste vs connect-to-Canvas). Existing `setup_*` writers become compatibility adapters.

| | |
| --- | --- |
| **What ships first** | The engine's read model + a doctor that can say ready / optional / blocked for generate-and-paste with zero credentials. |
| **Cost** | Large. Touches C&C, the Go installer (today an independent writer of the same JSON files), npm UX, and every `setup_*` description. Weeks, not a bleed-stop. |
| **Risks** | A second implementation of setup while the first still ships. Scope creep into signing, prebuilt runtimes, and companion install. Easy to block the v2.2.0 publish that professors actually need next. |
| **Does NOT solve** | SmartScreen / Gatekeeper. The unpublished npm package (#150). On-laptop `npm run build`. Code signing. A colleague succeeding on a clean machine without a human next to them. |

This is the Codex review's architectural bet: one owner, so the two install paths cannot drift again.

---

## Option B — one first-run conversation, no new engine

Register a Command & Control `get_started` (the name the visual guide used to advertise; Design Studio already has a different one). It returns a structured readiness card from the **files on disk** and one next question in English. Installer Summary, README, and user guide all say the same sentence: open the AI app and say you are setting up for the first time. The thirteen `setup_*` tools stay as writers the model calls; the professor never has to learn the names. The installer stays a bootstrapper: drop bits, wire detected hosts, launch the client.

| | |
| --- | --- |
| **What ships first** | C&C `get_started` + the one shared next-step sentence in the four professor-facing surfaces. No Go rewrite. |
| **Cost** | Medium. One new tool, a Ready JSON shape, copy changes. Roughly the "design bet" slice both reviews put in week two. |
| **Risks** | Two `get_started` tools (C&C vs Design Studio) unless the CDS one is renamed or clearly scoped. The installer and npm path still compute "done" themselves, so drift remains possible. Naming it `get_started` without a contract just adds a fourteenth setup tool. |
| **Does NOT solve** | Dual credential writers (wizard + chat). Update-mode clobbering `modules.json` / skipping host re-wire (called out in the Grok review). On-laptop compile. Signing. A shared engine the installer cannot lie about. |

This is the Grok review's leverage bet: the product is a conversation, so the conversation should own Ready.

---

## Option C — tell the truth, do not add machinery

Genuinely the small option. Do not add an engine. Do not add `get_started` to C&C. Publish v2.2.0 so the README's `npx` line stops 404ing (#150). Keep the native installer as the professor path and `npx` as the Node/MCP path. Put the unsigned-binary bypass on the download page, not only in release notes. Let the already-fixed `get_cc_status` be the diagnostic. Leave #151 open until a later design conversation says A or B.

| | |
| --- | --- |
| **What ships first** | The v2.2.0 tag (org + `NPM_TOKEN` + notes). Maybe a README sentence that the installer is the professor path and `npx` needs Node. |
| **Cost** | Hours. Almost no new code. Matches "everything that could be fixed in code has been." |
| **Risks** | The four definitions of "installed" stay four definitions. The next feature will drift the story again. A professor can still finish the wizard and not know what to say to the AI app. |
| **Does NOT solve** | Any of the ownership problem. Duplicate credential collection. Thirteen named setup tools as a human UX. Installer-as-from-source-build. A non-technical colleague finishing in one sitting with a real answer or one honest blocker. |

Both reviews called this the bleed-stop, not the product. It is a real choice if the next unit of maintainer time is publishing, not design.

---

## Questions the maintainer must answer before anyone writes code

1. **Who is first-run for?** A professor who will not open a terminal, a Node/MCP user, or both equally? That picks the default documented path.
2. **What does "installed" mean?** Files on disk, a successful MCP handshake from a real client, or first useful work (generate-and-paste, or "analyze my course")?
3. **Does the wizard collect secrets?** Keep the credentials screen as a convenience writer of `~/.command-and-control/*`, or drop it and let chat finish setup?
4. **Which surface is the Ready contract?** A new C&C `get_started` (B), a grown-up `get_cc_status` / `doctor` (lean A), or neither until C is done (C)?
5. **Is generate-and-paste with every credential light red still first-class Ready?** The repo already says yes. Confirm, because it decides whether "Canvas not configured" is a warning or a successful skip.
6. **What is parked?** Code signing, shipping a prebuilt runtime (no `tsc` on the laptop), installing a pinned Canvas Backup instead of global Python, collapsing `setup_*` names, Linux / Intel Mac installers.

Until 1–5 have answers, A and B are guesses.

---

## What we are NOT doing

- Implementing A, B, or C in this run, and not writing implementation steps.
- Tagging, publishing, or cutting v2.2.0 from this brief.
- Code-signing or notarizing the installer.
- Rewriting the wizard in Electron / Tauri, or adding screens.
- A native Linux installer or an Intel Mac `.pkg`.
- One mega `setup_all` tool with a long parameter list.
- Removing the GUI installer or the `npx` path.
- Renaming `~/.command-and-control` or `~/.canvas-design-mcp`.
- Making ChatGPT Desktop, Grok, or any host outside `SupportedHosts()` auto-wired.
- Treating global Python as a substitute for Canvas Backup.
- Adding `get_started` / `setup_institution` passthroughs to C&C "for now" without choosing A or B.

---

## How to use this

Reply with **A**, **B**, **C**, or a mix (for example: "C now, then B, A only if B drifts"). Then a real spec. Not before.
