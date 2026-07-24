# knowledge component

`amanar-knowledge` is a portable, config-driven knowledge-save tool, written in
TypeScript (Node ≥22, run directly via native type-stripping).

**Boundary rules:**

- No runtime dependencies; devDependencies limited to `typescript` and
  `@types/node`. No network access, no embeddings, no vector store.
- Stateless CLI: the tool carries no paths or credentials. All authority flows
  from explicit config (flag / env / project / user XDG).
- The store is user-owned: the tool writes only inside the directory the user
  designates as their store. It never modifies this repo, the caller's working
  tree, or any system directory.
- Secret-scan before write — the SAVE PIPELINE aborts if heuristics detect
  credentials in the candidate content; optional gitleaks runs as defense-in-depth
  when present.
- Git commits target only the store directory, never the caller's repository.
- Tests must use `fs.mkdtemp` (os.tmpdir) and a temporary HOME / XDG environment —
  never the real repo or the user's config directory.

Run tests with:

```sh
npm ci --prefix knowledge   # one-time: install typescript + @types/node
npm test --prefix knowledge # tsc --noEmit + node --test
```
