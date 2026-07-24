# kb — knowledge-save CLI

`kb` saves markdown knowledge entries into a user-configured, git-managed store.
No embeddings, no vector search, no network access. TypeScript, run with Node ≥22
(native type-stripping — no build step needed to run).

## Quick start

```sh
# Point kb at a store (one-time):
export AMANAR_KB_DIR=~/knowledge

# Save an entry (global flags come before the verb):
echo "The walrus operator (:=) landed in Python 3.8." \
  | node knowledge/src/kb.ts save \
      --title "Python walrus operator" \
      --type fact \
      --tags "python,syntax" \
      --confidence high \
      --ttl 1y

# List stale entries:
node knowledge/src/kb.ts stale

# Re-validate all entries:
node knowledge/src/kb.ts validate

# Check store health:
node knowledge/src/kb.ts doctor
```

## Config precedence

| Priority | Source |
|----------|--------|
| 1 | `--store PATH` flag |
| 2 | `AMANAR_KB_DIR` environment variable |
| 3 | `./.knowledge/` directory in current working directory |
| 4 | `./.kb/config.yml` project pointer (`store: /path/to/store`) |
| 5 | `$XDG_CONFIG_HOME/amanar/kb.yml` or `~/.config/amanar/kb.yml` |
| 6 | Ask on first use (or exit 1 in non-interactive mode) |

## Store layout

```
<store>/
  .kb/
    config.yml         # commit_policy, ttl_policy
  <type>/
    <uuid>.md          # entry with YAML frontmatter
    _index.md          # link list for the type directory
  manifest.json        # machine-readable entry index
  log.md               # append-only event log
```

## Entry frontmatter schema

See `schema/entry.schema.json`. Required fields: `id`, `type`, `title`, `status`.

## Save pipeline (fail-closed, in order)

1. **Secret scan** — abort on AWS AKIA keys, PEM private key blocks, credential
   assignments, or high-entropy tokens; optional gitleaks when present.
2. **Schema validation** — abort on missing required fields or invalid enum values.
3. **Dedup** — lexical title/tag match against the manifest; archive the old entry
   with a forward pointer rather than silently overwriting.
4. **Link check** — warn on broken relative markdown links (non-blocking for MVP).
5. **Write** — entry file, `_index.md`, `log.md`, `manifest.json`.
6. **Git commit** — commits into the store only; configurable (`auto` | `off`).
