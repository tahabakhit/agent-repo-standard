# Task spec — the executable-plan front-end

A task spec turns a design into an executable, verifiable contract. It has five
parts, which compile onto the deterministic workflow contract:

| Task-spec part | Contract field |
|---|---|
| GOAL | `objective` |
| SCOPE | `scope` |
| BLAST-RADIUS | `authority.repositoryWrites` / `authority.liveEffects` + `exclusions` |
| VERIFY | `checks` (command + `outputContains` / `minTests` / `testParser`) |
| DONE-WHEN | every check exits 0 and `verify` passes (`expectedExit: 0`) |

Author it as compact JSON, then compile:

```json
{
  "id": "slug-recovery",
  "goal": "Repair slugify so the existing suite passes",
  "scope": ["slug.py"],
  "artifacts": ["slug.py"],
  "blastRadius": {"writes": true, "liveEffects": false, "exclusions": ["tests/"]},
  "verify": [
    {"id": "tests", "run": "python3 -m unittest discover -s tests -v",
     "contains": ["OK"], "minTests": 4, "parser": "unittest"}
  ]
}
```

```sh
node .amanar/kernel/src/tools/compileTaskSpec.ts spec.json --out .amanar/workflow.json
```

The compiler fills each check's machinery by default — `expectedExit: 0`,
`timeout: 120`, `minTests: 0`, `parser: none`, `liveEffect: false` — and validates
the result with the kernel's own schema, so a malformed plan fails before execution.
Set `parser` whenever `minTests > 0`. Run the workflow with `$amanar-workflow`.

This reconciles the RPI phases onto the existing skills: Research is
`$amanar-inquire`, Plan is `$amanar-design` (this spec), Implement is
`$amanar-workflow`.
