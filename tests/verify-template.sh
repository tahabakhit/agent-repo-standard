#!/usr/bin/env bash
# Render each supported profile and assert its public scaffold contract.
set -euo pipefail

if command -v copier >/dev/null 2>&1; then
  copier_cmd=(copier)
elif command -v uvx >/dev/null 2>&1; then
  copier_cmd=(uvx --from copier copier)
else
  echo "copier is required; install it with: uv tool install copier" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
template="$tmpdir/template"
cp -R "$root/." "$template"
rm -rf "$template/.git"

require_path() {
  [[ -e "$1" ]] || {
    echo "missing required path: $1" >&2
    exit 1
  }
}

render() {
  local repo_type="$1"
  local destination="$tmpdir/$repo_type"

  "${copier_cmd[@]}" copy --trust --defaults --quiet \
    --data project_name="Template check $repo_type" \
    --data project_slug="template-check-$repo_type" \
    --data description="Template render check" \
    --data repo_type="$repo_type" \
    --data package_name="template_check_$repo_type" \
    --data code_owner="" \
    --data project_inputs="Versioned source material" \
    --data project_outputs="Tracked deliverables" \
    --data non_goals="Disposable generated output" \
    "$template" "$destination"

  require_path "$destination/AGENTS.md"
  require_path "$destination/docs/reference/project-charter.md"
  require_path "$destination/data/README.md"
  require_path "$destination/deliverables/README.md"
  require_path "$destination/artifacts"
  require_path "$destination/artifacts/.gitkeep"
  grep -Fq 'Versioned source material' "$destination/docs/reference/project-charter.md"
  grep -Fq 'Tracked deliverables' "$destination/docs/reference/project-charter.md"
  grep -Fq 'Disposable generated output' "$destination/docs/reference/project-charter.md"
  grep -Fq 'docs/reference/project-charter.md' "$destination/README.md"
  grep -Fq 'docs/reference/project-charter.md' "$destination/AGENTS.md"
  grep -Fq '`data/` — versioned source material' "$destination/AGENTS.md"
  grep -Fq 'reference/project-charter.md' "$destination/docs/README.md"
  grep -Fqx '/data/local/' "$destination/.gitignore"
  grep -Fqx '/artifacts/*' "$destination/.gitignore"
  grep -Fqx '!/artifacts/.gitkeep' "$destination/.gitignore"
  git -C "$destination" check-ignore -q artifacts/generated.txt
  ! git -C "$destination" check-ignore -q artifacts/.gitkeep
  git -C "$destination" check-ignore -q data/local
  ! git -C "$destination" check-ignore -q data/README.md
  ! git -C "$destination" check-ignore -q deliverables/README.md

  git -C "$destination" add .
  git -C "$destination" -c user.name=template-check -c user.email=template-check@example.invalid commit -qm scaffold
  git clone -q "$destination" "$destination-clone"
  require_path "$destination-clone/artifacts/.gitkeep"

  if [[ "$repo_type" == data ]]; then
    grep -Fq 'Consumers fetch from this repo; data is never' "$destination/AGENTS.md"
    grep -Fq 'copied into consumers.' "$destination/AGENTS.md"
    grep -Fq 'When data and docs disagree, the data wins' "$destination/AGENTS.md"
    [[ ! -e "$destination/src" ]]
    [[ ! -e "$destination/tests" ]]
    [[ ! -e "$destination/pyproject.toml" ]]
  elif [[ "$repo_type" == workspace ]]; then
    grep -Fq 'Keep project boundaries explicit.' "$destination/AGENTS.md"
    [[ ! -e "$destination/src" ]]
    [[ ! -e "$destination/tests" ]]
    [[ ! -e "$destination/pyproject.toml" ]]
  else
    require_path "$destination/src/template_check_$repo_type"
    require_path "$destination/tests"
    if [[ "$repo_type" == library ]]; then
      require_path "$destination/pyproject.toml"
    else
      [[ ! -e "$destination/pyproject.toml" ]]
    fi
  fi
}

render data
render workspace
render code
render library
