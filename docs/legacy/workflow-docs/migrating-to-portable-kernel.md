# Migrating to the portable workflow kernel

## Compatibility window

All five explicit skill names remain available for the first kernel release.
Only `amanar-workflow` changes its execution boundary. Deprecations are not
silent, and no host adapter is globally installed by this repository.

| Existing skill | Decision | Replacement or retained purpose |
|---|---|---|
| `amanar-workflow` | replace | Thin adapter invokes the schema/controller. |
| `amanar-orchestrate` | retire from portable policy | One-release deprecated Codex-native recipe; use host-native scheduling plus `amanar-workflow`. |
| `amanar-inquire` | keep | Small, non-executing discovery and success-contract guidance. |
| `amanar-design` | keep | Domain design guidance independent of controller state. |
| `amanar-assure` | split | Deterministic gates move to contracts; reusable adversarial/test guidance remains. |

The retained inquiry and design skills have non-behavioral purposes: they shape
requirements and designs but never assert execution completion. Assurance's
remaining behavior is tested as prose-bound review guidance; all deterministic
completion logic is exercised by controller tests.

## Before and after

Before, an invocation asked an agent to infer rigor, maintain prose state, run
checks directly, and narrate completion. After, create `.amanar/workflow.json`
and invoke `$amanar-workflow`. The host may still plan or delegate natively,
but the controller alone begins mutation, runs declared checks, records receipts,
and derives verified state.

Old direct check:

```text
Run python3 -m unittest discover -s tests -v and report that it passed.
```

Contract check:

```json
{
  "id": "tests",
  "command": "python3 -m unittest discover -s tests -v",
  "expectedExit": 0,
  "outputContains": ["OK"],
  "timeoutSeconds": 120,
  "minTests": 1,
  "testParser": "unittest",
  "liveEffect": false
}
```

Then run `amanar-workflow run-check tests` and
`amanar-workflow verify`. A model statement cannot substitute for either.

## Rollback

1. Disable or remove project adapter copies; do not alter user-level host config.
2. Leave contracts readable and run their acceptance commands manually.
3. Revert the kernel commits on the implementation branch without touching task
   repositories, `.amanar/run/` evidence exports, or host configuration.
4. During the compatibility window, invoke the retained skills directly for
   inquiry, design, Codex-native coordination, or assurance.

Remove `amanar-orchestrate` after one released kernel version only when no
active workflow depends on its explicit name.
