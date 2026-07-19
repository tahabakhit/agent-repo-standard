#!/usr/bin/env bash
# Generate a new repo with the optional legacy fixed-layout template.
# Usage: new-repo.sh <missing-or-empty-destination-dir>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:?usage: new-repo.sh <destination-dir>}"

if [[ -e "$DEST" && ! -d "$DEST" ]]; then
  echo "refusing legacy generation: destination exists and is not a directory: $DEST" >&2
  exit 2
fi

if [[ -d "$DEST" ]] && find "$DEST" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  echo "refusing legacy generation: destination is not empty: $DEST" >&2
  echo "Use \$scaffold audit or \$scaffold adopt for an existing repository." >&2
  exit 2
fi

if ! command -v copier >/dev/null 2>&1; then
  echo "copier not found; this generator requires the version pinned in tests/requirements-ci.txt" >&2
  exit 1
fi

EXPECTED_COPIER="$(<"$HERE/tests/requirements-ci.txt")"
EXPECTED_COPIER="${EXPECTED_COPIER#copier==}"
ACTUAL_COPIER="$(copier --version | awk '{print $NF}')"
if [[ "$ACTUAL_COPIER" != "$EXPECTED_COPIER" ]]; then
  echo "expected Copier $EXPECTED_COPIER, found $ACTUAL_COPIER" >&2
  exit 1
fi

exec copier copy --trust "$HERE" "$DEST"
