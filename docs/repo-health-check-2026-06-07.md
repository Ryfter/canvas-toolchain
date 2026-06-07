# Canvas Toolchain Repo Health Check - 2026-06-07

This document captures the repo review performed from Codex on 2026-06-07. It is intended as a durable handoff for future Codex, Claude Code, or human review sessions.

## Scope

Reviewed the current `main` branch of `D:\Dev\canvas-toolchain` at:

- Branch: `main`
- Remote: `origin https://github.com/Ryfter/canvas-toolchain.git`
- HEAD: `4ae762a docs(cds): CLAUDE.md - CLO mapping (#91)`
- Worktree state before and after checks: clean, tracking `origin/main`

The review focused on:

- Top-level monorepo shape and package scripts.
- TypeScript workspace tests and builds.
- Command & Control integration smoke flow.
- Go/Fyne installer tests, vetting, and smoke build.
- Installer release/update documentation and implementation drift.

## Verification Run

These commands were run locally from `D:\Dev\canvas-toolchain` unless a different working directory is noted.

| Command | Result | Notes |
| --- | --- | --- |
| `git status --short --branch` | Passed | Clean worktree on `main...origin/main`. |
| `npm test` | Passed | All TypeScript workspace tests passed. Total observed: 1,451 passed, 3 skipped. |
| `npm run build` | Passed | All TypeScript packages compiled with `tsc`. |
| `go test ./...` from `installer/` | Passed | Installer packages passed. Some packages have no test files. |
| `go vet ./...` from `installer/` | Passed | No vet findings. |
| `npm run smoke:integration --workspace=packages/command-and-control` | Passed | Fixture-based C&C integration smoke passed. |
| `go build -o D:\tmp\canvas-toolchain-installer-smoke.exe .` from `installer/` | Passed | Installer smoke binary built successfully. |

Expected stderr/stdout during tests:

- Some tests intentionally exercise malformed JSONL, failed Canvas breadcrumb POSTs, rate limits, and offline search fallback.
- These appeared as stderr/stdout messages but did not fail the suite.

## What Works

The core TypeScript monorepo is in good shape.

- `packages/shared-types` builds and tests.
- `packages/shared-llm` builds and tests.
- `packages/curriculum-intelligence` builds and tests.
- `packages/canvas-design-studio` builds and tests.
- `packages/command-and-control` builds and tests.

The Command & Control integration smoke path works against fixtures:

- `analyze_course` completed against the sample archive.
- Canvas Design Studio `import_course` produced 14 files across 2 weeks with 0 warnings.
- Canvas Design Studio `generate_course` produced 10 pages with 0 warnings.
- Lecture answers indexed 1 chunk from 1 file.
- The answer path returned a citation in hybrid mode.
- The Ollama-backed answer bot path worked through a stub server.

The Go installer has meaningful automated coverage and currently passes:

- `installer/screens`
- `installer/tasks`
- `installer/ui`
- `installer/update`

The installer also compiles locally on Windows with the current embedded payload files present in the repo.

The GitHub release workflow is present and builds:

- Windows x64 installer.
- macOS arm64 installer package.
- Windows x64 updater artifact.
- macOS arm64 updater artifact.

The release template correctly documents that Intel Mac builds are not supported.

## Needs A Second Look

### 1. Updater shortcut may point to a binary that is never installed

Severity: high for v1.0 installer release readiness.

Evidence:

- `installer/screens/install.go` sets `updaterBin := st.InstallDir + "/canvas-toolchain-updater"`.
- The install step calls `tasks.CreateUpdaterShortcuts(updaterBin, st.InstallDir)`.
- `installer/scripts/pack-payload.sh` excludes the entire `installer` directory from the embedded payload.
- `.github/workflows/release-installer.yml` builds updater artifacts separately and uploads them to the GitHub Release.

Concern:

The installer appears to create a shortcut to an updater binary inside the install directory, but the packed install payload does not include that binary, and the release workflow does not appear to copy or embed the updater binary into the main installer payload. On Windows, the target path also omits `.exe`.

Files to inspect first:

- `installer/screens/install.go`
- `installer/tasks/shortcuts_windows.go`
- `installer/tasks/shortcuts_darwin.go`
- `installer/scripts/pack-payload.sh`
- `.github/workflows/release-installer.yml`

Recommended fix direction:

- Decide whether the updater binary should be embedded in the main installer, included in the install payload, or downloaded during install.
- Make the installed updater path platform-specific, for example `canvas-toolchain-updater.exe` on Windows.
- Add an installer task test that proves the updater binary exists before creating a shortcut.
- Add a release-workflow assertion that the final installer artifact contains or can install the updater binary.

### 2. macOS updater likely cannot launch the downloaded `.pkg`

Severity: high for macOS update path.

Evidence:

- `installer/update/cmd/updater/main.go` selects `canvas-toolchain-installer-macos-arm64.pkg` for macOS arm64.
- The updater downloads the asset to temp and calls `exec.Command(tmp).Start()`.

Concern:

A `.pkg` is not normally executed directly. The updater likely needs to call `open <pkg>` or run `/usr/sbin/installer` with appropriate privileges and UX. Direct execution is likely to fail on macOS.

Files to inspect first:

- `installer/update/cmd/updater/main.go`
- `.github/workflows/release-installer.yml`

Recommended fix direction:

- Use `open` for macOS if the desired UX is to launch the package installer.
- Use `/usr/sbin/installer` only if the project is ready to handle permissions, logging, and failure UX.
- Add a small unit seam around update launch behavior so Windows and macOS command selection can be tested without launching real installers.

### 3. Manual installer test plan still includes old Intel Mac wording

Severity: low documentation drift.

Evidence:

- `.github/RELEASE_TEMPLATE/installer-release.md` says Intel Macs are not supported.
- `installer/docs/manual-test-plan.md` still includes `T3 - Fresh Mac install (Intel)`.

Concern:

Intel Mac support is intentionally out of scope because those machines are old and not worth carrying in the v1.0 release matrix. The only issue is that the manual test plan still asks testers to validate an artifact that the release workflow no longer builds.

Recommended fix direction:

- Remove the Intel Mac test from the manual plan.
- Keep the release template and manual test matrix aligned.

### 4. Top-level status docs lag the current implementation

Severity: medium handoff clarity issue.

Evidence:

- `AGENTS.md` still says: `v0.9 core workflow is complete. The native installer is the gating item for v1.0.`
- The repo now contains a substantial `installer/` implementation plus installer CI and release workflows.
- `README.md` is still a minimal two-line description.

Concern:

Future agents may waste time following old Plan 2 and Plan 3 instructions as if the installer and release workflow do not yet exist.

Recommended fix direction:

- Update `AGENTS.md` to distinguish between "installer implementation exists and passes automated checks" and "installer release/update path still needs review."
- Expand `README.md` enough to point humans and agents to `AGENTS.md`, package locations, installer docs, and verification commands.

### 5. Workflow selections in installer are mostly UX metadata

Severity: low to medium product clarity issue.

Evidence:

- `installer/screens/workflows.go` captures `WorkflowCanvas`, `WorkflowPanopto`, `WorkflowCI`, and `WorkflowRegistry`.
- Only `WorkflowPanopto` materially changes credential fields and summary warnings.
- `WorkflowCanvas`, `WorkflowCI`, and `WorkflowRegistry` do not appear to affect install steps.

Concern:

The screen text says choices affect which API credentials are requested and which features the summary highlights. Today, most choices do not appear to drive much behavior. That may be acceptable, but it should be intentional.

Recommended fix direction:

- Either make those choices affect summary/setup guidance, or simplify the copy to say all workflows are installed and only Panopto/Python selections change setup.

## Suggested Next Work

Recommended order:

1. Fix or verify updater binary installation. This is the biggest release-readiness risk.
2. Fix macOS updater package launch behavior.
3. Remove stale Intel Mac wording from the manual installer test plan.
4. Refresh `AGENTS.md` and `README.md` to reflect current installer status.
5. Tighten installer workflow-selection UX if it remains visible in v1.0.

## Useful Commands For Follow-Up

Run the standard local health check:

```powershell
cd D:\Dev\canvas-toolchain
npm test
npm run build
npm run smoke:integration --workspace=packages/command-and-control
cd installer
go vet ./...
go test ./...
go build -o D:\tmp\canvas-toolchain-installer-smoke.exe .
```

Inspect the updater path:

```powershell
cd D:\Dev\canvas-toolchain
git grep -n "updaterBin\|canvas-toolchain-updater\|CreateUpdaterShortcuts" -- installer .github
git grep -n "updater-artifact\|Pack canvas-toolchain payload\|Upload installer" -- .github/workflows/release-installer.yml installer/scripts/pack-payload.sh
```

Inspect release/test matrix drift:

```powershell
cd D:\Dev\canvas-toolchain
git grep -n "Intel\|macOS\|macos-arm64\|windows-x64" -- installer/docs/manual-test-plan.md .github/RELEASE_TEMPLATE/installer-release.md .github/workflows/release-installer.yml
```

## Bottom Line

The repo is healthy from an automated test/build standpoint. The professor-facing TypeScript workflow and C&C fixture integration are working. The installer implementation is present and compiles, but the updater install/release path needs a focused review before treating the native installer as fully shippable.
