# Asturlab Synology MCP

A small read-only MCP wrapper around the pinned `synology-api` client. It exposes
sanitized system, storage, share, package, and file-station inspection without
embedding an estate or deployment profile.

Configuration uses `SYNOLOGY_HOST`, `SYNOLOGY_USERNAME`, `SYNOLOGY_PASSWORD`,
and optional DSM/OTP variables documented in the source. If `SYNOLOGY_OP_ITEM`
is set, the wrapper invokes `OP_CLI` (default `op`) and optionally
`SYNOLOGY_OP_VAULT`; it stores no secret values.

Run tests from an environment with the locked dependencies:

```sh
uv run python -m unittest discover -s tests
```

Source provenance: migrated from Atlas/Maydan operational component
`mogador-storage-synology` at Atlas commit `7b2260c`. Mogador launch and smoke
configuration remains in Maydan.
