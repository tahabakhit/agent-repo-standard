---
name: amanar-worktrees
description: Set up an isolated workspace before feature work or executing an implementation plan — detect existing isolation, prefer the harness's native worktree tool, fall back to a git worktree, and verify a clean baseline.
---

# Amanar Worktrees

Ensure work happens in an isolated workspace so the current branch is protected.
Detect existing isolation first, then use native tools, then fall back to git —
never fight the harness.

## Step 0 — Detect existing isolation

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
git rev-parse --show-superproject-working-tree 2>/dev/null   # submodule guard
```

If `GIT_DIR != GIT_COMMON` and this is not a submodule, you are already in a
linked worktree — skip to Step 2. If they are equal, ask for consent before
creating one: it protects the current branch from changes.

## Step 1 — Create an isolated workspace

Prefer the harness's native worktree mechanism if one exists (e.g. an
EnterWorktree tool or a `/worktree` command). Only if none exists, fall back to
git:

```bash
# directory: honour a declared preference, else an existing .worktrees/, else default
git check-ignore -q .worktrees 2>/dev/null || echo "add .worktrees/ to .gitignore and commit first"
git worktree add ".worktrees/$BRANCH" -b "$BRANCH" && cd ".worktrees/$BRANCH"
```

On permission errors, work in the current directory instead.

## Step 2 — Project setup

Auto-detect the toolchain (Node, Rust, Python, Go) from its config files and run
the install/setup command.

## Step 3 — Verify a clean baseline

Run the project's tests and report the full path, test count, and readiness
before starting the work.

## Attribution

Adapted from `using-git-worktrees` by Jesse Vincent (obra/superpowers, MIT).
