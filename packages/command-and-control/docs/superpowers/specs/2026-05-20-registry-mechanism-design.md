# Adapter / Prompt-Template Registry — Design

**Status:** Draft (2026-05-20) — needs review
**Repo:** `D:\Dev\Command-and-Control-MCP`
**Size:** Small
**Depends on:** Template/theme library Phase 1 (spec #2)

---

## 1. Problem

Templates, themes, prompts, and adapter configurations need an install/discovery mechanism that works today (free, local-first, GitHub-hostable) and scales to a hosted premium tier later (your website, paid bundles). Without a registry concept, every install would be an ad-hoc URL fetch with no metadata validation, no versioning, and no way to mix free and paid content.

## 2. Goals

1. A single install mechanism that works for any resource type (template, theme, prompt, adapter config).
2. Resources fetched from raw GitHub URLs (free tier) by default.
3. Resources fetchable from authenticated URLs (premium tier) when credentials are configured.
4. Each resource has metadata (id, version, kind, dependencies) that callers can inspect before installing.
5. Local cache so a re-install is fast and offline-capable.
6. No infrastructure required to start — the same client that supports GitHub URLs will support your website later by adding an auth header convention.

## 3. Non-goals

- Building the hosted registry server. That's later infrastructure.
- A web UI for browsing. Browsing happens through MCP tools or your website.
- Real-time updates / push notifications when resources change.

## 4. Architecture

```
                          ┌───────────────────────────┐
                          │  install_resource         │
                          │  (MCP tool in C&C)        │
                          └───────────┬───────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
        ┌──────────────┐      ┌──────────────┐        ┌──────────────┐
        │ Raw GitHub   │      │ Hosted       │        │ Local file   │
        │ resolver     │      │ resolver     │        │ resolver     │
        │ (free)       │      │ (premium)    │        │ (dev only)   │
        └──────┬───────┘      └──────┬───────┘        └──────┬───────┘
               │                     │                       │
               └─────────────────────┼───────────────────────┘
                                     ▼
                          ┌───────────────────────┐
                          │  ResourceManifest +   │
                          │  validated payload    │
                          └───────────┬───────────┘
                                      ▼
                          ┌───────────────────────┐
                          │  Local cache          │
                          │  ~/.command-and-      │
                          │  control/registry/    │
                          │   <kind>/<id>/        │
                          └───────────────────────┘
```

## 5. Resource manifest schema

Every resource (template, theme, prompt, adapter-config) has a `manifest.json` at its root:

```jsonc
{
  "schemaVersion": 1,
  "id": "comparison-layout-academic",         // unique within (kind, source)
  "kind": "template",                          // template | theme | prompt | adapter-config
  "version": "1.2.0",                          // semver
  "name": "Side-by-side comparison (academic)",
  "description": "...",
  "author": { "name": "the toolchain author", "url": "..." },
  "license": "MIT",                            // or proprietary id
  "tier": "free",                              // free | premium
  "dependencies": [                            // other resources this needs
    { "kind": "theme", "id": "ada-accent", "minVersion": "1.0.0" }
  ],
  "files": [                                   // payload files relative to manifest.json
    "structure.html",
    "prompt.md",
    "preview.png"
  ],
  "tags": ["comparison", "table-alternative"]
}
```

## 6. Source URL conventions

### 6.1 Free tier (GitHub)

```
github://canvas-toolchain/templates/comparison-layout-academic@1.2.0
```

Resolves to: `https://raw.githubusercontent.com/canvas-toolchain/templates/v1.2.0/comparison-layout-academic/manifest.json` (and sibling files listed in `files`).

The MCP tool accepts shorter aliases too:
- `template:comparison-layout-academic` → looks up default GitHub source from C&C config
- `gh:canvas-toolchain/templates#comparison-layout-academic@1.2.0` → explicit

### 6.2 Premium tier (your website)

```
ryfter://templates/business-school-pack@2.1.0
```

Resolves to: `https://<your-domain>/api/registry/templates/business-school-pack@2.1.0`. Request includes `Authorization: Bearer <token>` where the token is configured via `setup_cc({ registryToken: '...' })` and stored in `~/.command-and-control/config.json`.

### 6.3 Local (dev)

```
file:///D:/Dev/my-templates/comparison-layout-academic
```

Direct path. No network. Useful for authoring + testing before publishing.

## 7. Install flow

1. User invokes `install_resource({ url })`.
2. Resolver determined from URL prefix.
3. Resolver fetches `manifest.json` first; validates against schema.
4. If `tier === 'premium'` and resolver is GitHub → error (premium content can't live in GitHub).
5. If `dependencies` present → recursively install (cycle detection).
6. Resolver fetches each file in `manifest.files`.
7. Validation pass: each file matches expectations for the `kind` (e.g., a `template` must have `structure.html`).
8. Atomic write to `~/.command-and-control/registry/<kind>/<id>@<version>/`.
9. Update `~/.command-and-control/registry/index.json` (the local index of what's installed).
10. Return `InstallResult` with paths + version metadata.

## 8. Local index

```jsonc
{
  "schemaVersion": 1,
  "installed": [
    {
      "kind": "template",
      "id": "comparison-layout-academic",
      "version": "1.2.0",
      "installedAt": "2026-05-20T...",
      "source": "github://canvas-toolchain/templates/...",
      "path": "~/.command-and-control/registry/template/comparison-layout-academic@1.2.0"
    }
  ]
}
```

`list_installed_resources` and `uninstall_resource` operate on this index.

## 9. C&C tools added

| Tool | Purpose |
|---|---|
| `install_resource({ url })` | Install a single resource from a URL |
| `install_resources_from_lockfile({ path })` | Install from a `.lockfile` (a list of URLs) for reproducible setups |
| `list_installed_resources({ kind? })` | What's installed locally |
| `uninstall_resource({ kind, id })` | Remove from cache + index |
| `update_resource({ kind, id })` | Re-fetch latest version from original source |
| `search_registry({ kind, query, tier? })` | Search GitHub registry (and authenticated registry when configured) |

## 10. Auth model

- Free tier: no auth needed. Anyone can install from public GitHub.
- Premium tier: token from `~/.command-and-control/config.json`. Set once via `setup_cc({ registryToken })`. Never logged or echoed.
- Token format: opaque string. The premium server is responsible for validating it.

## 11. Test plan

- Unit: resolver picks the right strategy per URL prefix.
- Unit: manifest validator rejects malformed manifests.
- Unit: dependency resolution detects cycles, installs in correct order.
- Unit: local index round-trips.
- Integration: mock-fetch a manifest + file payload via `vi.stubGlobal('fetch', ...)`, verify cache directory layout after install.

## 12. Open decisions for review

1. **GitHub org name.** Is `canvas-toolchain` the right org? Could be `ryfter-canvas`, your personal org, something more aspirational. The org name becomes part of every free-tier URL, so it's hard to change later. Default URL convention in C&C config means callers don't have to repeat it, but the registry URLs they share with peers will include it.

2. **Token storage.** Token in `config.json` (plaintext, file-system-protected) is the simplest path. More secure: keychain integration per OS. I'd start plaintext with a clear warning in the docs, and add keychain support later if real premium adoption happens.

3. **Should `install_resource` auto-resolve unpinned versions?** If a user passes `template:comparison-layout-academic` without a version, do we fetch the latest GitHub tag? Or require explicit `@1.2.0`? Auto-resolve is friendlier but means installs aren't reproducible without a lockfile. I lean: auto-resolve allowed, lockfile recommended for shared setups.

4. **Premium tier delivery: HTTP API vs signed URLs?** A direct HTTP API on your website (with auth) is simplest. Alternatively, the server could issue signed S3/CDN URLs that the client fetches directly (faster, cheaper to serve). HTTP API for v1.

## 13. Out of scope

- Building the premium server. This spec defines the client side and the URL convention.
- Resource ratings / reviews. Future website feature.
- Resource creation tooling (a CLI to scaffold a new template/theme). Useful follow-up.
- Resource verification signatures. Important for paid content; deferred.
