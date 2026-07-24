# vendor/

Machine-maintained mirrors. **Do not edit files here by hand.**

- `classify.ts` — verbatim copy of `harness/pi/src/classify.ts`, the single
  source of truth for backpressure deny rules. Claude Code packages only the
  plugin root (`harness/claude`), and a code import cannot reach the sibling
  `harness/pi/` tree, so the classifier must physically live under the plugin
  root or the PreToolUse hook fails with `ERR_MODULE_NOT_FOUND` once installed.

Regenerate after changing the canonical source:

```sh
node harness/claude/scripts/vendor-classify.mjs
```

`tests/vendor-classify.test.ts` fails the build if this mirror drifts from the
canonical source.
