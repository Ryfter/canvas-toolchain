# Payload

CI populates this directory immediately before `go build` runs:

- `installer-payload.tar.gz` — built monorepo (no `node_modules`).
- `node-runtime.tar.gz` — per-OS Node 18 LTS distribution from nodejs.org.

For local dev with no CI, place suitable tarballs here yourself. The Go build
tag `dev` exists for UI-only smoke runs that bypass the embed.
