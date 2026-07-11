# Implementation Plan: Structured Project Boundaries

## Overview

Evolve the Copier template from a documentation spine into a broader, more
opinionated project scaffold. Every generated repository will declare its scope
and receive clear locations for source material, deliverables, and generated
output. The existing `data` Copier value retains its source-of-truth semantics
for update compatibility; a separate `workspace` profile covers broad non-code
projects.

## Decisions

- Generate `data/`, `deliverables/`, and `artifacts/` for every profile.
- Track source material and final deliverables; ignore local/restricted input and
  generated/transient output.
- Generate `docs/reference/project-charter.md` from required short Copier
  answers: inputs, outputs, and non-goals.
- Keep the existing `data`, `code`, and `library` values. Add `workspace` for
  docs, research, and design without weakening the `data` source-of-truth rule.
- Do not add a generic `work/` or `scratch/` directory.

## Dependency Graph

```text
Render-check script
        |
        +-- Copier contract and generated directory rules
        |             |
        |             +-- Charter and generated-repo navigation
        |
        +-- Template documentation and final end-to-end verification
```

## Tasks

### Phase 1: Verification Foundation

#### Task 1: Add a three-profile render check

**Description:** Add one shell-based check that renders `data`, `code`, and
`library` repositories with explicit Copier answers, then verifies their common
and profile-specific files.

**Acceptance criteria:**

- [x] The check exits non-zero when Copier is unavailable or a required path is
  missing.
- [x] It verifies the generated project charter, `data/`, `deliverables/`, and
  `artifacts/` in every profile.
- [x] It verifies `src/` and `tests/` only for code and library profiles, and
  `pyproject.toml` only for library.

**Verification:** `tests/verify-template.sh`

**Dependencies:** None

**Files likely touched:**

- `tests/verify-template.sh`

**Estimated scope:** S

### Phase 2: Template Contract

#### Task 2: Add boundary prompts and generated locations

**Description:** Extend Copier’s required answers with concise `project_inputs`,
`project_outputs`, and `non_goals` fields. Materialize the universal locations,
and encode the tracked-versus-local boundary in the generated `.gitignore`.

**Acceptance criteria:**

- [x] Copier requires all three boundary answers.
- [x] Every render creates `data/`, `deliverables/`, and `artifacts/`.
- [x] `data/local/` and `artifacts/` are ignored; `data/` and `deliverables/`
  remain trackable.
- [x] The `data` profile retains its source-of-truth contract, and the non-code
  workspace option is a separate `workspace` value.

**Verification:** `tests/verify-template.sh` and `git diff --check`

**Dependencies:** Task 1

**Files likely touched:**

- `copier.yml`
- `template/.gitignore.jinja`
- `template/data/README.md.jinja`
- `template/deliverables/README.md`
- `template/artifacts/.gitkeep`

**Estimated scope:** M

#### Task 3: Generate the project charter and connect entrypoints

**Description:** Add a reference document that states the generated project’s
inputs, outputs, and non-goals. Link to it from the README, AGENTS entrypoint,
and docs map; revise the non-code AGENTS guidance so it applies to all workspace
projects, not only data-source repositories.

**Acceptance criteria:**

- [x] `docs/reference/project-charter.md` contains all three Copier answers.
- [x] README, AGENTS, and `docs/README.md` link to the charter.
- [x] The non-code profile’s principles and work map describe the broader
  workspace scope without weakening data-source-of-truth guidance where relevant.

**Verification:** `tests/verify-template.sh`, targeted rendered-file inspection,
and `git diff --check`

**Dependencies:** Task 2

**Files likely touched:**

- `template/docs/reference/project-charter.md.jinja`
- `template/README.md.jinja`
- `template/AGENTS.md.jinja`
- `template/docs/README.md.jinja`

**Estimated scope:** M

### Phase 3: Standard Alignment and Release Check

#### Task 4: Align the standard documentation and validate all profiles

**Description:** Update the template’s own README and Repo Standard so the
canonical tree and placement rules match generated repositories, then run the
full render check.

**Acceptance criteria:**

- [x] The canonical tree documents `data/`, `deliverables/`, and `artifacts/`.
- [x] “What goes where” distinguishes source material, final deliverables, and
  generated/transient output.
- [x] The README describes the workspace profile and universal boundary
  structure.

**Verification:** `tests/verify-template.sh`, `git diff --check`, and a clean
`git status --short` review of intended changes.

**Dependencies:** Tasks 1–3

**Files likely touched:**

- `README.md`
- `template/REPO-STANDARD.md`

**Estimated scope:** S

## Checkpoints

### After Task 1

- [x] The verification command is runnable and fails on a missing generated path.

### After Tasks 2–3

- [x] All three profiles render with the new boundary structure and charter.
- [x] The tracked versus ignored boundary is correct in a generated repository.

### Complete

- [x] `tests/verify-template.sh` passes.
- [x] `git diff --check` passes.
- [x] Generated docs distinguish data-source and workspace profile rules.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Weakening existing data-repo semantics breaks updates | High | Retain the `data` value and its source-of-truth rule; add `workspace` separately. |
| Ignored empty folders disappear from Git | Medium | Create them at render time and verify their presence in the render check. |
| Charter duplicates agent policy | Medium | Limit it to inputs, outputs, and non-goals; link from entrypoints instead of repeating policy. |
| Copier is unavailable in a contributor environment | Low | The check fails clearly with the existing documented install command. |
