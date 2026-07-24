# Amanar agent entrypoint

Amanar is a reusable, portable agent-kit. Source here must be portable, sanitized,
and independently understandable. Personal or environment-specific values
(hostnames, credentials, private profiles, deployment state, machine paths) never
belong in this public repository; they live in a gitignored local overlay.

Read `README.md`, then the nearest component `AGENTS.md` under `src/`.

One CLI (`bin/amanar`) is the single funnel for every hook and tool. One root
`package.json` / `tsconfig.json` builds the whole tree; Node runs `.ts` directly
via type-stripping, so there is no build step. `src/kernel/` must stay
import-self-contained — it is copy-distributed into consumer repos at
`.amanar/kernel/`.

The signed tag `legacy-fixed-v1.0.11` preserves the final fixed generator
interface; the current branch does not duplicate that obsolete interface.

Do not modify user-level agent configuration, installed skills, remotes, releases,
or live systems from this repository. Do not add a placeholder component or shared
framework without a qualifying implementation.

Validation:

```sh
make validate
```
