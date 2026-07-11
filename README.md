# agent-repo-standard

A [copier](https://copier.readthedocs.io) template that scaffolds repositories to
a single, defined **Repo Standard** — the composition of three mature standards.
The committed tree is tool- and host-agnostic; any toolchain (spec-driven CLI,
enforcement plugin) is a per-developer local choice, never committed.

- **[AGENTS.md](https://agents.md)** — agent instruction entry point; also holds
  principles + quality gates (the one file auto-loaded across harnesses).
- **[Diátaxis](https://diataxis.fr)** — human docs (`docs/{tutorials,how-to,reference,explanation}/`).
- **[MADR](https://adr.github.io)** — decisions (`docs/decisions/adrs/`).

Optional local agent tooling is materialized per developer and git-ignored, never
committed — see "Agent setup" in the standard.

The full standard text is [`template/REPO-STANDARD.md`](template/REPO-STANDARD.md);
it is stamped into every generated repo so collaborators have it in-repo.

## Use it

```bash
# install copier once
uv tool install copier

# scaffold a new repo (--trust enables post-gen tasks: git init, src/ scaffold)
copier copy --trust gh:tahabakhit/agent-repo-standard ./my-new-repo
#   …or from a local clone:
# copier copy --trust ~/projects/personal/repos/agent-repo-standard ./my-new-repo

# later, pull standard updates into an existing repo
cd my-new-repo && copier update --trust
```

Or use the wrapper: `bin/new-repo.sh <dest>`.

## Repo types

`repo_type` tailors the output: `data` (source-of-truth data/config, no `src/`),
`workspace` (docs, research, or design, no `src/`), `code` (`src/` + `tests/` +
TDD), and `library` (adds packaging). All types share the AGENTS.md + Diátaxis +
MADR spine, plus `data/` for versioned source material, `deliverables/` for
versioned final outputs, and git-ignored `artifacts/` for generated output.

## Adopting in an existing repo

Run `copier copy --trust <this> .` in the repo and resolve diffs, or copy
`template/REPO-STANDARD.md` plus the `docs/` skeleton by hand. The standard is
also referenced from global agent instructions (`~/.claude/CLAUDE.md`,
`~/.codex/AGENTS.md`).
