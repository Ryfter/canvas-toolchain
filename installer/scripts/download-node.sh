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
