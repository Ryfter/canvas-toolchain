# npm publish — OIDC trusted publishing (not NPM_TOKEN)

**Date:** 2026-08-22  
**Status:** **SHIPPED** — v2.2.1 live on npm  
**Commits:** #157 (`91c0327`), #158 (`f8b8d54`), #159 (`977e770`), #160 (`a9d3f1e`)

---

## Decision — OIDC over long-lived NPM_TOKEN

| | |
|---|---|
| **Choice** | GitHub Actions **Trusted Publishing (OIDC)** to npm |
| **Rejected** | Blocking release on granular `NPM_TOKEN` repo secret setup and rotation |
| **Reasoning** | Kevin spent significant time on npm auth friction. OIDC eliminates long-lived token storage in GitHub secrets; npm trusts the workflow identity directly. Idempotent per-workspace publish (#160) prevents double-publish failures on retag |
| **Outcome** | v2.2.1 first release via OIDC; installer-first README (#161) reflects live npm + native installer |

---

## Technical path

1. `permissions: id-token: write` in release workflow
2. Drop `setup-node` `registry-url` so OIDC trusted publishing fires (#159)
3. `--provenance` on publish for supply-chain transparency
4. Per-workspace idempotent version check (#160)

---

## Agent guidance (2026-08-22 onward)

| Do | Don't |
|---|---|
| Cite v2.2.1 as live on npm | Cite `NPM_TOKEN` as release blocker |
| Point professors to installer-first path (#161) | Assume `npx canvas-toolchain` is 404 |
| Read `docs/npm-publishing.md` for OIDC setup | Recommend Bypass-2FA granular token unless OIDC unavailable |

---

## Related open work

PR #163 (`feat/install-sh-doctor-json`): `install.sh` one-liner + doctor `--json`/`--strict` — install UX, not publish auth.

---

## Kevin confirmation

Kevin explicitly corrected factory blockers 2026-08-22: npm auth was fixed morning of 2026-08-21 via OIDC; NPM_TOKEN issue is **obsolete context**.
