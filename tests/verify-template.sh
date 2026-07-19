#!/usr/bin/env bash
# Render every supported legacy profile and execute its declared validation gate.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
copier_requirement="$(<"$root/tests/requirements-ci.txt")"
copier_version="${copier_requirement#copier==}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

if command -v copier >/dev/null 2>&1; then
  copier_cmd=(copier)
else
  if ! command -v uvx >/dev/null 2>&1; then
    echo "Copier $copier_version or uvx is required" >&2
    exit 1
  fi
  copier_cmd=(
    uvx
    --cache-dir "$tmpdir/uv-cache"
    --isolated
    --from "$copier_requirement"
    copier
  )
fi

actual_version="$("${copier_cmd[@]}" --version | awk '{print $NF}')"
if [[ "$actual_version" != "$copier_version" ]]; then
  echo "expected Copier $copier_version, found $actual_version" >&2
  exit 1
fi
printf 'using Copier %s\n' "$actual_version"

template="$tmpdir/template"
cp -R "$root/." "$template"
rm -rf "$template/.git"

require_path() {
  [[ -e "$1" ]] || {
    echo "missing required path: $1" >&2
    exit 1
  }
}

require_not_ignored() {
  local repository="$1"
  local path="$2"
  if git -C "$repository" check-ignore -q "$path"; then
    echo "tracked path is unexpectedly ignored: $path" >&2
    exit 1
  fi
}

render_profile() {
  local repo_type="$1"
  local destination="$2"

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
}

declared_validation_command() {
  awk '
    /^## Setup and validation$/ { in_setup = 1; next }
    in_setup && /^```bash$/ { in_code = 1; next }
    in_code && /^```$/ { exit }
    in_code { print }
  ' "$1/README.md"
}

verify_profile() {
  local repo_type="$1"
  local destination="$tmpdir/render-$repo_type"
  local declared_command

  render_profile "$repo_type" "$destination"

  require_path "$destination/AGENTS.md"
  require_path "$destination/bin/validate-repository.sh"
  require_path "$destination/docs/reference/project-charter.md"
  require_path "$destination/data/README.md"
  require_path "$destination/deliverables/README.md"
  require_path "$destination/artifacts/.gitkeep"
  [[ -x "$destination/bin/validate-repository.sh" ]]

  grep -Fq 'Versioned source material' "$destination/docs/reference/project-charter.md"
  grep -Fq 'Tracked deliverables' "$destination/docs/reference/project-charter.md"
  grep -Fq 'Disposable generated output' "$destination/docs/reference/project-charter.md"
  grep -Fq 'docs/reference/project-charter.md' "$destination/README.md"
  grep -Fq 'docs/reference/project-charter.md' "$destination/AGENTS.md"
  grep -Fq "\`data/\` — versioned source material" "$destination/AGENTS.md"
  grep -Fq 'reference/project-charter.md' "$destination/docs/README.md"
  grep -Fqx '/data/local/' "$destination/.gitignore"
  grep -Fqx '/artifacts/*' "$destination/.gitignore"
  grep -Fqx '!/artifacts/.gitkeep' "$destination/.gitignore"
  git -C "$destination" check-ignore -q artifacts/generated.txt
  require_not_ignored "$destination" artifacts/.gitkeep
  git -C "$destination" check-ignore -q data/local
  require_not_ignored "$destination" data/README.md
  require_not_ignored "$destination" deliverables/README.md

  declared_command="$(declared_validation_command "$destination")"
  if [[ "$declared_command" != "bin/validate-repository.sh" ]]; then
    echo "unexpected validation command for $repo_type: $declared_command" >&2
    exit 1
  fi
  grep -Fq 'bin/validate-repository.sh' "$destination/AGENTS.md"

  if [[ "$repo_type" == data ]]; then
    grep -Fq 'Consumers fetch from this repo; data is never' "$destination/AGENTS.md"
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
    require_path "$destination/src/template_check_$repo_type/__init__.py"
    require_path "$destination/tests/test_package.py"
    require_path "$destination/pyproject.toml"
    grep -Fq 'requires-python = ">=3.11"' "$destination/pyproject.toml"
    grep -Fq 'dependencies = []' "$destination/pyproject.toml"
    grep -Fq 'uses only the' "$destination/README.md"
    grep -Fq 'Python standard library' "$destination/README.md"
  fi

  (cd "$destination" && "$declared_command")

  git -C "$destination" add .
  git -C "$destination" -c user.name=template-check -c user.email=template-check@example.invalid commit -qm scaffold
  git clone -q "$destination" "$destination-clone"
  require_path "$destination-clone/artifacts/.gitkeep"
  require_path "$destination-clone/bin/validate-repository.sh"
  (cd "$destination-clone" && bin/validate-repository.sh)
  printf 'render and generated validation passed: %s\n' "$repo_type"
}

verify_nonempty_destination_rejection() {
  local destination="$tmpdir/nonempty-destination"
  local output="$tmpdir/nonempty-output.txt"
  mkdir -p "$destination"
  printf '%s\n' 'user-owned-content' > "$destination/user-file.txt"

  if "$root/bin/new-repo.sh" "$destination" >"$output" 2>&1; then
    echo "legacy wrapper accepted a non-empty destination" >&2
    exit 1
  fi

  grep -Fq 'destination is not empty' "$output"
  [[ "$(<"$destination/user-file.txt")" == "user-owned-content" ]]
  [[ "$(find "$destination" -mindepth 1 -maxdepth 1 -print | wc -l | tr -d ' ')" == 1 ]]
  printf 'non-empty destination rejected without modification\n'
}

verify_profile data
verify_profile workspace
verify_profile code
verify_profile library
verify_nonempty_destination_rejection
