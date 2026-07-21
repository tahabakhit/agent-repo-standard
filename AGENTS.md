# Asturlab agent entrypoint

Asturlab is Qawn's reusable instruments repository. Source here must be portable,
sanitized, independently understandable, and testable without Atlas or Maydan.
Mogador-specific topology, hostnames, credentials, private profiles, deployment
state, and operational evidence belong in Maydan.

Read `README.md`, `components.yaml`, then the nearest component `AGENTS.md`.
The signed tag `legacy-fixed-v1.0.11` preserves the final fixed Copier generator;
the current branch does not duplicate that obsolete interface.

Do not modify user-level agent configuration, installed skills, product-managed
state, remotes, releases, or live systems from this repository. Do not add a
placeholder component or shared framework without a qualifying implementation.

Validation:

```sh
make validate
git diff --check
```
