# agent-repo-standard

A [copier](https://copier.readthedocs.io) template that scaffolds repositories to
a single, defined **Repo Standard** — the composition of four mature standards:

- **[AGENTS.md](https://agents.md)** — agent instruction entry point.
- **[spec-kit](https://github.com/github/spec-kit) + spex** — spec-driven workflow (`.specify/`, `specs/`).
- **[Diátaxis](https://diataxis.fr)** — human docs (`docs/{tutorials,how-to,reference,explanation}/`).
- **[MADR](https://adr.github.io)** — decisions (`docs/decisions/adrs/`).

The full standard text is [`template/REPO-STANDARD.md`](template/REPO-STANDARD.md);
it is stamped into every generated repo so collaborators have it in-repo.

## Use it

```bash
# install copier once
uv tool install copier

# scaffold a new repo (--trust enables post-gen tasks: git init, src/ scaffold, spec-kit)
copier copy --trust /Users/taha.bakhit@m10s.io/projects/personal/repos/agent-repo-standard ./my-new-repo
#   …or, once pushed to GitHub:
# copier copy --trust gh:<you>/agent-repo-standard ./my-new-repo

# later, pull standard updates into an existing repo
cd my-new-repo && copier update --trust
```

Or use the wrapper: `bin/new-repo.sh <dest>`.

## Repo types

`repo_type` tailors the output: `data` (source-of-truth, no `src/`), `code`
(`src/` + `tests/` + TDD), `library` (adds packaging). All types share the
AGENTS.md + spec-kit + Diátaxis + MADR spine.

## Adopting in an existing repo

Run `copier copy --trust <this> .` in the repo and resolve diffs, or copy
`template/REPO-STANDARD.md` plus the `docs/` skeleton by hand. The standard is
also referenced from global agent instructions (`~/.claude/CLAUDE.md`,
`~/.codex/AGENTS.md`).
