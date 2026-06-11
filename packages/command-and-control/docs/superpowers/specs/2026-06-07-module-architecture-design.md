# Plug-in Module Architecture Design (v2.0)

**Issue:** #78 (feat: plug-in module architecture) — the load-bearing v2.0 design that #75, #76, #77 depend on.
**Date:** 2026-06-07
**Status:** Approved design; ready for implementation plan.

## Goal

Make tool support truly pluggable. The base install edits Canvas pages (core). Every other
capability becomes an opt-in **module** that can be **enabled without shipping a new installer
release**. The first module is **Lecture Video** (`module-video`), with **Panopto** as its first
provider. This proves the contract on one real extraction so converting the rest later is mechanical.

## Decisions (locked during brainstorm)

1. **Enablement model: config-time.** Every module ships inside the install bundle. A manifest
   (`~/.command-and-control/modules.json`) decides which modules the MCP server exposes at startup.
   Enabling a module = flip the manifest (installer checkbox or a setup tool writes it); **no
   reinstall**. The contract is designed so the only thing that changes for future *runtime-loading*
   (download/drop-in modules) is the *source* of the module — not the contract. We are **not**
   building runtime-loading now (it means executing downloaded third-party code — a security/
   complexity jump not justified for the current audience).

2. **A module is its own npm workspace package** (`packages/module-video`). This is the genuine unit
   you would eventually distribute for runtime-loading, so it keeps the eventual refactor cheap. It
   also fully resolves today's cross-package smear (see §5).

3. **Two layers of pluggability:**
   - **Module** = a *capability* (Lecture Video). the oral-assessment platform (#75) is a *different* capability
     (assessment + grade pull-back) → its own module later.
   - **Provider (adapter)** = a concrete backend *inside* a module. `VideoProvider` interface;
     `PanoptoProvider` is implementation #1. Teams / Meet / Zoom / YouTube / TechSmith(TechLink) are
     each a future ~one-file provider add — not new modules. This mirrors the existing
     `resolveLlmClient` (anthropic/ollama), brand (manual/pomelli), and search (brave/offline)
     adapter pattern already in the codebase.

4. **Scope of this pass: Panopto only.** Only the `PanoptoProvider` is implemented now (the provider
   that exists and that the author uses). Everything else stays as it is. We extract one module to
   validate the contract end-to-end; if the shape is wrong, we find out with one module's churn.

5. **Tool naming: provider-agnostic, with deprecated aliases.** Rename the three Panopto MCP tools to
   provider-agnostic names and keep the old names as deprecated aliases for one version (no breakage):
   - `search_panopto_videos` → `video_search` (alias: `search_panopto_videos`)
   - `embed_panopto_video` → `video_embed` (alias: `embed_panopto_video`)
   - `fetch_panopto_captions` → `video_fetch_captions` (alias: `fetch_panopto_captions`)

## §1. Core vs. modules

| Classification | Capabilities | This pass |
| --- | --- | --- |
| **Core** (always on, never gated) | Canvas page editing (the base install); plus CI, design tools, downloader, registry **stay core for now** | unchanged |
| **Modules** (gated by manifest) | `module-video` (Panopto provider) | **built now** |
| **Future modules** | the oral-assessment platform (#75); later: CI/design/downloader/registry may convert incrementally | not now |

We do not touch working code we are not modularizing yet. Converting other capabilities to modules
later is a small, low-risk follow-up each, using the contract proven here.

## §2. The Module contract

A new small package — **`packages/module-contract`** — holds the interfaces every module package and
the C&C registry share. (A separate package, not a slice of `shared-types`, so both C&C and module
packages depend on it without depending on each other.)

```ts
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** One MCP tool a module contributes. */
export interface ModuleTool {
  schema: Tool;                                   // MCP name + description + inputSchema
  handler(args: unknown): Promise<CallToolResult>;
}

/** The single object every module package default-exports. */
export interface CanvasToolchainModule {
  id: string;                 // 'video'           — stable manifest key
  name: string;               // 'Lecture Video'   — human label
  description: string;
  version: string;
  /** Provider/tool types this module can integrate, for #76 discovery matching. */
  handles?: string[];         // e.g. ['panopto','zoom','teams','meet','youtube']
  /** The MCP tools this module contributes when enabled. */
  tools: ModuleTool[];
  /** Optional lifecycle hooks (e.g. first-enable setup, teardown). */
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
}
```

C&C never hard-codes a module's tools again — it asks the module object for `tools`.

## §3. The provider layer (inside `module-video`)

The provider interface mirrors `resolveLlmClient`. Optional methods + an explicit `capabilities`
object let providers differ honestly (the universal-tool rule, one level down): a provider that can't
do something declares so, and the tool degrades gracefully instead of failing.

```ts
export interface VideoResult {
  id: string;
  title: string;
  url: string;
  durationSeconds?: number;
}

export interface EmbedOptions {
  width?: number;
  height?: number;
  startSeconds?: number;
}

export interface VideoProvider {
  id: string;                 // 'panopto'
  name: string;
  capabilities: {
    search: boolean;
    embed: boolean;
    fetchCaptions: boolean;
  };
  search?(query: string): Promise<VideoResult[]>;
  embed(ref: string, opts?: EmbedOptions): Promise<string>;   // Canvas-safe iframe HTML
  fetchCaptions?(ref: string): Promise<string>;               // VTT
}
```

The module's tools (`video_search`, `video_embed`, `video_fetch_captions`) resolve the active provider
from config and dispatch — exactly like `resolveLlmClient`. Provider resolution reads
`activeProvider` from the manifest entry (default `panopto`). If a tool is called whose capability the
active provider does not support, it returns a clear, structured "not supported by <provider>" result.

`PanoptoProvider` is the only implementation now. Adding Zoom/Teams/Meet/YouTube/TechLink later =
implement `VideoProvider` once and register it in the module's provider table.

## §4. Registry & manifest

**Manifest** at `~/.command-and-control/modules.json` (created by installer or a setup tool; absent =
all modules disabled, core still works):

```json
{
  "modules": {
    "video": { "enabled": true, "activeProvider": "panopto" }
  }
}
```

**Loader** — a new `loadModules()` in C&C, run once at server startup:

1. Read `modules.json` (tolerate missing/partial: treat unknown/missing modules as disabled).
2. For each **enabled** module, import its package and read its default-exported
   `CanvasToolchainModule`.
3. Collect every module's `tools` into:
   - the `ListToolsRequestSchema` response (merged with the unchanged core tool list), and
   - a `Map<string, handler>` consulted by `CallToolRequestSchema` before the existing core switch.
4. Disabled module → its tools never appear and its handlers are never registered.

Core tools register exactly as they do today, alongside the merged module tools. This is additive:
we do **not** rewrite the existing inline core registry in this pass — we add a module layer beside it.

For config-time enablement, all module packages are normal dependencies of C&C (always bundled);
the manifest only gates *exposure*. Future runtime-loading swaps step 2's static import for a dynamic
one — the rest of the loader and the contract are unchanged.

## §5. The Panopto extraction (the real work)

New package `packages/module-video/` becomes Panopto's single home. Code that moves in:

- From `canvas-design-studio/src/tools/`: `panopto.ts` (API client + OAuth token), `panopto-audio.ts`
  (audio fetch), `panopto-enrich.ts` (transcript enrichment), and the `search_panopto_videos` /
  `embed_panopto_video` / `fetch_panopto_captions` tool registrations.
- From `command-and-control/src/tools/`: `setup_panopto.ts`, `setup_panopto_vocab.ts`, and the
  Panopto workflows (`bulk_fetch_panopto_transcripts`, `enrich_panopto_transcripts`,
  `setup_transcript_source`, `compare_transcripts`) — re-housed behind the module / `PanoptoProvider`.
- `PanoptoConfig` type → `module-video` (or `module-contract` if shared shapes are needed).

**Smear cured:** today C&C reaches into CDS via
`import { getPanoptoToken } from 'canvas-design-mcp/dist/tools/panopto.js'`. That import is deleted;
token handling is internal to the module.

**CI stays decoupled by data contract, not code:** the module writes VTT + `_sessions.json` to the
known transcript location; CI's `ingest_transcripts` consumes it **unchanged**. The C&C workflow
orchestrates "fetch via module → ingest via CI." The module never imports CI.

**Dependency direction (no cycles):**
`module-video → { module-contract, shared-types, shared-llm, CDS html helpers }`; `C&C → { module-contract, module-video }`.
CDS loses its baked-in Panopto tools — that is the point: Panopto is now opt-in, not always-on in CDS.

**Credentials unchanged in shape:** still `~/.command-and-control/panopto-config.json`, atomic 0o600
write, load-on-demand with validation, no-API fallback. The module owns this file's read/write now.

## §6. Installer wiring

The workflow checkbox finally drives real downstream state (resolving the health-check #5 concern that
the checkboxes were cosmetic). Selecting Video/Panopto in the installer writes `modules.json` with
`video.enabled: true, activeProvider: "panopto"`. Not selecting it writes `video.enabled: false` (or
omits the entry) — core still installs and works. All package code installs regardless; only the
manifest differs.

## §7. Testing

- **Contract conformance:** `module-video`'s default export satisfies `CanvasToolchainModule`
  (typecheck + a runtime assertion test on `id`/`name`/`version`/`tools`).
- **Provider conformance:** `PanoptoProvider` honors its declared `capabilities` (declared method ⇒
  method exists; undeclared ⇒ tool returns "not supported").
- **Registry:** manifest `enabled: true` ⇒ `video_*` tools appear in `ListTools`; `enabled: false` or
  missing ⇒ they are absent; core tools always present. Handler map routes module tools correctly.
- **Alias compatibility:** old `*_panopto_*` names still resolve to the same handlers and emit a
  deprecation note.
- **Regression:** the existing Panopto tests move *with* the code into `module-video` and must stay
  green — proving the extraction changed structure, not behavior.
- **Installer:** checkbox selection ⇒ correct `modules.json` written (Go test on the install task).

## §8. What this sets up

- **#75 oral-assessment module** → second module, drops straight into the proven `CanvasToolchainModule` contract.
- **#76 discovery** → inspects the Canvas instance, reads each module's `handles[]`, and suggests
  modules to enable (e.g. detect Panopto domain → "enable Video module, Panopto provider").
- **#77 feedback** → the institution profile = which modules/providers are enabled; ships via GitHub.

## Out of scope (explicitly)

- Runtime-loading / downloading modules post-install (future; contract already accommodates it).
- Converting CI / design / downloader / registry into modules (incremental follow-ups).
- Implementing any video provider other than Panopto (Teams/Zoom/Meet/YouTube/TechLink are documented
  next steps, not built here).
- Rewriting C&C's existing inline core tool registry (the module layer is additive).
