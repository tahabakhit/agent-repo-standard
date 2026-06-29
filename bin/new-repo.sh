#!/usr/bin/env bash
# Scaffold a new repo from the agent-repo-standard template.
# Usage: new-repo.sh <destination-dir>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:?usage: new-repo.sh <destination-dir>}"
if ! command -v copier >/dev/null 2>&1; then
  echo "copier not found. Install with: uv tool install copier" >&2
  exit 1
fi
exec copier copy --trust "$HERE" "$DEST"
