#!/usr/bin/env bash
#
# pack-payload.sh — Build the canvas-toolchain monorepo and pack it for
# embedding into the installer binary. Expects to be run from the repo root.
#
# Usage:
#   bash installer/scripts/pack-payload.sh
#
# Environment:
#   PACK_PAYLOAD_OUT         output path (default
#                            <repo>/installer/payload/installer-payload.tar.gz)
#   PACK_PAYLOAD_SKIP_BUILD  set to 1 to pack the tree as it is. A skipped build
#                            packs whatever dist/ is already on disk, so it is
#                            NOT a release build — for tests and dry runs only.
#
# Output:
#   installer/payload/installer-payload.tar.gz

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT" || exit 1

PAYLOAD_OUT="${PACK_PAYLOAD_OUT:-$REPO_ROOT/installer/payload/installer-payload.tar.gz}"
SKIP_BUILD="${PACK_PAYLOAD_SKIP_BUILD:-0}"

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "==> Installing monorepo deps"
  npm ci

  echo "==> Building monorepo"
  npm run build
else
  echo "==> PACK_PAYLOAD_SKIP_BUILD=1 — packing the tree as it is (not a release build)"
fi

STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

# The payload ships a BUILT dist/, so nothing may build again on the client. npm
# runs the root `prepare` script on every install (npm install and npm ci alike),
# and this repo's `prepare` is `npm run build` — shipping it would put tsc back
# on the professor's laptop, which is exactly what this payload exists to avoid.
# Strip that one script; deps, workspaces, allowScripts and overrides must all
# reach the client unchanged.
echo "==> Stripping the dev-only 'prepare' script from the packed package.json"
PAYLOAD_PKG_OUT="$STAGE/package.json" node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (pkg.scripts) delete pkg.scripts.prepare;
fs.writeFileSync(process.env.PAYLOAD_PKG_OUT, JSON.stringify(pkg, null, 2) + "\n");
'
cp package-lock.json tsconfig.base.json "$STAGE/"

mkdir -p "$(dirname "$PAYLOAD_OUT")"
echo "==> Packing payload to $PAYLOAD_OUT"

# One tar invocation, two roots: the built packages tree from the checkout, then
# the root manifests from $STAGE, so the stripped package.json is the one packed.
# It must be a single archive — bsdtar stops reading at the first end-of-archive
# marker, so concatenated members would be silently dropped on macOS. Plain -c
# (never -f) keeps tar off the flag Git Bash mis-reads as a remote archive spec
# (Windows-style D:/... paths), and stays portable to GNU tar. The second -C is
# absolute because each -C is resolved against the last one.
tar \
  --exclude='*/node_modules' \
  --exclude='node_modules' \
  --exclude='packages/canvas-design-studio/output' \
  --exclude='packages/curriculum-intelligence/output' \
  -c \
  -C "$REPO_ROOT" packages \
  -C "$STAGE" package.json package-lock.json tsconfig.base.json \
  | gzip > "$PAYLOAD_OUT"

SIZE=$(stat -c%s "$PAYLOAD_OUT" 2>/dev/null || stat -f%z "$PAYLOAD_OUT")
echo "==> Payload size: $((SIZE / 1024 / 1024)) MB"
