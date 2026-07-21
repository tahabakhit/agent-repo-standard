# Synology MCP component

This component is a portable read-only DSM adapter. Keep hostnames, addresses,
vault names, credentials, launch wrappers, and estate-specific smoke checks out
of this directory. Authentication is supplied at runtime through environment
variables; tests use fakes and must not contact a live NAS.
