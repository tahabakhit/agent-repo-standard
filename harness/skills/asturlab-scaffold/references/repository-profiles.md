# Repository profile guide

Profiles are composable signals, not mutually exclusive templates.

## Application or service

Likely needs:

- runtime/source layout chosen by the framework;
- tests and lint/type checks;
- configuration and secret boundaries;
- architecture map when multiple domains exist;
- operational runbooks and observability only when deployed;
- CI/release documentation when used.

Do not force a language-neutral `src/` layout over framework conventions.

## Library or package

Likely needs:

- public API and compatibility policy;
- package metadata for the actual ecosystem;
- tests and examples;
- release/versioning procedure;
- API reference proportional to the surface.

## CLI or developer tool

Likely needs:

- command contract and examples;
- exit codes and stdout/stderr policy;
- installation and PATH behavior;
- integration tests from outside the source directory;
- credential/configuration boundaries.

## Infrastructure or operations

Likely needs:

- inventory and current-state authority;
- declarative configuration;
- change, validation, and rollback procedures;
- live-impact and approval boundaries;
- runbooks;
- secret and identity handling;
- execution reports for material changes.

Avoid treating generated plans as operational truth.

## Data or configuration source of truth

Likely needs:

- schema and provenance;
- validation;
- consumer contract;
- tracked/local/generated boundaries;
- migration and compatibility rules.

Do not add application scaffolding unless the repository actually ships software.

## Knowledge, documentation, or research

Likely needs:

- navigation/index;
- provenance and source manifests;
- canonical versus session/draft boundaries;
- content validation;
- decision or status history only where useful.

A full Diátaxis tree is optional; use it only when readers have all four kinds of
documentation.

## Monorepo

Likely needs:

- root map and global invariants;
- scoped `AGENTS.md` files near domains;
- package/service ownership;
- shared versus local validation;
- dependency and release boundaries.

Avoid duplicating every root rule in each package.

## Existing-repository adoption

Start with:

1. a lean root `AGENTS.md` map;
2. exact setup and validation commands;
3. authority and sensitive-data boundaries;
4. links to existing docs;
5. scoped instructions only where behavior differs.

Do not perform a wholesale tree migration unless the user explicitly accepts a
separate migration plan.
