#!/usr/bin/env bash
# install.sh — download the latest Canvas Toolchain native installer and launch it.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/scripts/install.sh | bash
#   bash scripts/install.sh [--dry-run]
#
# Silent wizard: not yet supported by the native installer (GUI only). This script
# downloads the release asset, prints OS security bypass notes, and opens the installer.

set -euo pipefail

REPO="${CANVAS_TOOLCHAIN_REPO:-Ryfter/canvas-toolchain}"
API="https://api.github.com/repos/${REPO}/releases/latest"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      cat <<'EOF'
Canvas Toolchain install helper

  bash scripts/install.sh [--dry-run]

Downloads the latest native installer for this OS/arch from GitHub Releases,
prints SmartScreen/Gatekeeper guidance, and launches the installer (GUI).

Environment:
  CANVAS_TOOLCHAIN_REPO  GitHub repo slug (default: Ryfter/canvas-toolchain)
EOF
      exit 0
      ;;
  esac
done

die() {
  echo "install.sh: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

need_cmd curl
need_cmd uname

OS="$(uname -s)"
ARCH="$(uname -m)"

case "${OS}" in
  Darwin)
    case "${ARCH}" in
      arm64) ASSET='canvas-toolchain-installer-macos-arm64.pkg' ;;
      x86_64) ASSET='canvas-toolchain-installer-macos-x64.pkg' ;;
      *) die "unsupported macOS architecture: ${ARCH}" ;;
    esac
    SECURITY_NOTE=$'macOS Gatekeeper may block the installer on first run.\nIf blocked: System Settings → Privacy & Security → Open Anyway.\nAlternatively: right-click the installer → Open.'
    ;;
  MINGW*|MSYS*|CYGWIN*)
    ASSET='canvas-toolchain-installer-windows-x64.exe'
    SECURITY_NOTE=$'Windows SmartScreen may warn on first run.\nClick "More info" → "Run anyway" (installer is not code-signed yet).'
    ;;
  Linux)
    die "no native Linux installer yet. Clone the repo and run: npm install && npm run build — or use the GitHub Releases page for Windows/macOS."
    ;;
  *)
    die "unsupported OS: ${OS}"
    ;;
esac

echo "Fetching latest release from ${REPO}..."
RELEASE_JSON="$(curl -fsSL -H 'Accept: application/vnd.github+json' "${API}")" \
  || die "GitHub Releases API request failed"

parse_release() {
  if command -v python3 >/dev/null 2>&1; then
    ASSET="${ASSET}" python3 -c '
import json, os, sys
release = json.load(sys.stdin)
asset_name = os.environ["ASSET"]
print(release.get("tag_name", ""))
for item in release.get("assets", []):
    if item.get("name") == asset_name:
        print(item.get("browser_download_url", ""))
        break
'
    return
  fi
  if command -v node >/dev/null 2>&1; then
    ASSET="${ASSET}" node -e '
const release = JSON.parse(require("fs").readFileSync(0, "utf8"));
const assetName = process.env.ASSET;
console.log(release.tag_name ?? "");
const hit = (release.assets ?? []).find((a) => a.name === assetName);
if (hit) console.log(hit.browser_download_url ?? "");
'
    return
  fi
  die "python3 or node required to parse GitHub release JSON"
}

PARSED="$(printf '%s' "${RELEASE_JSON}" | parse_release)"
TAG="$(printf '%s' "${PARSED}" | sed -n '1p')"
DOWNLOAD_URL="$(printf '%s' "${PARSED}" | sed -n '2p')"
[ -n "${TAG}" ] || die "could not parse release tag from GitHub API response"

if [ -z "${DOWNLOAD_URL}" ]; then
  die "release ${TAG} has no asset named ${ASSET}. See https://github.com/${REPO}/releases/latest"
fi

TMPDIR="${TMPDIR:-/tmp}"
DEST="${TMPDIR}/canvas-toolchain-${TAG}-${ASSET}"

echo "Latest release: ${TAG}"
echo "Asset: ${ASSET}"
echo
echo "${SECURITY_NOTE}"
echo

if [ "${DRY_RUN}" -eq 1 ]; then
  echo "[dry-run] would download: ${DOWNLOAD_URL}"
  echo "[dry-run] would save to: ${DEST}"
  echo "[dry-run] would launch installer (silent wizard not yet supported — GUI only)"
else
  echo "Downloading..."
  curl -fsSL -o "${DEST}" "${DOWNLOAD_URL}" || die "download failed"

  echo "Saved to ${DEST}"
  echo "Launching installer..."
  case "${OS}" in
    Darwin)
      open "${DEST}"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      start "" "${DEST}" 2>/dev/null || cmd.exe /c start "" "${DEST}" || die "could not launch ${DEST}"
      ;;
  esac
fi

cat <<EOF

Next steps
----------
1. Complete the installer wizard (defaults are fine).
2. Open your MCP client (Cursor, Claude Desktop, etc.).
3. Say: "I'm setting up Canvas Toolchain for the first time."

After planning a semester, verify shell-edit paths (from a canvas-toolchain clone):

  node scripts/shell-edit-doctor.mjs --courseId YOUR_COURSE --semesterId YOUR_SEMESTER

JSON report for agents:

  node scripts/shell-edit-doctor.mjs --courseId YOUR_COURSE --semesterId YOUR_SEMESTER --json

Docs: docs/2026-08-21-shell-edit-reliability.md
EOF
