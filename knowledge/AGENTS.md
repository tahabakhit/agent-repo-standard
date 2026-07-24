# knowledge component

`amanar-knowledge` is a portable, dependency-free knowledge-save tool.

**Boundary rules:**

- Stdlib only — no third-party packages, no pip requirements.
- Stateless CLI: the tool carries no paths or credentials.  All authority flows
  from explicit config (flag / env / project / user XDG).
- The store is user-owned: the tool writes only inside the directory the user
  designates as their store.  It never modifies this repo, the caller's working
  tree, or any system directory.
- Secret-scan before write — the SAVE PIPELINE aborts if heuristics detect
  credentials in the candidate content.
- Git commits target only the store directory, never the caller's repository.
- Tests must use `tempfile.TemporaryDirectory` and a temporary HOME / XDG
  environment — never the real repo or the user's config directory.

Run tests with:

```sh
python3 -m unittest discover -s knowledge/tests
```
