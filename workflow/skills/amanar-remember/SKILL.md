---
name: amanar-remember
description: Capture a reusable knowledge entry into the configured knowledge store — use when you would otherwise re-explain the same thing later, when a mistake has been diagnosed and the fix is worth preserving, when a decision or constraint has been confirmed, or when a fact/pattern recurs across sessions.
---

# Amanar Remember

Save the knowledge entry via the knowledge-save tool.

Before saving, confirm the entry is reusable across sessions (not ephemeral
working state), contains no credentials or secrets, and is scoped to a single
idea or decision.

Choose the most specific type: `fact`, `decision`, `pattern`, `reference`, or
`procedure`. Tag generously — tags drive future retrieval. Set provenance to
`agent` when the model produced the content, `human` when the user supplied it,
`distilled` when it was synthesized from multiple sources.

The save pipeline runs a secret scan and schema gate before writing; it
commits automatically to the knowledge store (not to the working code repo).

## Concrete invocation (current implementation)

The knowledge-save tool is the kb CLI. Pipe content on stdin:

```
echo "The entry body in markdown." | \
  python3 <repo>/knowledge/kb.py save \
    --title "Short, search-friendly title" \
    --type fact \
    --tags tag1,tag2 \
    --provenance agent \
    --no-interactive
```

The store is user-configured via `--store`, `AMANAR_KB_DIR`, or
`~/.config/amanar/kb.yml`. Saving is full-auto-commit behind fail-closed
gates and writes only to the knowledge store.

> Note: the kb CLI is the current Python implementation. The abstract action
> ("save the knowledge entry via the knowledge-save tool") survives a future
> TypeScript migration unchanged.
