# Installer CI + Release Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is intended for handoff to Codex via `codex:codex-rescue`.

**Goal:** Build the GitHub Actions infrastructure that produces release artifacts for the canvas-toolchain installer: per-OS installer binaries with embedded canvas-toolchain source + bundled Node, attached to GitHub Releases on every `v*.*.*` tag.

**Architecture:** Two workflows — `installer-ci.yml` runs Go tests on every PR that touches `installer/`; `release-installer.yml` runs on tag push, builds three OS-specific artifacts (Windows x64, macOS arm64, macOS x64), and uploads them to the release.

**Tech Stack:** GitHub Actions, Go cross-compilation for Windows from Linux, native builds on macOS runners for the Mac targets. `tar` for payload packing. `pkgbuild` for unsigned macOS .pkg wrapping.

**Source spec:** `installer/docs/specs/2026-05-26-installer-design.md` §8.

**Out of scope:** Code signing (per spec non-goals), Linux artifact builds (also out of scope per spec), updating the running installer's stub binary independently of the main installer.

**Dependencies:** Plan 2's `installer/` directory must exist and `go build` cleanly with stubbed-empty embeds. Plan 3 wires those stubs to real payload at release time.

---

## File structure

**New files:**

- `.github/workflows/installer-ci.yml` — PR/push CI for the Go installer.
- `.github/workflows/release-installer.yml` — release pipeline triggered by tag push.
- `.github/RELEASE_TEMPLATE/installer-release.md` — release notes template with SmartScreen/Gatekeeper bypass screenshots.
- `.github/ISSUE_TEMPLATE/installer-bug.md` — issue template the installer's "Report issue" button links to.
- `installer/scripts/pack-payload.sh` — helper script invoked by the release workflow.
- `installer/scripts/download-node.sh` — helper script that fetches the matching Node binary tarball.

---

## Task 1: PR-level CI workflow for the Go installer

**Files:**
- Create: `.github/workflows/installer-ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Installer CI

on:
  push:
    branches: [main]
    paths:
      - 'installer/**'
      - '.github/workflows/installer-ci.yml'
  pull_request:
    paths:
      - 'installer/**'
      - '.github/workflows/installer-ci.yml'

jobs:
  test:
    name: Test (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
          cache-dependency-path: installer/go.sum

      - name: Install Fyne build prerequisites (Ubuntu)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libgl1-mesa-dev xorg-dev

      - name: Stub embed files
        shell: bash
        working-directory: installer
        run: |
          touch payload/installer-payload.tar.gz
          touch payload/node-runtime.tar.gz

      - name: go vet
        working-directory: installer
        run: go vet ./...

      - name: go test
        working-directory: installer
        run: go test ./...

      - name: go build (installer)
        working-directory: installer
        run: go build -o /tmp/canvas-toolchain-installer .

      - name: go build (updater stub)
        working-directory: installer
        run: go build -tags updater_stub -o /tmp/canvas-toolchain-updater ./update
```

- [ ] **Step 2: Commit**

```bash
git -C D:/Dev/canvas-toolchain add .github/workflows/installer-ci.yml
git -C D:/Dev/canvas-toolchain commit -m "ci: installer Go test workflow (PR + push) (refs #63)"
```

Expected: workflow file added. First push to a branch with installer/ changes will trigger the workflow.

---

## Task 2: Pack-payload helper script

**Files:**
- Create: `installer/scripts/pack-payload.sh`

- [ ] **Step 1: Write the script**

`installer/scripts/pack-payload.sh`:

```bash
#!/usr/bin/env bash
#
# pack-payload.sh — Build the canvas-toolchain monorepo and pack it for
# embedding into the installer binary. Expects to be run from the repo root.
#
# Usage:
#   bash installer/scripts/pack-payload.sh
#
# Output:
#   installer/payload/installer-payload.tar.gz

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> Installing monorepo deps"
npm ci

echo "==> Building monorepo"
npm run build

PAYLOAD_OUT="$REPO_ROOT/installer/payload/installer-payload.tar.gz"
echo "==> Packing payload to $PAYLOAD_OUT"

# Include: package.json, package-lock.json, packages/ (post-build, with dist/),
# tsconfig.base.json. Exclude every node_modules tree.
# Note: tar writes to stdout (-cz, no f) and shell redirects to "$PAYLOAD_OUT".
# This avoids tar parsing Windows-style D:/... paths as remote archive specs
# under Git Bash, while remaining portable to BSD tar (macOS) and GNU tar.
tar \
  --exclude='*/node_modules' \
  --exclude='node_modules' \
  --exclude='installer' \
  --exclude='.git' \
  --exclude='.github' \
  --exclude='.claude' \
  --exclude='packages/canvas-design-studio/output' \
  --exclude='packages/curriculum-intelligence/output' \
  -cz \
  package.json \
  package-lock.json \
  tsconfig.base.json \
  packages \
  > "$PAYLOAD_OUT"

SIZE=$(stat -c%s "$PAYLOAD_OUT" 2>/dev/null || stat -f%z "$PAYLOAD_OUT")
echo "==> Payload size: $((SIZE / 1024 / 1024)) MB"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x D:/Dev/canvas-toolchain/installer/scripts/pack-payload.sh
```

- [ ] **Step 3: Smoke test locally**

```bash
cd D:/Dev/canvas-toolchain
bash installer/scripts/pack-payload.sh
ls -lh installer/payload/installer-payload.tar.gz
```

Expected: tarball created, size in the 5-10 MB range.

- [ ] **Step 4: Commit**

```bash
git -C D:/Dev/canvas-toolchain add installer/scripts/pack-payload.sh
git -C D:/Dev/canvas-toolchain commit -m "ci: pack-payload helper script for release builds (refs #63)"
```

---

## Task 3: Download-node helper script

**Files:**
- Create: `installer/scripts/download-node.sh`

- [ ] **Step 1: Write the script**

`installer/scripts/download-node.sh`:

```bash
#!/usr/bin/env bash
#
# download-node.sh — Download the matching Node 18 LTS distribution for the
# target OS/arch and place it at installer/payload/node-runtime.tar.gz.
#
# Usage:
#   bash installer/scripts/download-node.sh <target>
#
# Where <target> is one of: win-x64, darwin-x64, darwin-arm64
#
# Output:
#   installer/payload/node-runtime.tar.gz

set -euo pipefail

NODE_VERSION="${NODE_VERSION:-18.20.7}"
TARGET="${1:?Usage: download-node.sh <win-x64|darwin-x64|darwin-arm64>}"

case "$TARGET" in
  win-x64)
    FILENAME="node-v${NODE_VERSION}-win-x64.zip"
    ;;
  darwin-x64)
    FILENAME="node-v${NODE_VERSION}-darwin-x64.tar.gz"
    ;;
  darwin-arm64)
    FILENAME="node-v${NODE_VERSION}-darwin-arm64.tar.gz"
    ;;
  *)
    echo "unknown target: $TARGET" >&2
    exit 1
    ;;
esac

URL="https://nodejs.org/dist/v${NODE_VERSION}/${FILENAME}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
OUT="$REPO_ROOT/installer/payload/node-runtime.tar.gz"

echo "==> Downloading $URL"
TMP="$(mktemp -d)"
curl -fL "$URL" -o "$TMP/$FILENAME"

# Normalize all targets to a tar.gz so the Go extract path is uniform.
if [[ "$FILENAME" == *.zip ]]; then
  echo "==> Converting zip to tar.gz"
  cd "$TMP"
  unzip -q "$FILENAME"
  EXTRACTED_DIR="${FILENAME%.zip}"
  # Stdout redirect to avoid Git Bash treating "D:/..." as a remote archive.
  tar -cz -C "$EXTRACTED_DIR" . > "$OUT"
else
  echo "==> Copying tar.gz"
  cp "$TMP/$FILENAME" "$OUT"
fi

rm -rf "$TMP"
echo "==> Node runtime ready at $OUT"
ls -lh "$OUT"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x D:/Dev/canvas-toolchain/installer/scripts/download-node.sh
```

- [ ] **Step 3: Smoke test for one target**

```bash
cd D:/Dev/canvas-toolchain
bash installer/scripts/download-node.sh darwin-arm64
ls -lh installer/payload/node-runtime.tar.gz
```

Expected: ~30 MB file created. Skip this step on Windows dev machine since `curl` + `unzip` may behave differently — CI will exercise all targets.

- [ ] **Step 4: Commit**

```bash
git -C D:/Dev/canvas-toolchain add installer/scripts/download-node.sh
git -C D:/Dev/canvas-toolchain commit -m "ci: download-node helper for per-OS Node runtime bundling (refs #63)"
```

---

## Task 4: Release workflow — skeleton + matrix

**Files:**
- Create: `.github/workflows/release-installer.yml`

- [ ] **Step 1: Write the workflow header**

`.github/workflows/release-installer.yml`:

```yaml
name: Release Installer

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: write   # required to create/update GitHub Releases

jobs:
  build:
    name: Build (${{ matrix.target.label }})
    strategy:
      fail-fast: false
      matrix:
        target:
          - label: windows-x64
            runs-on: ubuntu-latest
            goos: windows
            goarch: amd64
            node-target: win-x64
            artifact: canvas-toolchain-installer-windows-x64.exe
            updater-artifact: canvas-toolchain-updater-windows-x64.exe
          - label: macos-arm64
            runs-on: macos-latest
            goos: darwin
            goarch: arm64
            node-target: darwin-arm64
            artifact: canvas-toolchain-installer-macos-arm64.pkg
            updater-artifact: canvas-toolchain-updater-macos-arm64
          - label: macos-x64
            runs-on: macos-13
            goos: darwin
            goarch: amd64
            node-target: darwin-x64
            artifact: canvas-toolchain-installer-macos-x64.pkg
            updater-artifact: canvas-toolchain-updater-macos-x64

    runs-on: ${{ matrix.target.runs-on }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
          cache-dependency-path: installer/go.sum

      - name: Install Linux Fyne deps (Windows cross-compile host)
        if: matrix.target.goos == 'windows'
        run: |
          sudo apt-get update
          sudo apt-get install -y gcc-mingw-w64 libgl1-mesa-dev xorg-dev

      # Subsequent steps added in Tasks 5-8.
```

- [ ] **Step 2: Commit the skeleton**

```bash
git -C D:/Dev/canvas-toolchain add .github/workflows/release-installer.yml
git -C D:/Dev/canvas-toolchain commit -m "ci: release workflow skeleton with 3-OS build matrix (refs #63)"
```

---

## Task 5: Release workflow — build monorepo + pack payload step

**Files:**
- Modify: `.github/workflows/release-installer.yml`

- [ ] **Step 1: Add the payload step**

Append to the workflow after the Fyne deps step:

```yaml
      - name: Pack canvas-toolchain payload
        shell: bash
        run: bash installer/scripts/pack-payload.sh

      - name: Download bundled Node (${{ matrix.target.node-target }})
        shell: bash
        run: bash installer/scripts/download-node.sh ${{ matrix.target.node-target }}
```

- [ ] **Step 2: Commit**

```bash
git -C D:/Dev/canvas-toolchain add .github/workflows/release-installer.yml
git -C D:/Dev/canvas-toolchain commit -m "ci: release workflow payload pack + Node download (refs #63)"
```

---

## Task 6: Release workflow — build the Go installer

**Files:**
- Modify: `.github/workflows/release-installer.yml`

- [ ] **Step 1: Add the Go build steps**

Append:

```yaml
      - name: Set version variable
        id: version
        shell: bash
        run: echo "version=${GITHUB_REF#refs/tags/}" >> "$GITHUB_OUTPUT"

      - name: Build installer (Windows cross-compile)
        if: matrix.target.goos == 'windows'
        working-directory: installer
        env:
          GOOS: ${{ matrix.target.goos }}
          GOARCH: ${{ matrix.target.goarch }}
          CGO_ENABLED: '1'
          CC: x86_64-w64-mingw32-gcc
        run: |
          go build -ldflags "-X main.Version=${{ steps.version.outputs.version }} -H windowsgui" \
            -o canvas-toolchain-installer-windows-x64.exe .

      - name: Build installer (macOS native)
        if: matrix.target.goos == 'darwin'
        working-directory: installer
        env:
          GOOS: ${{ matrix.target.goos }}
          GOARCH: ${{ matrix.target.goarch }}
          CGO_ENABLED: '1'
        run: |
          go build -ldflags "-X main.Version=${{ steps.version.outputs.version }}" \
            -o canvas-toolchain-installer-${{ matrix.target.goarch }} .

      - name: Build updater stub (Windows)
        if: matrix.target.goos == 'windows'
        working-directory: installer
        env:
          GOOS: ${{ matrix.target.goos }}
          GOARCH: ${{ matrix.target.goarch }}
          CGO_ENABLED: '1'
          CC: x86_64-w64-mingw32-gcc
        run: |
          go build -tags updater_stub -ldflags "-X main.Version=${{ steps.version.outputs.version }} -H windowsgui" \
            -o canvas-toolchain-updater-windows-x64.exe ./update

      - name: Build updater stub (macOS)
        if: matrix.target.goos == 'darwin'
        working-directory: installer
        env:
          GOOS: ${{ matrix.target.goos }}
          GOARCH: ${{ matrix.target.goarch }}
          CGO_ENABLED: '1'
        run: |
          go build -tags updater_stub -ldflags "-X main.Version=${{ steps.version.outputs.version }}" \
            -o canvas-toolchain-updater-${{ matrix.target.goarch }} ./update
```

- [ ] **Step 2: Commit**

```bash
git -C D:/Dev/canvas-toolchain add .github/workflows/release-installer.yml
git -C D:/Dev/canvas-toolchain commit -m "ci: release workflow Go builds (installer + updater stub) (refs #63)"
```

---

## Task 7: Release workflow — macOS .pkg packaging

**Files:**
- Modify: `.github/workflows/release-installer.yml`

- [ ] **Step 1: Add the pkgbuild step**

Append:

```yaml
      - name: Package macOS .pkg
        if: matrix.target.goos == 'darwin'
        working-directory: installer
        run: |
          ROOT="$(mktemp -d)/payload"
          mkdir -p "$ROOT/Applications/Canvas Toolchain Installer.app/Contents/MacOS"
          mkdir -p "$ROOT/Applications/Canvas Toolchain Installer.app/Contents"
          cp canvas-toolchain-installer-${{ matrix.target.goarch }} \
             "$ROOT/Applications/Canvas Toolchain Installer.app/Contents/MacOS/canvas-toolchain-installer"
          chmod +x "$ROOT/Applications/Canvas Toolchain Installer.app/Contents/MacOS/canvas-toolchain-installer"
          cat > "$ROOT/Applications/Canvas Toolchain Installer.app/Contents/Info.plist" <<EOF
          <?xml version="1.0" encoding="UTF-8"?>
          <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
          <plist version="1.0">
          <dict>
            <key>CFBundleExecutable</key>
            <string>canvas-toolchain-installer</string>
            <key>CFBundleIdentifier</key>
            <string>io.canvas-toolchain.installer</string>
            <key>CFBundleName</key>
            <string>Canvas Toolchain Installer</string>
            <key>CFBundlePackageType</key>
            <string>APPL</string>
            <key>CFBundleShortVersionString</key>
            <string>${{ steps.version.outputs.version }}</string>
            <key>LSMinimumSystemVersion</key>
            <string>12.0</string>
          </dict>
          </plist>
          EOF
          pkgbuild --root "$ROOT" \
            --identifier io.canvas-toolchain.installer \
            --version ${{ steps.version.outputs.version }} \
            --install-location / \
            ${{ matrix.target.artifact }}
```

- [ ] **Step 2: Commit**

```bash
git -C D:/Dev/canvas-toolchain add .github/workflows/release-installer.yml
git -C D:/Dev/canvas-toolchain commit -m "ci: release workflow macOS .pkg packaging via pkgbuild (refs #63)"
```

---

## Task 8: Release workflow — upload to GitHub Release

**Files:**
- Modify: `.github/workflows/release-installer.yml`

- [ ] **Step 1: Add the asset upload step**

Append:

```yaml
      - name: Rename Windows artifact (no .pkg wrap needed)
        if: matrix.target.goos == 'windows'
        working-directory: installer
        run: cp canvas-toolchain-installer-windows-x64.exe ${{ matrix.target.artifact }}

      - name: Upload installer + updater to Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            installer/${{ matrix.target.artifact }}
            installer/${{ matrix.target.updater-artifact }}
          body_path: .github/RELEASE_TEMPLATE/installer-release.md
          fail_on_unmatched_files: true
```

- [ ] **Step 2: Commit**

```bash
git -C D:/Dev/canvas-toolchain add .github/workflows/release-installer.yml
git -C D:/Dev/canvas-toolchain commit -m "ci: release workflow uploads installer + updater to GitHub Release (refs #63)"
```

---

## Task 9: Release notes template

**Files:**
- Create: `.github/RELEASE_TEMPLATE/installer-release.md`

- [ ] **Step 1: Write the template**

```markdown
# Canvas Toolchain Installer

## Download

| OS | File |
| --- | --- |
| Windows 10/11 (64-bit) | `canvas-toolchain-installer-windows-x64.exe` |
| macOS 12+ (Apple Silicon) | `canvas-toolchain-installer-macos-arm64.pkg` |
| macOS 12+ (Intel) | `canvas-toolchain-installer-macos-x64.pkg` |

## First-run bypass

This installer is **not code-signed** (we ship for free; signing certs aren't free). One-time bypass:

### Windows — SmartScreen

1. Double-click the `.exe`. SmartScreen warns "Windows protected your PC."
2. Click **More info**.
3. Click **Run anyway**.

That's it. Once the installer runs, it sets up canvas-toolchain and never re-prompts.

### macOS — Gatekeeper

1. Double-click the `.pkg`. Gatekeeper says "Apple could not verify…"
2. Click **Done**.
3. Open **System Settings → Privacy & Security**.
4. Scroll to the bottom; click **Open Anyway** next to the canvas-toolchain installer notice.
5. Re-double-click the `.pkg`; click **Open** at the second Gatekeeper prompt.

## What it installs

The installer drops the canvas-toolchain source onto your machine, installs npm dependencies using a bundled Node 18 runtime (no Node prereq required), wires the MCP server into Claude Desktop and Claude Code CLI, and creates a Desktop / Applications "Canvas Toolchain Updater" shortcut for one-click updates.

## What it does NOT install

- Anything outside the install directory you chose
- Anything in `~/.command-and-control/` is preserved across updates
- Telemetry, analytics, or remote calls beyond the optional update check against GitHub Releases

## Reporting issues

Use the [installer-bug issue template](https://github.com/Ryfter/canvas-toolchain/issues/new?template=installer-bug.md).

Include: your OS + version, the last 50 lines of the installer log (click "Show log" on the install screen), and what you were doing when it failed.
```

- [ ] **Step 2: Commit**

```bash
git -C D:/Dev/canvas-toolchain add .github/RELEASE_TEMPLATE/installer-release.md
git -C D:/Dev/canvas-toolchain commit -m "docs: installer release notes template with SmartScreen + Gatekeeper bypass (refs #63)"
```

---

## Task 10: Installer-bug issue template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/installer-bug.md`

- [ ] **Step 1: Write the template**

```markdown
---
name: Installer bug
about: Report a problem with the Canvas Toolchain installer
title: '[installer] '
labels: ['installer', 'bug', 'status:backlog']
assignees: []
---

## OS and version

(Windows 11 build 22631 / macOS 14.3 / etc.)

## Installer version

(The version shown on screen 1 — e.g. v1.0.0)

## What you were doing

(e.g. "Fresh install, opted in to Python, all credentials filled" — or "Re-ran the installer to update from v0.9.1 to v0.9.2")

## What went wrong

(Which step failed? What error appeared?)

## Installer log

Click **Show log** on the install screen, then paste the last 50 lines below:

```
(paste log here)
```

## Anything else?

(Network setup, antivirus, custom install path, etc.)
```

- [ ] **Step 2: Commit**

```bash
git -C D:/Dev/canvas-toolchain add .github/ISSUE_TEMPLATE/installer-bug.md
git -C D:/Dev/canvas-toolchain commit -m "docs: installer-bug issue template (refs #63)"
```

---

## Task 11: End-to-end CI dry run

- [ ] **Step 1: Verify the workflow files lint cleanly**

```bash
cd D:/Dev/canvas-toolchain
gh workflow view release-installer.yml 2>&1 || true
gh workflow view installer-ci.yml 2>&1 || true
```

(Or use `actionlint` if installed: `actionlint .github/workflows/*.yml`.)

Expected: no syntax errors. The `gh workflow view` output may include "workflow not found" until the file is on GitHub — that's fine for a syntax check.

- [ ] **Step 2: Push a test tag to exercise the release workflow**

This is destructive (creates a real GitHub Release). Only run when Kevin is ready to ship v1.0.0 (or use a `v0.0.0-test` tag and delete the release afterward).

```bash
# Tag a test release
git -C D:/Dev/canvas-toolchain tag v0.0.0-test
git -C D:/Dev/canvas-toolchain push origin v0.0.0-test
# Watch:
gh run watch
# After verifying artifacts uploaded correctly, clean up:
gh release delete v0.0.0-test --yes
git -C D:/Dev/canvas-toolchain push --delete origin v0.0.0-test
git -C D:/Dev/canvas-toolchain tag -d v0.0.0-test
```

Expected:
- Three jobs run in parallel (Windows x64, Mac arm64, Mac x64).
- Each produces a binary + updater stub.
- All artifacts attached to the v0.0.0-test release.
- Release notes from `installer-release.md` template applied.

- [ ] **Step 3: Hand off to `superpowers:finishing-a-development-branch`**

After Step 2 succeeds, the release workflow is proven. Finishing the branch is the last step.

---

## Plan self-review

Spec coverage check (against `installer/docs/specs/2026-05-26-installer-design.md`):

| Spec section | Plan task | ✓ |
| --- | --- | --- |
| §4.1 Three artifacts attached to GitHub Release | Tasks 4, 8 | ✓ |
| §4.3 Source payload built at CI time | Tasks 2, 5 | ✓ |
| §4.4 Per-OS Node downloaded at CI time | Tasks 3, 5 | ✓ |
| §8 GitHub Actions matrix | Task 4 | ✓ |
| §8 step 6 ldflags Version injection | Task 6 | ✓ |
| §8 step 7 macOS .pkg packaging | Task 7 | ✓ |
| §11 release notes template | Task 9 | ✓ |
| §11 issue template installer-bug.md | Task 10 | ✓ |

Placeholder scan: No "TBD"s. All YAML steps are complete and runnable. The pack-payload script's `tar` invocation matches GNU tar (CI uses Linux + macOS — both have compatible `tar`).

Type consistency: Matrix `target.*` keys are consistent across all steps that reference them. Output names (`canvas-toolchain-installer-windows-x64.exe`, `canvas-toolchain-installer-macos-arm64.pkg`, etc.) match what the updater stub in Plan 2 Task 17 expects via `assetForCurrentOS()`.

Scope: 11 tasks, ~25 sub-steps. Smaller than Plan 2. One CI dry-run (Task 11 Step 2) is the only step with real-world destructive consequence — Kevin should approve before that tag push.

Open implementation items:
- The Fyne docs note that CGO is required for native builds. The cross-compile for Windows from Linux uses mingw-w64; verify it builds Fyne cleanly. Fallback: use a `windows-latest` runner for the Windows build with native CGO instead of cross-compiling. The matrix would change accordingly.
- The `softprops/action-gh-release@v2` action concatenates `body_path` content for each job — across 3 jobs in the matrix, the release body would be written 3 times. Verify the action de-dupes or move the release-creation step into a separate job that runs once (an `if: matrix.target.label == 'windows-x64'` guard on the body upload would also work).
- The `pkgbuild` invocation produces an unsigned .pkg — verify macOS 14+ Gatekeeper still allows the "Open Anyway" path. If newer macOS versions tighten this, document an alternative (e.g. `xattr -d com.apple.quarantine` instructions in release notes).
- Consider adding a checksum file (`SHA256SUMS`) to the release as a 4th asset for users who want to verify downloads.
