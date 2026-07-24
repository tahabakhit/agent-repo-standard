# Pi extension component

Boundary: portable Pi extension; loads skills + injects a light bootstrap + in-session backpressure. No estate specifics.

Paths owned by this component: `harness/pi/` only. Do not touch `components.yaml`, `Makefile`, or `README.md` at repo root.

Validation: `npm test --prefix harness/pi`

The test command runs `tsc --noEmit` (typecheck) then `node --test` on the pure-function unit tests. The Pi wiring in `src/extension.ts` cannot be integration-tested without a live Pi session; that is expected and acceptable.

The `@earendil-works/pi-coding-agent` SDK is listed as a devDependency. If the package is not installed (offline CI), `src/pi.d.ts` provides minimal ambient declarations so `tsc --noEmit` still passes. Note this in the component validation if needed.

Keep all source portable: no hostnames, credentials, or references to other repos.
