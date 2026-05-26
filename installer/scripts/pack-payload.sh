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
