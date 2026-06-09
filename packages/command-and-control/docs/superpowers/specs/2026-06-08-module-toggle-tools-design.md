# Module Toggle Tools Design (#94)

**Status:** Approved 2026-06-08
**Issue:** #94 — `enable_module` MCP tool (post-install module toggle)
**Fast-follow from:** #78 (plug-in module architecture)

## Problem

#78 shipped *config-time* module enablement: the installer writes `~/.command-and-control/modules.json`
from the Video/Panopto workflow checkbox, and C&C's registry exposes a module's tools only when its
manifest entry is `enabled: true`. There is **no in-product path to flip that bit after install**.

A professor who unchecks Video at install has the Video module disabled, so `video_*`, `setup_panopto`,
and `setup_panopto_vocab` are never registered — and `setup_panopto` is itself module-gated, so it cannot
bootstrap itself. Today the only recourse is hand-editing `modules.json` (a footgun).

## Solution

Two small, **always-on (core, never module-gated)** C&C tools, mirroring the existing
`set_active_llm_provider` pattern exactly:

### `set_module_enabled({ module, enabled, activeProvider? })`

- **Validates** `module` against the registry's known module ids. Unknown → `UNKNOWN_MODULE` error
  whose `fix` lists the valid ids. (Requires exposing the known ids from `registry.ts`, where they are
  currently a private const.)
- **Merges** the single entry into the existing `modules.json` — other modules' state is preserved —
  then writes atomically (tmp file + `renameSync`, `mode: 0o600`), byte-compatible with the installer's
  `WriteModulesManifest` and the format `loadModuleManifest` reads: `{ modules: { <id>: { enabled, activeProvider? } } }`.
- **Does NOT load the module** to enable it. Enabling must work even when the module is currently
  unloadable (e.g. the professor is enabling it right after fixing/installing it). Provider ids are
  therefore **not** validated against the module's `handles[]` here; the module validates its provider at
  use-time (e.g. `PanoptoProvider` throws `NOT_CONFIGURED`).
- **Does NOT gate on the module's own config** (unlike `set_active_llm_provider`, which refuses a provider
  with no config). Flipping the enabled bit is independent of whether the module has been set up;
  `setup_panopto` becomes reachable *because* the module is enabled, then configures it.
- **Returns** `{ ok: true, module, enabled, activeProvider?, note }`. `note` carries the **restart caveat**:
  the registry loads modules at server startup, so newly-enabled tools appear only after the MCP client
  reconnects/restarts. No hot-reload (YAGNI; documented and deferrable to a future issue).
- On bad input returns `{ ok: false, error, message, fix }` — same shape as `set_active_llm_provider`.

### `list_modules()`

- For each **known** module id, reports `{ id, name, enabled, activeProvider?, handles[] }`.
  `enabled`/`activeProvider` come from `modules.json` (absent entry → `enabled: false`); `name`/`handles`
  come from the module object itself (single source of truth).
- Loads each known module **fail-soft**: a module that throws on import or fails the contract guard is
  still listed with `enabled` from the manifest and `loadError` set, `name` falling back to its id and
  `handles: []`. A broken module must never make `list_modules` throw.
- Read-only. Useful for the professor to see valid ids + current state before calling
  `set_module_enabled`, and directly reused by #76 (institutional tool-discovery).

## Components & file structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/modules/registry.ts` | known-module map + loader | **Modify** — export `KNOWN_MODULES` + add `knownModuleIds()` |
| `src/modules/manifest.ts` | manifest read | **Modify** — add `saveModuleManifest()` (atomic 0o600) + `getModulesManifestPath()` |
| `src/tools/set_module_enabled.ts` | the toggle tool | **Create** |
| `src/tools/list_modules.ts` | the listing tool | **Create** |
| `src/index.ts` | tool registration | **Modify** — 2 schemas + 2 switch cases (core, in the existing `switch`) |
| `tests/tools/set_module_enabled.test.ts` | toggle tests | **Create** |
| `tests/tools/list_modules.test.ts` | listing tests | **Create** |

`list_modules` loads modules via the same `KNOWN_MODULES` loaders the registry uses — no second source of
truth. `set_module_enabled` only needs `knownModuleIds()` (no loading).

## Data flow

```
set_module_enabled({module:'video', enabled:true})
  → knownModuleIds() includes 'video'?  no → {ok:false, UNKNOWN_MODULE, fix:[valid ids]}
  → loadModuleManifest()  (tolerant read; missing → {modules:{}})
  → manifest.modules.video = { enabled:true, ...(activeProvider) }
  → saveModuleManifest(manifest)  (tmp + rename, 0o600)
  → {ok:true, module:'video', enabled:true, note:'…reconnect/restart to load its tools'}

list_modules()
  → for id in knownModuleIds():
      entry = manifest.modules[id] ?? {enabled:false}
      try   load module → {id, name, handles, enabled:entry.enabled, activeProvider:entry.activeProvider}
      catch → {id, name:id, handles:[], enabled:entry.enabled, activeProvider:entry.activeProvider, loadError}
```

## Error handling

- `UNKNOWN_MODULE` — `module` not in `knownModuleIds()`. `fix` lists valid ids.
- `INVALID_ENABLED` — `enabled` not a boolean.
- Corrupt/missing `modules.json` on read — tolerated by `loadModuleManifest` (returns `{modules:{}}`);
  the write then re-creates a clean file.
- A module that fails to load during `list_modules` — reported per-entry via `loadError`, never thrown.

## Testing

`set_module_enabled`: enables a known module (writes merged manifest, 0o600 on non-win32); disables;
preserves a sibling module's entry on write; sets `activeProvider`; `UNKNOWN_MODULE` for a bad id (no file
written); `INVALID_ENABLED` for non-boolean; tolerates a pre-existing corrupt manifest. Uses `CC_HOME`
tmpdir override exactly like `set_active_llm_provider.test.ts`.

`list_modules`: lists the known `video` module as disabled when no manifest; reflects `enabled:true` +
`activeProvider` from a seeded manifest; reports `name`/`handles` from the module; fail-soft entry with
`loadError` when a known module's loader throws (inject a throwing `known` map).

## Out of scope (YAGNI)

- Hot-reload of enabled modules (restart caveat is documented instead). Future issue if demanded.
- Provider-id validation against `handles[]` at write time.
- Installer/UI changes — config-time path already exists; this is the post-install path.
