# Architecture Decision Records

Durable decisions in [MADR](https://adr.github.io) format. One file per decision,
numbered `NNNN-slug.md`, **never renumbered**. Superseded decisions move to
[`archive/`](archive/) and are never deleted — history is provenance.

- New decision → copy [`adr-template.md`](adr-template.md) to the next number.
- A superseding decision gets a **new** number and links back to the one it replaces.

`ADR NNNN` citations elsewhere in the repo point here.
