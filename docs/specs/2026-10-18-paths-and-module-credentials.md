# Per-OS app paths (#200) and per-module credentials (#201): design and job list

- **Status:** draft for Kevin's review, revised after cross-vendor review rounds 1 and 2 (§13, §14). Docs only, no product code.
- **Issues:** Ryfter/canvas-toolchain#200, Ryfter/canvas-toolchain#201
- **Baseline:** `main` @ `36bd43a`
- **Why one spec:** both issues rewrite the same seam. That seam is "where does a module find its home folder and its Canvas token". Each module package hand-rolls both today. Fixing paths first and credentials second would touch every module twice. The design below gives modules both through one host-provided context, so each module changes once.

---

## 1. Problem

1. **#200.** Every app folder is `join(homedir(), '.<app>')`. On Windows that puts config, secrets and large data in dot-folders under `C:\Users\<name>\`, not in `%APPDATA%` / `%LOCALAPPDATA%`. The resolution rule is copy-pasted about 25 times and has already drifted (§2.1). `0o600` writes are a no-op on Windows.
2. **#201.** Every module reads the professor's single shared `canvas-config.json` / `anthropic-config.json` itself. A catalog-installed module gets the full Canvas token and LLM key whether it needs them or not. A professor also cannot give one module a different Canvas identity (for example, an account that can see `sis_user_id`). The module contract has no way to say which credentials a module uses.

## 2. What the codebase actually does (research, `main` @ 36bd43a)

### 2.1 App-home resolution sites (production code, tests excluded)

**Command & Control home `~/.command-and-control` (`CC_HOME`):**

| Site | Notes |
|---|---|
| `packages/shared-types/src/canvas-store.ts:47` `ccHome()` | canonical Canvas store |
| `packages/command-and-control/src/kb/config.ts:7` `getCcHomePath()` | used by **~20 C&C files**, all via this one function (setup_*, channel/*, registry, publish, discovery, answers, spot-check, canvas_backup_config) |
| `packages/canvas-design-studio/src/utils/registry.ts:71` `getCcHomePath()` | a second copy, honours `CC_HOME` |
| `packages/canvas-design-studio/src/tools/showcase/render_preview.ts:74` | inline copy |
| `packages/module-video/src/cc-home.ts:5` | used by `panopto/setup.ts`, `panopto/vocab.ts`, `resolve.ts` |
| `packages/module-roster/src/paths.ts:5` | used by the vault, aliases, column-map and LLM reader. **peerassessment reuses roster's vault** |
| `packages/module-peerassessment/src/paths.ts:5` | |
| `packages/module-oral-assessment/src/llm.ts:6` | private copy |
| `packages/module-group-builder/src/{buckets,history}/store.ts`, `src/data/canvas-client.ts:42` | three inline copies |
| `packages/module-announcements/src/canvas.ts:11` | inline |
| `modules/announcements/1.1.0/announcements-1.1.0.mjs:34` | **shipped, hash-pinned artifact; cannot be edited** |
| `installer/tasks/configs.go:12` `CcHomePath()` | Go. Writes `modules.json` and `pending-module-installs.json` (`installer/screens/install.go:189,193`) |

**Canvas Design Studio home `~/.canvas-design-mcp` (`CANVAS_DESIGN_HOME`):**

| Site | Notes |
|---|---|
| `packages/shared-types/src/canvas-store.ts:51` | |
| `packages/canvas-design-studio/src/config.ts:37` | |
| `packages/canvas-design-studio/src/tools/update-kb.ts:5`, `philosophy.ts:5`, `personas.ts:5` | **Missed by #200's framing: these ignore `CANVAS_DESIGN_HOME` entirely** and are module-level `const`s evaluated at import time. That is a latent test-isolation hole: `tests/setup-sandbox-home.ts` cannot redirect them. |
| `packages/module-video/src/panopto/client.ts:239` | transcripts, ignores env (as #200 says) |
| `packages/command-and-control/src/setup/read_state.ts:46`, `src/lib/kb-bridge.ts:26` | |
| `scripts/shell-edit-doctor.mjs:63` | uses **`.canvas-design-studio`**, the wrong folder name |

**Curriculum Intelligence home `~/.curriculum-intelligence` (`CURRICULUM_INTELLIGENCE_HOME`):**
`packages/curriculum-intelligence/src/config.ts:13` (uses `||`, the others use `??`, so an empty env var behaves differently: drift), `command-and-control/src/tools/workflows/{ask_course.ts:81,index_course_for_answers.ts:43,update_course_materials.ts:34}`, `src/lib/kb-bridge.ts:22`, `scripts/shell-edit-doctor.mjs:62`.

**Missed by the issue, but correctly out of scope:**
- `command-and-control/src/setup/hosts.ts:741`: MCP *host* config detection. It already uses `%APPDATA%` with a `home\AppData\Roaming` fallback (`hosts.ts:77-81`). This is the pattern to mirror.
- `command-and-control/src/passthrough/canvas_backup_config.ts:40`: the default `~/CanvasArchive` is a **user-visible documents folder**, not app data. It stays as it is.
- `installer/screens/state.go:85` `DefaultInstallDir()`: the program install location, not config or data. See Q4.

**Hard-coded `~/.command-and-control/...` in user-facing strings:** `canvas-design-studio/src/index.ts:517,653` (error causes), `canvas-design-studio/src/index.ts:296` (the `generate_student_personas` tool description: "Saves to ~/.canvas-design-mcp/student-personas.md"; `:69` is a Docker volume-mount example and stays), `command-and-control/src/tools/review_accessibility_policy.ts:87`, `src/tools/open_dashboard.ts:22`, `src/cli/dashboard.ts:11`, `src/tools/showcase/preview_canvas_pattern.ts:73`, `src/setup/doctor.ts:131,231`. All are wrong on Windows after this change.

### 2.2 What lives in each home (config vs data)

Built from `join(<home>, '<name>')` call sites:

| App | Config (small, user-authored, often secret) | Data (large, cached or regenerable) |
|---|---|---|
| C&C | `config.json` (premium registry token), `canvas-config.json`, `anthropic-config.json`, `ollama-config.json`, `lmstudio-config.json`, `llm-provider.json`, `transcript-config.json`, `panopto-config.json`, `panopto-vocab.json`, `spot-check.json`, `modules.json`, `installed-modules.json`, `pending-module-installs.json`, `channel-notice-state.json`, `canvas-store-migration.json`, `institution-profile.md`, `canvas-backup.generated.toml`, lecture-answers config, `roster-vault/` (pseudonym vault), `groups/` (pairing history), `peerassessment/` | `modules/` (channel artifacts), `registry/` (downloaded resources), `publish-snapshots/`, `showcase-previews/`, `cache/`, `module-catalog-cache.json` |
| CDS | `institution.json` (mirrors Canvas token), `professor-philosophy.md`, `philosophy-kb.md`, `student-personas.md`, `course/` | `kb/`, `transcripts/` |
| CI | `config.json` | `courses/`, `panopto/` |

The pairing history, roster vault and per-course bucket maps are **state, not cache**. Nothing regenerates them, so they are classed as config: they go wherever config goes and are never auto-cleaned.

### 2.3 Credential readers

| Kind | Writer | Readers that bypass any shared loader |
|---|---|---|
| Canvas `host`+`token` | `shared-types/canvas-store.ts` (C&C `setup_canvas`, the CDS mirror) | `module-group-builder/src/data/canvas-client.ts:41`, `module-roster/src/canvas/client.ts:41`, `module-peerassessment/src/canvas/client.ts:39`, `module-announcements/src/canvas.ts:10`, artifact `announcements-1.1.0.mjs:33`. Each **re-implements host normalization** because modules have no `shared-types` dependency (`canvas-store.ts:15-16`). |
| Anthropic `apiKey`+`model` | C&C `setup_anthropic.ts` | `module-oral-assessment/src/llm.ts:18` (throws), `module-roster/src/major/llm.ts:11` (returns null, so normalization degrades) |
| Panopto OAuth | `module-video/src/panopto/setup.ts:97` (the module's own tool) | the module itself, **plus three C&C host workflow tools** that import module-video's `loadPanoptoConfig()` / `loadPanoptoVocab()` exports (`module-video/src/index.ts:26-27`): `bulk_fetch_panopto_transcripts.ts:1,42`, `compare_transcripts.ts:10,69,83`, `enrich_panopto_transcripts.ts:15-16,68,83`. They run outside any `ModuleContext` (§4.5) |
| `CANVAS_TOKEN` env | injected into the Canvas Backup child only (`passthrough/downloader_tools.ts:140`) | none. The runtime deliberately ignores `ANTHROPIC_API_KEY` (`get_cc_status.ts:14-17`) |

### 2.4 Module loading facts that constrain the design

- **Module packages depend only on `@canvas-toolchain/module-contract`** (plus `shared-llm` for two of them). None depend on `shared-types`. Channel artifacts are esbuild bundles of a module plus **all** of its runtime deps (`scripts/build-module.mjs:26-35`). Any path or credential logic a module imports gets **frozen into a hash-pinned artifact**, so a future path change would need a new artifact version for every channel module.
- Built-in modules load through `KNOWN_MODULES` dynamic imports (`modules/registry.ts:19-25`). Channel artifacts load through `import(fileURL?sha256=…)` (`registry.ts:73`). Both run in-process. The contract hands a module nothing: `ModuleTool.handler(args)` only (`module-contract/src/index.ts`).
- **`<cc-home>/modules/` is already taken** by channel artifacts (`channel/installed.ts:23`). `uninstall_module` runs `rmSync(join(modulesRoot, id), {recursive:true})` (`channel/install.ts:360`), and retired-version pruning runs `rmSync` under it (`registry.ts:92`). **The issue's proposed `<cc-home>/modules/<id>/credentials.json` would be silently deleted on every uninstall** (a recursive `rmSync` with no knowledge of non-artifact files). It would also land in `%LOCALAPPDATA%` (data) on Windows. The store must live elsewhere (§4.2).
- The workspace has a **version-lockstep guard**. `module-contract` cannot get its own semver bump, so the contract needs an explicit `contractVersion` field. `module-announcements` (1.1.0) is outside the lockstep.
- `module-catalog.json` on `main` **is the live catalog**. Each id has one entry, and `minHostVersion` is enforced at install (`channel/install.ts:216`). If the catalog points at an artifact that needs an unreleased host, every professor on the current release loses the ability to install that module.

### 2.5 CI facts

- TypeScript CI (`ci.yml`) is **ubuntu-only**. Only `installer-ci.yml` runs ubuntu/macos/windows, and it only triggers on `installer/**` + `module-catalog.json` (the PR #152 lesson).
- There is no evidence the full TS suite passes on Windows. Many tests assert POSIX modes. Gating the whole suite on Windows in one step would block this work on unrelated failures (§7, job CT200-00).

---

## 3. Constraints (stated and unstated)

1. **Zero data loss on migration.** No overwrite, no delete, idempotent, safe to interrupt, and safe when two servers start at once (C&C, standalone CDS and standalone CI can all boot together).
2. **macOS and Linux stay byte-for-byte unchanged.** There is no user complaint, and moving secrets on POSIX is risk with no evidence behind it (law #7). XDG is not adopted (Q3).
3. **Env overrides keep top priority** and keep meaning "one folder for everything". Test sandboxes (`canvas-design-studio/tests/setup-sandbox-home.ts`) rely on that.
4. **The Go installer and Node must resolve the same C&C home on every OS, at every point in the upgrade.** That includes "new installer, old data, Node not yet run".
5. **Shipped artifacts cannot change.** `announcements-1.1.0.mjs` keeps reading `CC_HOME ?? ~/.command-and-control/canvas-config.json` forever.
6. **No re-entry of secrets** for existing installs, for any module.
7. **Secrets never reach results, logs or journals.** Presence only (the AGENTS.md rule for status tools, asserted in `get_cc_status.test.ts`).
8. **The manual, no-token path stays first-class.** None of this may make Canvas credentials mandatory for tools that don't need them.
9. **Cross-language contracts get a shared fixture.** The `canvas-host.test.ts` ↔ `canvashost.go` precedent applies, and the fixture must be in `installer-ci.yml`'s path filter.
10. **Skill graph is generated.** Any registry description change needs `build-index.mjs` + `moc.mjs` regenerated and `lint.mjs` passing.
11. **`docs/modules.md` is generated** from the catalog. Module-authoring guidance goes in `docs/architecture-modules.md` and `docs/module-channel.md`, never hand-edited into `modules.md`. (#201 asks to "update modules.md". That means regenerate it.)

---

## 4. Design

### 4.1 #200: one path resolver, plus a Go twin

**New `packages/shared-types/src/app-paths.ts`** (pure; `platform`, `env` and `homedir` injectable for tests):

```ts
export type AppId = 'cc' | 'cds' | 'ci';
export interface AppPaths {
  config: string;   // settings, secrets, irreplaceable state
  data: string;     // caches, artifacts, snapshots, large regenerable data
  source: 'env' | 'default';
}
export interface PathEnv {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  homedir?: string;
  /** Test injection for the upgrade-window rule: stand-ins for "legacy folder exists" / "new config home exists",
   *  so win32 cases run on any OS. When unset, the real filesystem is probed. */
  legacyExists?: boolean;
  newExists?: boolean;
  /** Internal (migration engine, doctor): resolve the new homes even inside the upgrade window. */
  ignoreUpgradeWindow?: boolean;
}
export function appPaths(app: AppId, o?: PathEnv): AppPaths;
export function legacyAppHome(app: AppId, o?: PathEnv): string; // ~/.command-and-control etc.
export const ccConfigHome, ccDataHome, cdsConfigHome, cdsDataHome, ciConfigHome, ciDataHome: () => string;
```

Resolution, in order:

| # | Condition | config | data |
|---|---|---|---|
| 1 | env override set and non-empty after trim (`CC_HOME` / `CANVAS_DESIGN_HOME` / `CURRICULUM_INTELLIGENCE_HOME`) | override | **same override** (constraint 3) |
| 2 | `win32` | `%APPDATA%\CanvasToolchain\<Sub>` | `%LOCALAPPDATA%\CanvasToolchain\<Sub>` |
| 3 | anything else | `~/.<legacy>` | `~/.<legacy>` (same dir, unchanged) |

- `<Sub>` = `CommandAndControl` / `CanvasDesignStudio` / `CurriculumIntelligence`.
- If `APPDATA` / `LOCALAPPDATA` is unset or blank, fall back to `<home>\AppData\Roaming` / `<home>\AppData\Local`. That is the same fallback `hosts.ts:77-81` uses, and Go must match it.
- An empty override counts as unset everywhere. This fixes the `||` vs `??` drift in `curriculum-intelligence/src/config.ts:13`.
- On POSIX `config === data`, so the config/data classification (§2.2) is a no-op there. The migration only runs on Windows.

**Upgrade-window rule (all three apps, both roots, both languages).** On Windows, with no override, the effective config **and** data homes are `legacyAppHome(app)` **if** the legacy folder exists **and** the new config home does not yet exist. Otherwise they are the new homes. Self-review changed this from "C&C config only" to a uniform rule: a partial rule would let a CDS or CI reader that runs before its migration see empty new folders. This is what makes constraint 4 hold. A new installer on an old machine writes `modules.json` into the legacy folder, and Node's first-boot migration then carries it across. Without the rule, the installer creates the new folder first, migration finds a conflict on `modules.json`, and the professor's legacy module choices lose. Node applies the same rule, but its migration runs before any read, so in practice Node always ends up on the new path.

The migration engine computes its targets with `appPaths(app, { ignoreUpgradeWindow: true })`, never the effective home. Otherwise it would resolve its own target to the legacy folder and copy onto itself. That option is internal and used only by `app-home-migration.ts` and the doctor.

**Go twin, `installer/tasks/apppaths.go`.** `CcConfigHome()` implements rows 1–2 plus the upgrade-window rule. `configs.go` `CcHomePath()` delegates to it. Data paths are not needed in Go: the installer only writes `modules.json` and the pending-request file, both config.

**Shared fixture `packages/shared-types/tests/fixtures/app-paths-cases.json`:** rows of `{platform, env, homedir, legacyExists, newExists, app, expectConfig, expectData}`. Both `app-paths.test.ts` and `installer/tasks/apppaths_test.go` iterate it. Add the fixture to `installer-ci.yml` `paths:`. **Separators:** the fixture stores every path with forward slashes. The resolver under test builds paths with the platform's own `path` flavour (`path.win32` when `platform: 'win32'` is injected), so each side normalizes before comparing: TypeScript compares `expected` against `actual.replaceAll('\\', '/')`; Go compares `filepath.ToSlash(actual)` against `expected`. A test never compares raw strings, so a row passes identically on a Windows runner and a POSIX one.

**Call sites:** every site in §2.1 moves to the resolver. That includes the canonical Canvas store: `canvas-store.ts` `ccHome()` and `canvasDesignHome()` (lines 47, 51) delegate to `ccConfigHome()` / `cdsConfigHome()`, which also makes a blank `CC_HOME` count as unset there (today it uses `??`, so `CC_HOME=""` resolves to the cwd). Their exported names and signatures stay, so `canvasStoreLocations()` and every caller are unchanged (job CT200-01b). Data-class callers use the `*DataHome()` functions: C&C `channel/installed.ts` modules root, `channel/catalog.ts` cache, `registry/local_registry.ts`, `tools/publish/snapshot_store.ts`, `setup_ollama.ts` cache, CDS showcase previews, CDS `kb/` and `transcripts/`, CI `courses/` and `panopto/`. Everything else uses config. CDS's three import-time `const` paths become functions (this also closes the sandbox hole in §2.1). Module packages **do not import the resolver**. They receive paths from the host (§4.3).

**Guard (law #7).** New `scripts/check-app-paths.mjs` fails CI when any non-test file under `packages/*/src`, `scripts/` or `installer/` (non-`_test.go`) calls `homedir()` / `os.UserHomeDir()` **and** names one of the three legacy folders, or joins `homedir()` with a dot-folder. It has an explicit allowlist with a reason per entry: `app-paths.ts`, `apppaths.go`, `hosts.ts` (host detection), `mcphost.go`, `shortcuts_windows.go`, `canvas_backup_config.ts` (`~/CanvasArchive`), and the glob `scripts/verify-*.mts`. That last entry covers four maintainer-run manual verification scripts that join `homedir()` with `.command-and-control` (`verify-64-publish-course.mts`, `verify-88-canvas-files-iframe-headers.mts`, `verify-88-canvas-files-overwrite.mts`, `verify-88-rce-iframe-sandbox.mts`). They are not shipped, not run in CI and run on the maintainer's macOS machine, where the legacy path is still correct. Rewriting them buys nothing. One **temporary** entry, `packages/module-announcements/src/canvas.ts`, exists because that source cannot change before the release (§5.4); CT201-12 deletes the entry. This is the acceptance check "grep is clean" turned into a gate.

### 4.2 #201: per-module credential store and one shared loader

**Storage:** `<ccConfigHome>/module-credentials/<moduleId>.json`. It is deliberately **outside** `<cc>/modules/` (§2.4), so artifact pruning and uninstall can never touch it implicitly. The id must match `MODULE_ID_SEGMENT` (`channel/installed.ts:35`) before any path join. The directory is `0o700` and the file is `0o600` on POSIX. Writes are atomic with a unique temp name (the `canvas-store.ts` idiom).

```json
{
  "schemaVersion": 1,
  "share": { "canvas": true },
  "credentials": {
    "canvas": { "host": "school.instructure.com", "token": "<secret>" }
  }
}
```

**New `packages/shared-types/src/module-credentials.ts`** holds the **only** reader of the shared `canvas-config.json` / `anthropic-config.json` / `panopto-config.json` outside the writers that own them, and the only reader and writer of module credential files:

```ts
export type CredentialKind = 'canvas' | 'anthropic' | 'panopto';
export interface CanvasCredential { host: string; token: string }        // host already normalizeCanvasHost'd
export interface AnthropicCredential { apiKey: string; model?: string }
export interface PanoptoCredential { /* exactly the PanoptoConfig shape in module-video/src/panopto/setup.ts */ }
export type CredentialSource = 'module' | 'shared';
export interface Resolved<T> { value: T; source: CredentialSource }

export function resolveModuleCredential<K extends CredentialKind>(
  moduleId: string, kind: K, policy: { shareDefault: boolean }, o?: PathEnv,
): Resolved<ValueOf<K>> | { missing: 'none' | 'incomplete' | 'share-denied' };
export function setModuleCredential(moduleId, kind, value): void;
export function clearModuleCredential(moduleId, kind?): { removed: boolean };
export function setModuleShare(moduleId, kind, allow: boolean): void;
export function moduleCredentialPresence(moduleId): Record<CredentialKind, 'module' | 'none' | 'incomplete'>; // never values
```

**Resolution order for module M and kind K. First match wins, and nothing mixes:**
1. **M's own entry** for K. If present and complete, use it (`source: 'module'`). If present but **incomplete** (for example a host with no token), stop with `missing: 'incomplete'`. **Never fill in the gaps from the shared file.** A module host paired with the shared token, or the reverse, would send one identity's token to another's host.
2. **The shared global credential**, only if sharing is allowed for (M, K): the file's `share[K]` if set, else `policy.shareDefault`. A shared Canvas value is read through `canvas-store`'s existing loader (normalized host).
3. **Otherwise missing.** The host turns this into a `*_NOT_CONFIGURED` error (§4.3).

**No environment-variable tier.** The runtime deliberately ignores `ANTHROPIC_API_KEY` today, and adding per-module env vars would create a second credential surface the doctor would have to inspect (the "setup-status tools must read what setup tools write" rule).

**Sharing default (least privilege with zero re-entry):**

| Module origin | `shareDefault` | Why |
|---|---|---|
| Built-in (`KNOWN_MODULES`, shipped inside the install) | `true` | First-party code, already in the trusted install. Existing installs keep working with no prompt (constraint 6). The doctor still reports "shared". |
| Channel artifact declaring `contractVersion: 2` | **`false`** | Downloaded code gets nothing until the professor says so, with one `ct_setup` call: `share` or `set`. That is a consent call, not a secret re-entry. See **Q2**. |
| Legacy module (no `contractVersion`) | n/a | The host cannot scope it. It reads files itself. The doctor labels it "legacy: reads the shared credentials directly". |

**Validation:** host-side, per kind, reusing the existing validators: Canvas `GET /api/v1/users/self` (as in `setup_canvas`), Anthropic (as in `setup_anthropic`), Panopto (as in `setup_panopto`). `set` validates before it saves. `test` validates the *resolved* credential and reports `ok` / an error code, never the value.

### 4.3 Module contract v2: the host injects credentials and paths

`packages/module-contract/src/index.ts` (additive; v1 modules unaffected):

```ts
export type CredentialKind = 'canvas' | 'anthropic' | 'panopto';
export interface CredentialDeclaration {
  kind: CredentialKind;
  required: boolean;
  /** One line shown to the professor: what the module does with it. */
  purpose: string;
}
export interface ModuleContext {
  moduleId: string;
  paths: { config: string; data: string; designStudioData: string }; // C&C config/data homes; CDS data (module-video transcripts)
  credentials: {
    /** Throws `<KIND>_NOT_CONFIGURED: <Module name> (<id>) … ct_setup action module_credentials …`. */
    get(kind: 'canvas'): Promise<CanvasCredential>;
    get(kind: 'anthropic'): Promise<AnthropicCredential>;
    get(kind: 'panopto'): Promise<PanoptoCredential>;
    /** Optional credentials: null instead of throwing (roster's degrade path).
     *  Same per-kind overloads as get(), so callers never cast a union. */
    tryGet(kind: 'canvas'): Promise<CanvasCredential | null>;
    tryGet(kind: 'anthropic'): Promise<AnthropicCredential | null>;
    tryGet(kind: 'panopto'): Promise<PanoptoCredential | null>;
  };
}
export interface CanvasToolchainModule {
  // …existing fields…
  contractVersion?: 2;
  credentials?: CredentialDeclaration[];
  /** Called once by the host before any tool is exposed. v2 modules keep ctx in module scope. */
  init?(ctx: ModuleContext): void | Promise<void>;
}
```

The credential value types are re-declared in `module-contract`, which has no `shared-types` dependency. A type-level test in C&C asserts the two declarations are mutually assignable, so they cannot drift.

**Host behaviour (`command-and-control/src/modules/registry.ts` + new `src/modules/context.ts`):**
- `contractVersion === 2`: the host validates `credentials` (known kinds, no duplicates, boolean `required`, non-empty `purpose`). A malformed module is **rejected** (fail-soft skip, as today). Then the host builds a `ModuleContext` bound to that module id and calls `init` before registering its tools. If `init` throws, the module is skipped.
- `ctx.credentials.get(K)` for a kind the module **did not declare** throws `CREDENTIAL_NOT_DECLARED`. That keeps the declaration honest, and it is what lets the doctor report readiness from declarations alone.
- Every `get` reads from disk fresh (no cache), matching today's readers. A `ct_setup` change takes effect without a restart.
- No `contractVersion`: loaded exactly as today, no ctx. **Channel modules without declarations still load** (an acceptance check).
- The error message is fixed: `CANVAS_NOT_CONFIGURED: Group Builder (group-builder) needs a Canvas connection. Run ct_setup action module_credentials with module "group-builder" to share your main Canvas connection or give it its own.` `incomplete` and `share-denied` get their own sentence. The message never includes a path to a secret file's contents, or a value.

**Why injection, not "modules import the loader from module-contract":** (a) path and credential logic is never frozen into hash-pinned artifacts, so the next path change needs no channel re-publish (§2.4). (b) There is one implementation, in the host. (c) The host can enforce "declared kinds only". (d) Module tests inject a fake ctx, so they stay hermetic, as they are today. The cost is that a v2 module cannot run outside a host. Every module already can't.

### 4.4 Setup, doctor, uninstall

- **`ct_setup` action `module_credentials`** (new surface op, new tool file). Input: `{ module, kind, op: 'set' | 'test' | 'share' | 'unshare' | 'clear', host?, token?, apiKey?, model?, …panopto fields, confirm? }`.
  - `set` validates and then saves.
  - `clear` is two-call (preview, then `confirm: true`) because it can strand a working module. The preview states what happens next: "this module will then use your shared Canvas connection" (sharing allowed) or "this module will stop working until you set or share a credential" (sharing denied). Clearing never silently changes which identity a module acts as.
  - `module` must be a loaded or installed module id.
  - `kind` must be declared by that module. Legacy modules are refused with an explanation.
  - Results report presence and validation outcome only.
  - `get_started` needs no new code. It already routes doctor `fix` hints into `ct_setup`, so the doctor check below is enough.
- **Doctor check `modules.credentials`** (`read_state` + `doctor`). For each enabled built-in and each installed channel module it emits one row per declared kind: `module` / `shared` / `missing-required` / `missing-optional` / `incomplete`, plus `legacy` for undeclared modules. Status is `warn` if any required kind is missing, `info`-level ok otherwise. It lists which modules ride the shared fallback (an acceptance check). The serialized output test asserts that no token, key or host value appears.
- **Doctor check `paths.homes`** (#200). It reports `appPaths()` for all three apps with `source`, the migration journal outcome, and on Windows: (a) any legacy folder still present with N unmigrated files; (b) a `warn` when a config home sits outside `%USERPROFILE%` (the realistic ACL hole, for example `CC_HOME=D:\shared`) **or on a UNC path** (`\\server\…`). Folder redirection of `%APPDATA%` puts secrets on a file server, so this check also makes the Q1(a) roaming risk visible on the machines where it applies. `canvas-toolchain doctor --json` therefore shows real per-OS paths.
- **`uninstall_module`** (**gains a gate; none exists today**). Today it is a single call that removes the artifact and record immediately (`channel/install.ts:341-369`, `registry.ts:336-346`, input `{ moduleId }` only). Only `install_module` has a preview/confirm gate. This work adds a **conditional** two-call gate: `inputSchema` gains `confirm?: boolean`, and the gate applies **only when `module-credentials/<id>.json` exists**.
  - No credential file: behaviour is exactly as today (one call, nothing new to confirm). Existing callers and tests are unaffected. A uniform gate was rejected: it changes the contract for every uninstall to protect a file most modules won't have.
  - Credential file present, no `confirm`: nothing is touched. The result is a preview (`CONFIRMATION_REQUIRED`) saying the uninstall "will also delete this module's stored credentials".
  - `confirm: true`: uninstalls and deletes the credential file via `clearModuleCredential(id)`.
  - Because the op's `inputSchema` and description change, the skill graph must be regenerated (CT201-11 owns this).
  - Disabling a built-in module (`set_module_enabled false`) is **not** an uninstall and keeps its credentials.
- **`install_module` is unchanged.** Credential declarations live inside the artifact, so surfacing them before download would need a catalog-schema change, which is a Go cross-language contract (PR #152). Instead the first tool call, and the doctor, name the missing consent. See §6.

### 4.5 Per-module adoption

Each built-in module moves to `contractVersion: 2`, declares its credentials, takes paths from `ctx.paths`, and deletes its private `cc-home.ts` / `paths.ts` / readers / host normalizer:

| Module | Declares | Path users |
|---|---|---|
| group-builder | canvas (required) | `groups/` buckets + history |
| roster | canvas (required), anthropic (optional; `tryGet`) | `roster-vault/`, aliases, column-map. **Exports path-taking APIs for peerassessment:** the vault API and `loadColumnMap(configDir)` (today `loadColumnMap()` reads roster's private `paths.ts`, `module-roster/src/peoplesoft/column-map.ts:6`) |
| peerassessment | canvas (required) | `peerassessment/`, roster vault and column map (through roster's new path-taking APIs, called with `ctx.paths.config`; today `module-peerassessment/src/source/peoplesoft.ts:1,10` calls the no-arg form) |
| oral-assessment | anthropic (required) | none |
| video | panopto (required) | `panopto-config.json`, `panopto-vocab.json` (config), transcripts → `ctx.paths.designStudioData/transcripts` (**fixes the ignored-`CANVAS_DESIGN_HOME` bug**) |
| announcements | canvas (required) | none. Released as **1.2.0** in one post-release PR together with the catalog bump (§5.4, CT201-12) |

Panopto keeps `panopto-config.json` as the "shared" Panopto credential. `setup_panopto` still writes it, and it is read through `module-credentials.ts`. Only one module uses Panopto, so "shared" and "module" are the same in practice. That is fine and needs no special case.

**C&C's Panopto workflow tools (host code, no ctx).** `bulk_fetch_panopto_transcripts`, `compare_transcripts` and `enrich_panopto_transcripts` are C&C operations, not module tools, so they never get a `ModuleContext`. They stop calling module-video's no-arg loaders:
- **Credential:** `resolveModuleCredential('video', 'panopto', { shareDefault: true })` from `shared-types`. The workflow acts on the video module's behalf, so it resolves exactly what the video module itself would: a module-specific Panopto credential set through `ct_setup` is honoured, and the shared `panopto-config.json` is the fallback. `missing` maps to today's `PANOPTO_NOT_CONFIGURED: …` message (`module-video/src/panopto/setup.ts:43-46`), so the tools' error shape does not change.
- **Vocabulary:** module-video's export becomes path-taking, `loadPanoptoVocab(configDir: string)`, and the workflows pass `ccConfigHome()`. Inside the module, the vocab tools pass `ctx.paths.config`.
- **Export change:** module-video drops the no-arg `loadPanoptoConfig()` export (its only outside callers are these three files). Because the export change and its only callers must land together or `main` stops compiling, they are one job (CT201-08).

---

## 5. Migration plan

### 5.1 Path migration (Windows only, no override set)

`packages/shared-types/src/app-home-migration.ts`: `migrateLegacyAppHome(app, o?)`. It is called **before any other file read** at startup by:
- C&C, for all three apps (it reads CDS and CI homes through `kb-bridge`);
- CDS standalone, for `cds`;
- CI standalone, for `ci`;
- **`runDoctor()`**, for all three apps, as its first statement (skipped when the caller injects `opts.state`, which is how tests and `get_started` pass a pre-read state). `canvas-toolchain doctor` (`packages/canvas-toolchain/bin/canvas-toolchain.mjs:133`) imports `dist/setup/index.js` and calls `runDoctor()` directly, so it never runs any `src/index.ts`. The Go installer runs that CLI (`installer/tasks/doctor.go`) during install, often before the MCP server has ever started on the new build. Without this call the doctor would report an unmigrated machine. The upgrade-window rule would keep its paths *correct*, but the professor would see a "legacy folder present" warning that only clears after some MCP host first boots C&C.

All four callers go through one helper, `bootAppHomes(apps)` in C&C `src/setup/app_home_boot.ts` (CDS and CI call `migrateLegacyAppHome` directly, since they do not depend on C&C). It is idempotent and a cheap no-op once the legacy folder is renamed, so calling it from both the server and the doctor costs nothing. `readSetupState()` stays read-only: a function named "read" must not move files.

It never throws to the caller. Startup continues on any failure, as `bridgeCanvasStoresAtStartup` does today.

Algorithm (all steps idempotent):
1. Skip unless `platform === 'win32'`, there is no override, and `legacyAppHome(app)` exists **and is not already renamed**.
2. **Fresh target (common case): the new config home does not exist yet.** Build both new roots as staging folders (`<root>.staging-<rand>`), copy everything in, verify, then `rename` each staging folder into place, **data first, config last**. Creating the config home is the commit point that flips the upgrade-window rule. A crash at any earlier moment leaves the legacy folder authoritative and only an orphan `.staging-*` behind, which the next run deletes (it is the engine's own temp, never user data) and redoes.
   **Existing target (resume or conflict case): the new config home already exists.** Fall through to the per-file merge below.
   Walk the legacy tree. For each regular file, compute its target root from §2.2 (top-level name → config or data; unknown names → **config**, the safe default). Then:
   - target missing → copy to `target.tmp-<rand>` and `rename` into place (atomic; a concurrent second migrator's `rename` loses harmlessly to the first's identical bytes);
   - target exists with **identical bytes** → skip;
   - target exists and differs → **conflict**: leave both untouched and record it.
   Copies are new files, so they inherit the **target folder's** ACL (the profile ACL). Legacy ACLs are never copied. Symlinks and junctions are **not followed**. They are recorded as `skipped-link`, which avoids escaping the tree and copying something outside it.
3. Verify. Every non-conflict file must now exist at its target with equal size and bytes. Compare in memory; **write no hashes of secret files to the journal**.
4. If verification passes **and there are zero conflicts**, rename the legacy folder to `<legacy>.migrated-<YYYYMMDD-HHmmss>` (local time, for example `.command-and-control.migrated-20261020-142233`). **Collision-safe:** if that name exists (a second migration in the same second, or a professor who restored the legacy folder and migrated again), append `-2`, `-3`, … and take the first name that does not exist; give up after 100 tries and record `partial`. Windows `rename` fails with `EEXIST`/`EPERM` on an existing destination, so a fixed date-only name would leave a same-day retry stuck at `partial` forever. This stops the stale copy from being read. Old artifacts then fail loudly instead of reading a stale token (§5.3). **Nothing is deleted.** If there are conflicts, leave the legacy folder in place. The upgrade-window rule no longer applies, because the new home exists.
5. Write the journal `<config>/path-migration.json`: `{ app, at, outcome: 'migrated' | 'partial' | 'nothing-to-do' | 'failed', copied: n, identical: n, conflicts: [relative paths], skipped: [relative paths], legacyRenamedTo? }`. Relative paths only, never contents. The doctor reads it.
6. Re-runs: legacy renamed means step 1 skips; legacy still present (conflicts) means steps 2–3 re-run as no-ops apart from still-unresolved conflicts.

Concurrency: copy-if-absent with tmp+rename and identical-bytes skip is safe under two migrators. A rename of the legacy folder that fails with `ENOENT` or `EPERM` (the other process won, or a handle is open) is recorded as `partial` and retried on next boot. Files held open by another process (Windows sharing violations) are recorded as `skipped` and retried.

Legacy-folder cleanup is **left to the professor**. The doctor says where the `.migrated-*` folder is and that it still holds old copies of secrets. No automated delete in this scope (§8).

### 5.2 Credential migration

**None needed.** Existing installs keep their shared files. Built-in modules resolve them through the shared fallback (`shareDefault: true`). No file is moved, rewritten or duplicated. The only state ever written is a module file, when the professor explicitly sets or shares.

### 5.3 The frozen `announcements-1.1.0.mjs`

- macOS/Linux: unaffected (paths unchanged).
- Windows, after migration: its hard-coded `~\.command-and-control\canvas-config.json` is gone (renamed), so it throws its own `CANVAS_NOT_CONFIGURED` (the handler rejects; `announcements-1.1.0.mjs:35-42`). The wrapper appends to `*_NOT_CONFIGURED` rejections only, **and only when `process.platform === 'win32'`** (a macOS/Linux professor with a missing or expired token must not be told about Windows folders; there the original error passes through untouched): "This module version predates Canvas Toolchain's Windows folders. Run `install_module announcements` to update it." The doctor's `modules.credentials` row also says `legacy` with the same hint.
- **Where the wrapper goes: on the production dispatch path.** Production MCP dispatch never reads `loadModules().handlers`. `src/index.ts:77-80` iterates `loadedModules.byId` and registers `adaptModuleTools(id, mod.tools)` (`surface/module_adapter.ts:13-28`), which copies each `t.handler` into the operation. `handlers` (`registry.ts:158-165`) has no production reader. So `registry.ts` applies the wrapper **when a legacy channel module is placed into `active`** (the phase-2 loop at `registry.ts:141-151`): it stores a shallow copy, `{ ...mod, tools: mod.tools.map(t => ({ ...t, handler: withLegacyHint(id, t.handler) })) }`. Both `byId` and the derived `handlers` then carry the wrapped handler, and neither `index.ts` nor `module_adapter.ts` changes. The acceptance test drives the real path: `loadModules()` → `adaptModuleTools(id, byId.get(id).tools)` → `op.handler(args)` rejects with the hint.
- The rejected alternative, setting `process.env.CC_HOME` as a compatibility shim, is in §8.

### 5.4 Release ordering (blast radius)

1. Host changes (paths, migration, contract v2, store, setup, doctor, built-in modules) ship in toolchain release **N** (version per Q5).
2. **`packages/module-announcements` source is not touched before `vN`.** `npm run verify:modules` rebuilds **every catalog entry from the current source** and requires built == committed == catalog (`scripts/verify-module-artifacts.mjs:27-84`). `build-module.mjs:20-23` names its output from `package.json`'s version. Any edit to the announcements source while the catalog still pins 1.1.0 turns the CI `module-artifacts` job red on every PR: a version bump produces `module-announcements-1.2.0.mjs` and the gate ENOENTs on the 1.1.0 name, and a source edit without a bump produces bytes that no longer equal the committed 1.1.0 artifact. The note at `verify-module-artifacts.mjs:60-63` records that exact ENOENT on 2026-07-30. (`main`'s CI was green at the baseline `36bd43a`, run 39074680862, so this would be a new break.)
3. **One post-release PR does all of it (job CT201-12, Kevin-gated):** after tag `vN` is published, a single PR changes the announcements source to contract v2, bumps it to 1.2.0, commits `modules/announcements/1.2.0/announcements-1.2.0.mjs`, bumps `module-catalog.json` to 1.2.0 with `minHostVersion: N`, regenerates `docs/modules.md`, and deletes the guard's temporary allowlist entry (§4.1). Source, artifact and catalog then move in one commit, which is the only state `verify:modules` accepts. Merging the catalog bump before `vN` would remove Announcements from every professor still on the current release (one catalog entry per id, `install.ts:216`).
   - **Rejected alternative:** teach `verify-module-artifacts.mjs` to build a historical catalog entry from a pinned git commit, so the source could change early. That reworks the trust-root gate for one module for one release cycle. The legacy wrapper (§5.3) already covers 1.1.0 on the new host in the meantime.

---

## 6. Security

- **In-process trust caveat.** Built-in and channel modules run inside the C&C Node process with the professor's OS permissions. A malicious or compromised module can read `canvas-config.json`, other modules' credential files, or anything else in the profile, whatever the contract says. **Per-module credentials are a scoping, least-privilege and UX boundary, not a security boundary.** They stop well-behaved modules from receiving credentials they never declared, they let a professor give one module a different Canvas identity, and they make the doctor's "who uses what" accurate. The real defences against hostile code stay the same: catalog pinning to this repo, sha256 re-verification at every load, and PR review of artifacts. `docs/architecture-modules.md` must say this plainly.
- **Token scope reality.** A Canvas personal access token carries the **full permissions of the account that made it**. Professors generally cannot mint a narrower token; scoped developer keys are admin-issued. So "a narrower token for a module" usually means "a token from a different account" (for example an account with SIS-id visibility for roster, as `module-roster/src/canvas/client.ts` notes). The docs must not promise scoping that Canvas does not offer.
- **No credential mixing** (§4.2 step 1): one identity's token never travels to another's host.
- **Declared-only access:** `CREDENTIAL_NOT_DECLARED` for undeclared kinds. The ctx is bound to one module id, so module A's ctx cannot resolve module B's file. Ids are validated against `MODULE_ID_SEGMENT` before any join (no `../`).
- **File permissions:**
  - POSIX: `module-credentials/` is `0o700`, files `0o600`, with an explicit `chmod` after write (the `mode` option is ignored on an existing temp file, the `kb/config.ts:26` lesson). The existing `security.file_permissions` doctor check is extended to module credential files.
  - Windows: Node's `chmod` does not set ACLs. **This change does not apply ACLs.** It relies on the per-user profile ACL of `%APPDATA%` / `%LOCALAPPDATA%`, which grants the user, SYSTEM and Administrators, and not other standard users. That is documented in `docs/commands-and-credentials.md` §3. The doctor warns when a config home is outside `%USERPROFILE%`, which is where the profile ACL no longer protects it. `icacls` hardening is Q1(b).
  - **Moving secrets into `%APPDATA%` (Roaming) means they sync to the institution's file server** on machines with roaming profiles or folder redirection, which are common on university-managed Windows. See Q1(a). It matters more for `roster-vault/` (student numbers).
- **No secrets in logs or results:**
  - migration journal: relative paths and counts only;
  - doctor and `module_credentials` results: presence and outcome only (serialization tests assert absence);
  - `*_NOT_CONFIGURED` messages: module name, id, kind and fix only;
  - the loader never includes file contents in thrown errors;
  - startup logs (`console.error` in `index.ts`) print outcome codes, never values.
- **Uninstall cleanup** deletes credential files only on confirm. Disabling never deletes.
- **Secrets through chat:** `module_credentials set` receives a token in tool args, exactly like today's `setup_canvas`. That is no new exposure, and the docs keep recommending the installer or settings path where one exists.

---

## 7. Testing and CI

- **Unit, all in-process and hermetic:**
  - `app-paths.test.ts`: win32/darwin/linux × `APPDATA`/`LOCALAPPDATA` set/unset/blank × override set/blank, plus upgrade-window rows (legacy only, legacy plus new, new only, `ignoreUpgradeWindow`). Driven by the shared fixture.
  - `apppaths_test.go`: the same fixture.
  - `app-home-migration.test.ts`, each with `platform: 'win32'` injected, so they run on any OS: seeded legacy tree → copied once; re-run → no-op; conflict → both untouched and legacy not renamed; symlink skipped; interrupted run (pre-seeded `.tmp-*`) → completes; two concurrent calls → one result.
  - `module-credentials.test.ts`: two modules with different Canvas tokens at once; shared-only install resolves with `source: 'shared'`; share-denied → missing; incomplete entry never mixes; bad id refused; POSIX modes; never-returns-values.
  - C&C `modules/context.test.ts` + `registry` tests: v2 module receives ctx before tools are exposed; undeclared kind refused; malformed declaration rejected; v1 module still loads; legacy `*_NOT_CONFIGURED` hint appended on win32 and **absent on darwin/linux** (platform injected via a `registry.ts` option), **on the production path** (`loadModules()` → `adaptModuleTools` → `op.handler`, §5.3).
  - `app_home_boot` + doctor: `runDoctor()` calls `bootAppHomes` once before `readSetupState`, and not at all when `opts.state` is injected.
  - Panopto workflows: the three C&C tools resolve Panopto through `resolveModuleCredential('video', 'panopto', …)` (module-specific beats shared) and keep their `PANOPTO_NOT_CONFIGURED` shape.
  - Each module's tests: fake ctx, no fs credential reads.
  - Doctor tests: per-module rows and the shared-fallback flag; secret-absence assertion.
- **Cross-OS CI** (new `ci.yml` job `cross-os`, matrix ubuntu/macos/windows, Node 20). It runs a **named** subset: `shared-types` full suite, plus C&C `tests/modules/**`, `tests/setup/**`, `tests/tools/setup_module_credentials*`. These are the suites this work adds or edits. Windows exposure of the full TS suite is measured first by CT200-00 and expanded later, so this work is not blocked on unrelated POSIX-isms.
- **Guard:** `node scripts/check-app-paths.mjs` and `node scripts/check-app-paths.mjs --self-test` in `ci.yml`.
- **Manual proof (Kevin, Windows VM):** seed a legacy `%USERPROFILE%\.command-and-control` with dummy values, run the new build, capture redacted `canvas-toolchain doctor --json` showing `%APPDATA%` / `%LOCALAPPDATA%` homes, the `migrated` outcome and per-module credential rows. Also capture a `ct_setup module_credentials set` transcript for one module.

---

## 8. Deliberately left out (overengineering check)

| Left out | Why |
|---|---|
| XDG Base Directory on Linux/macOS `~/Library/Application Support` | No user evidence, and it would move secrets on platforms that work fine (law #7). The resolver makes it a one-row change later (Q3). |
| Windows ACL hardening via `icacls` | The profile ACL already excludes other users. Removing SYSTEM/Administrators can break backup and management tooling. Parsing ACLs is localized by OS language. Documented limitation plus the outside-profile warning cover the realistic hole (Q1b). |
| `process.env.CC_HOME` compatibility shim for `announcements-1.1.0` | Mutates global env (inherited by every child), and on Windows it would make the resolver treat the shim as an override and collapse data into the config folder unless a special "equals default" rule is added. Only one legacy artifact exists, first-party, with a one-call fix. A loud error with an exact hint is simpler and honest. |
| `custom` credential kinds and module-supplied validation hooks | No module needs one today. A module-supplied validator runs module code on a secret before consent. Revisit when a real module needs it. `CredentialKind` is a union that can grow. |
| Credential declarations in `module-catalog.json` (pre-install consent) | Catalog schema bump = Go installer contract change (PR #152) for one first-party module. The doctor and first-call message cover consent. |
| Per-module LLM *provider* selection (Ollama/LM Studio per module) | The issue scopes Anthropic. Provider choice stays global through `llm-provider.json`. |
| Per-module env-var credentials | A second surface the doctor must inspect, against the runtime's deliberate env-ignore stance. |
| Automated deletion of `.migrated-*` folders | Irreversible, and the professor can delete it after checking. The doctor tells them where it is. |
| OS keychain / Windows Credential Manager | Real improvement, large surface (native deps, three OS backends). Separate issue if wanted. |
| Changing `DefaultInstallDir()` | Program location, not config or data. Touches updater and existing-install detection. Q4. |
| Moving C&C's own (non-module) tools to per-module creds | They are the host. Out of #201's scope. |

---

## 9. Open questions for Kevin

1. **(a) Roaming vs local for secrets and the roster vault.** The issue puts config *and secrets* in `%APPDATA%` (Roaming). On roaming-profile machines that copies Canvas tokens, API keys and the pseudonym vault to an institutional server. **Recommendation:** keep the issue's layout for ordinary config, but put secret-bearing files and `roster-vault/` in `%LOCALAPPDATA%`. **Needed before CT200-01 merges.** If you accept it, the interface changes concretely (it cannot reuse `data`, because §2.2 says irreplaceable state is never classed as data):
   - `AppPaths` gains a third root, `secrets: string`. On Windows it is `%LOCALAPPDATA%\CanvasToolchain\<Sub>\secrets`, on POSIX it equals `config` (no change), and an env override sets it to the override like the other two.
   - The §2.2 table gains a third class. `secrets` holds every `*-config.json` that carries a token or key, `config.json`, `institution.json`, `module-credentials/` and `roster-vault/`. Everything else stays where it is.
   - Migration builds three staging roots, renamed `data` → `secrets` → `config`, so config is still the commit point.
   - The Go twin adds nothing: the installer writes no secrets.
   - `module-credentials.ts` and `canvas-store.ts` read the secrets root. `ModuleContext.paths` gains `secrets`, used only for the roster vault (by roster, and by peerassessment through roster's vault API). Other modules reach secrets only through `ctx.credentials`.
   That is a small addition to CT200-01, CT200-03 and CT201-01. No job boundary moves. **(b)** Do you want `icacls` hardening in this round (recommended: no, §8)?
2. **Channel-module sharing default:** deny until consent (recommended; one extra `ct_setup` call after updating Announcements to 1.2.0), or allow-by-default for first-party catalog modules?
3. **XDG on Linux:** keep `~/.<app>` (recommended) or adopt `$XDG_CONFIG_HOME` / `$XDG_DATA_HOME` with its own migration?
4. **Install dir on Windows:** leave `~/canvas-toolchain` (recommended for this round) or move to `%LOCALAPPDATA%\Programs\CanvasToolchain` in a separate issue?
5. **Release vehicle:** which version tag carries this (it is unreleased on top of the unreleased v2.2.0 line)? Announcements 1.2.0's `minHostVersion` depends on it.
6. **Legacy-folder naming:** is `.command-and-control.migrated-YYYYMMDD-HHmmss` (with a `-2`, `-3` collision suffix, §5.1) acceptable, or would you rather leave the legacy folder untouched and rely on the doctor? The second option is safer for data, but old artifacts keep reading a stale token.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Migration copies secrets to a second place; the `.migrated` folder keeps old copies | Doctor names it; docs tell professors to delete it; nothing secret in the journal |
| Installer and Node disagree mid-upgrade | Upgrade-window rule plus a shared fixture tested in both languages; fixture in `installer-ci.yml` path filter |
| Catalog bump merged early breaks installs for every current-release professor | §5.4; CT201-12 is human-gated |
| Windows TS suite has unknown unrelated failures | CT200-00 measures first; cross-os job runs a named subset |
| A module forgets `init` handling and a tool runs before ctx exists | Contract helper `requireCtx()` throws a clear `MODULE_NOT_INITIALIZED`; registry test covers init-before-expose |
| The roster ↔ peerassessment coupling breaks when roster's `paths.ts` goes away | Roster exports path-taking vault and `loadColumnMap` APIs first; peerassessment depends on that job |
| A module-video export change breaks C&C host code | The three Panopto workflow tools move in the same job as the export change (CT201-08) |
| An announcements source edit before release turns `verify:modules` red | Source, artifact and catalog move in one post-release PR (CT201-12); the guard's temporary allowlist entry keeps CT200-09 green until then |
| Import-time path constants evaluated before migration | Convert CDS constants to functions (CT200-05); the guard script also flags top-level `homedir()` consts |
| Installer writes `modules.json` into the legacy folder in the instant after Node renamed it (installer run while C&C is live) | Go's `MkdirAll` recreates a legacy folder holding only `modules.json`; the next boot sees legacy + new and merges per file. A differing `modules.json` is reported as a conflict, never lost. Rare and visible, so accepted. |
| Windows sharing violations (another process holds a file) block a copy or the legacy rename | Recorded as `skipped` / `partial` and retried at next boot; never fatal |
| A professor's `CC_HOME` points at a shared drive on Windows | Doctor `paths.homes` outside-profile warning |
| Doc strings with `~/.command-and-control` mislead Windows users | CT200-11 replaces them with "your Canvas Toolchain settings folder (run the doctor to see it)" and regenerates skills |

---

## 11. Self-review log

What the self-review pass changed, so Kevin can see what was challenged:

1. **Upgrade-window rule widened** from "C&C config only" to all apps and both roots. A partial rule let CDS and CI readers see empty new folders before their migration ran.
2. **Migration made atomic for the common case.** It now builds staging folders and renames config last, the commit point. The first draft copied per file straight into the new home, so a crash could flip the resolver to a half-filled home.
3. **Migration targets bypass the window rule** (`ignoreUpgradeWindow`). Without that, the engine would resolve its own target to the legacy folder.
4. **Unverified claim removed.** The draft said channel reinstall deletes the id folder. Only uninstall's recursive `rmSync` was verified (`install.ts:360`); upgrade cleanup only removes an *empty* id folder (`install.ts:52-62`). The decision to store credentials outside `modules/` stands on the uninstall path alone.
5. **Clear semantics made explicit.** Clearing a module credential can silently switch the module to the shared identity, so the preview now has to say so.
6. **The doctor now also warns on a UNC config home.** This surfaces the roaming/folder-redirection exposure (Q1a) instead of leaving it to documentation.
7. **The legacy-hint wrapper moved into `registry.ts`.** The draft named `dispatchCallTool`, which no longer exists under that name in `src/`. The CallTool glue is inline in `src/index.ts`, and wrapping handlers where they are built keeps `index.ts` out of CT201-03. *(Review round 1 found this placement still wrong: it wrapped the unused `handlers` map. Corrected in §5.3; see §13 item 5.)*
8. **Overengineering pass.** Removed nothing further. Kept: a staging migration (justified by the crash case), `designStudioData` in ctx (one consumer, but it fixes a real ignored-env bug). Rejected (§8): the env shim, `icacls`, custom kinds, catalog declarations.

## 12. Job list (ordered, atomized)

Rules for builders:
- One job = one PR into a long-lived integration branch `feat/200-201` (or straight to `main` if Kevin prefers).
- TDD.
- Never touch a file outside the job's "may touch" list. If you need to, stop and report.
- "Must not touch" always includes `main`, `module-catalog.json`, `packages/module-announcements/**` and `modules/announcements/**` (all except CT201-12, §5.4), and `modules/announcements/1.1.0/**` (always, including CT201-12).
- Every job's proof includes `npm test --workspace=<pkg>` output and `npm run build` green.

**Parallel lanes** (no shared files within a wave):
- Wave 0: CT200-00, CT200-01, CT201-01
- Wave 1: CT200-01b, CT200-02, CT200-03, CT200-05, CT200-06
- Wave 2: CT200-04a, CT201-02
- Wave 3: CT200-04b, CT201-03, CT201-04, CT201-05, CT201-07, CT201-08 (CT200-04b and CT201-08 both edit C&C `src/tools/workflows/`, but disjoint files: the three Panopto tools belong to CT201-08 only)
- Wave 4: CT200-07, CT201-06
- Wave 5: CT200-08, CT201-10
- Wave 6: CT201-13, CT200-09, CT201-11 (CT201-11 moved here: it shares `src/surface/registry.ts` and `skills/**` with CT201-10)
- Wave 7: CT200-10, CT200-11
- Wave 8: CT201-14
- After release `vN`: CT201-12 (Kevin-gated), CT-99
- Retired: CT201-09 (folded into CT201-12, review round 1 item 2)

| id | domain | may touch | must not touch | deps | acceptance checks | proof | size |
|---|---|---|---|---|---|---|---|
| **CT200-00** | CI discovery (read-only) | none (a throwaway branch running `npm test` on `windows-latest` and `macos-latest` via a temporary workflow file, **not merged**) | everything on the PR branch | — | Workflow ran to completion | Comment on #200 with failing-test inventory per package | S |
| **CT200-01** | shared-types: path resolver | `packages/shared-types/src/app-paths.ts` (new), `packages/shared-types/tests/app-paths.test.ts` (new), `packages/shared-types/tests/fixtures/app-paths-cases.json` (new), `packages/shared-types/src/index.ts` (export line) | `canvas-store.ts`, every other package | Q1a answered (default: issue layout) | `npm test --workspace=packages/shared-types` covers every §4.1 row, including blank env and upgrade-window rows, with `legacyExists` / `newExists` / `ignoreUpgradeWindow` injected through `PathEnv` so no row touches the host filesystem and all pass on any OS | Test output | M |
| **CT200-01b** | shared-types: canvas store uses the resolver | `packages/shared-types/src/canvas-store.ts` (`ccHome()` / `canvasDesignHome()` bodies only), `packages/shared-types/tests/canvas-store*.test.ts` (existing; add cases) | `app-paths.ts`, `src/index.ts`, every other package | CT200-01 | `ccHome()` returns `ccConfigHome()` and `canvasDesignHome()` returns `cdsConfigHome()`; exported names and signatures unchanged; new cases: win32 injected → `%APPDATA%` homes, blank `CC_HOME` treated as unset; `npm test --workspace=packages/shared-types` green; `grep -n 'homedir' packages/shared-types/src/canvas-store.ts` empty | Test output plus grep | S |
| **CT200-02** | Go installer: path twin | `installer/tasks/apppaths.go` (new), `installer/tasks/apppaths_test.go` (new), `installer/tasks/configs.go`, `.github/workflows/installer-ci.yml` (paths filter only) | `installer/screens/**`, `mcphost*.go`, any TS | CT200-01 | `cd installer && go test ./tasks/...`; test iterates the shared fixture; `CcHomePath()` delegates | installer-ci green on ubuntu/macos/windows | S |
| **CT200-03** | shared-types: Windows migration | `packages/shared-types/src/app-home-migration.ts` (new), `packages/shared-types/tests/app-home-migration.test.ts` (new), `packages/shared-types/src/index.ts` | `app-paths.ts` (read-only), other packages | CT200-01 | All §7 migration cases (copy once, re-run no-op, conflict untouched and no rename, symlink skipped, interrupted resume including an orphan `.staging-*`, concurrent, staged switch flips config home last) pass with `platform: 'win32'` injected | Test output | M |
| **CT200-04a** | C&C: own config/data homes | `packages/command-and-control/src/kb/config.ts`, `src/channel/installed.ts`, `src/channel/catalog.ts`, `src/registry/local_registry.ts`, `src/tools/publish/snapshot_store.ts`, `src/tools/publish/snapshot_location.ts` (comment), `src/tools/setup_ollama.ts` (cache path only), matching existing tests under `packages/command-and-control/tests/{kb,channel,registry,publish}/` | `src/setup/**`, `src/modules/**`, `src/lib/**`, `src/tools/workflows/**` | CT200-01 | `getCcHomePath()` returns `ccConfigHome()`; data callers use `ccDataHome()`; C&C test suite green; existing `CC_HOME` tests unchanged | Test output | M |
| **CT200-04b** | C&C: cross-app readers | `packages/command-and-control/src/lib/kb-bridge.ts`, `src/tools/workflows/{ask_course,index_course_for_answers,update_course_materials}.ts`, `src/setup/read_state.ts` (institution path line only), their existing tests | `src/setup/doctor.ts`, `src/setup/types.ts`, `src/modules/**`, `src/tools/workflows/{bulk_fetch_panopto_transcripts,compare_transcripts,enrich_panopto_transcripts}.ts` (CT201-08 owns them) | CT200-04a | `grep -n "homedir()" ` in those files is empty; C&C tests green | Test output plus grep | S |
| **CT200-05** | CDS paths | `packages/canvas-design-studio/src/config.ts`, `src/tools/{update-kb,personas,philosophy}.ts` (const → function), `src/utils/registry.ts`, `src/tools/showcase/render_preview.ts`, matching tests under `packages/canvas-design-studio/tests/` | `src/index.ts`, other packages | CT200-01 | CDS suite green; new test: `CANVAS_DESIGN_HOME` redirects personas/philosophy/kb paths | Test output | S |
| **CT200-06** | CI paths | `packages/curriculum-intelligence/src/config.ts`, its config test | everything else | CT200-01 | Blank `CURRICULUM_INTELLIGENCE_HOME` treated as unset; CI suite green | Test output | S |
| **CT200-07** | Startup migration wiring | `packages/command-and-control/src/setup/app_home_boot.ts` (new) + `tests/setup/app_home_boot.test.ts` (new), `packages/command-and-control/src/index.ts` (one call before `bridgeCanvasStoresAtStartup`), `packages/command-and-control/src/setup/doctor.ts` (one `bootAppHomes` call as the first statement of `runDoctor()`, skipped when `opts.state` is injected; nothing else), `tests/setup/doctor_boot.test.ts` (new), `packages/canvas-design-studio/src/index.ts` (boot call, plus the `~/.canvas-design-mcp` user-facing strings at :296 (`generate_student_personas` description), :517 and :653 (error causes); `:69` Docker example untouched), `packages/curriculum-intelligence/src/index.ts` (boot call) | `src/setup/{read_state,types,apply,get_started}.ts`, `packages/canvas-toolchain/**` | CT200-03, -04b, -05, -06 | Boot never throws (test with an unwritable home); migration runs before the first config read; `runDoctor()` calls `bootAppHomes` exactly once before `readSetupState`, and zero times with `opts.state` injected; `npm run smoke:integration --workspace=packages/command-and-control` green; `node packages/canvas-toolchain/bin/canvas-toolchain.mjs doctor --json` still exits with a report on macOS (journal says `nothing-to-do`) | Test, smoke and CLI output | S |
| **CT200-08** | Doctor: paths | `packages/command-and-control/src/setup/{read_state,doctor,types}.ts`, `tests/setup/{read_state,doctor}*.test.ts` | `src/modules/**`, tools | CT200-04b, CT200-07 | Doctor `paths.homes` reports three apps with source, journal outcome, legacy-present and outside-profile warn (win32 injected); hard-coded `~/.command-and-control` strings in `doctor.ts:131,231` replaced with resolved paths; secret-absence test still passes | Test output plus a redacted `canvas-toolchain doctor --json` sample on macOS | M |
| **CT200-09** | Path guard + script fix | `scripts/check-app-paths.mjs` (new, with a `--self-test` flag; the repo has no script test runner), `scripts/shell-edit-doctor.mjs`, root `package.json` (script entry), `.github/workflows/ci.yml` (one step) | product `src/**`, `scripts/verify-*.mts` (allowlisted, not edited) | all of CT200-01b…07 and CT201-04…08 (the guard must start green) | `node scripts/check-app-paths.mjs` exits 0 on the branch; `node scripts/check-app-paths.mjs --self-test` feeds the matcher planted violations (TS `join(homedir(), '.command-and-control')`, Go `os.UserHomeDir()` + `.canvas-design-mcp`) and allowlisted look-alikes, and exits 0 only if every one is classified correctly; CI runs both; the allowlist holds exactly the §4.1 entries, each with a reason, including the glob `scripts/verify-*.mts` and the temporary `packages/module-announcements/src/canvas.ts` entry marked "removed by CT201-12" | Before/after grep output for `homedir()` attached | S |
| **CT200-10** | Cross-OS CI job | `.github/workflows/ci.yml` (new `cross-os` job only) | other workflows | CT200-09 (same file), CT200-00 | Job runs the §7 named subset on ubuntu/macos/windows | CI green on all three OSes | S |
| **CT200-11** | Docs + strings (#200) | `docs/commands-and-credentials.md` (§3 paths, Windows ACL limitation, §4), `docs/user-guide.md` (path mentions), `packages/command-and-control/src/tools/{review_accessibility_policy,open_dashboard}.ts`, `src/tools/showcase/preview_canvas_pattern.ts`, `src/cli/dashboard.ts` (strings only), regenerated `packages/command-and-control/skills/**` if any description changed | `src/setup/**`, `module-catalog.json`, `docs/modules.md` | CT200-08 | `node scripts/skills/lint.mjs`, `build-index.mjs --check`, `moc.mjs --check` pass; per-OS path table present | Doc diff | S |
| **CT201-01** | Module contract v2 | `packages/module-contract/src/index.ts`, `packages/module-contract/tests/*.test.ts` (new or existing) | every other package | — | Guard accepts v1 unchanged; v2 with valid declarations accepted; malformed declarations rejected; `requireCtx()` throws `MODULE_NOT_INITIALIZED` before init | Test output | S |
| **CT201-02** | shared-types: credential store + loader | `packages/shared-types/src/module-credentials.ts` (new), `packages/shared-types/tests/module-credentials.test.ts` (new), `packages/shared-types/src/index.ts` | `canvas-store.ts` (call its loader, don't edit), other packages | CT200-01, CT200-01b (canvas-store on the resolver), CT200-03 (index.ts), Q2 | Tests: two modules with different tokens at once; shared-only → `source:'shared'`; share-denied; incomplete never mixes; bad id refused; `0o700`/`0o600` on POSIX; no value in any thrown message | Test output | M |
| **CT201-03** | C&C host: ctx + registry | `packages/command-and-control/src/modules/registry.ts`, `src/modules/context.ts` (new), `tests/modules/**` (the legacy-hint wrapper is applied in `registry.ts` where a legacy channel module enters `active`, §5.3, and only when `process.platform === 'win32'`; platform injectable for tests) | `src/index.ts`, `src/surface/module_adapter.ts`, `src/setup/**`, module packages | CT201-01, CT201-02, CT200-04a | Tests: v2 init before tools are exposed; undeclared kind → `CREDENTIAL_NOT_DECLARED`; v1 module loads with no ctx; legacy `*_NOT_CONFIGURED` hint asserted **through the production path** (`loadModules()` → `adaptModuleTools(id, byId.get(id).tools)` → `op.handler` rejects with the hint), not through `handlers`; the same test with `platform: 'darwin'` shows the original error with **no** Windows hint; type-level contract ↔ shared-types assignability test | Test output | M |
| **CT201-04** | module-group-builder | `packages/module-group-builder/**` | other packages | CT201-01 | No `homedir`/`canvas-config.json` in `src/`; tests use fake ctx; suite green | Test output plus grep | S |
| **CT201-05** | module-roster | `packages/module-roster/**` (incl. path-taking exports: the vault API and `loadColumnMap(configDir)`) | other packages | CT201-01 | As CT201-04, plus anthropic via `tryGet` (degrade path tested); `loadColumnMap` takes a directory and roster's own callers pass `ctx.paths.config` | Test output plus grep | M |
| **CT201-06** | module-peerassessment | `packages/module-peerassessment/**` | other packages | CT201-05 | As CT201-04; uses roster's new vault API and `loadColumnMap(ctx.paths.config)` (`src/source/peoplesoft.ts`) | Test output plus grep | S |
| **CT201-07** | module-oral-assessment | `packages/module-oral-assessment/**` | other packages | CT201-01 | As CT201-04 for anthropic | Test output plus grep | S |
| **CT201-08** | Panopto seam: module-video + its only host callers | `packages/module-video/**`, `packages/command-and-control/src/tools/workflows/{bulk_fetch_panopto_transcripts,compare_transcripts,enrich_panopto_transcripts}.ts`, `packages/command-and-control/tests/tools/workflows/{bulk_fetch_panopto_transcripts,compare_transcripts,enrich_panopto_transcripts}.test.ts` | every other C&C file, other packages | CT201-01, CT201-02 (`resolveModuleCredential`), CT200-01 (`ccConfigHome`) | Panopto via ctx inside the module; transcripts under `ctx.paths.designStudioData`; `cc-home.ts` deleted; no-arg `loadPanoptoConfig` export removed and `loadPanoptoVocab(configDir)` path-taking; the three C&C tools resolve Panopto through `resolveModuleCredential('video','panopto',{shareDefault:true})` and keep their `PANOPTO_NOT_CONFIGURED` message; `npm test --workspace=packages/module-video` and `--workspace=packages/command-and-control` green; `npm run build` green | Test output plus grep | M |
| **CT201-09** | *Retired.* Folded into CT201-12 (review round 1 item 2: the announcements source cannot change before the catalog moves) | — | — | — | — | — | — |
| **CT201-10** | `ct_setup module_credentials` | `packages/command-and-control/src/tools/setup_module_credentials.ts` (new) + test, `src/surface/registry.ts` (new op), regenerated `packages/command-and-control/skills/**` | `src/setup/{read_state,doctor}.ts`, `src/modules/registry.ts` | CT201-02, CT201-03 | set validates then saves; test/share/unshare; clear is two-call; undeclared kind and legacy module refused; results contain no secret (assert); skills lint/index/moc checks pass | Test output plus transcript (redacted) | M |
| **CT201-11** | Uninstall cleanup + conditional confirm gate | `packages/command-and-control/src/tools/module_channel_tools.ts`, `src/channel/install.ts` (uninstall only), `src/surface/registry.ts` (`uninstall_module` entry only: `confirm` in `inputSchema`, description), regenerated `packages/command-and-control/skills/**`, their tests (`tests/channel/**`, `tests/tools/module_channel*`) | `src/modules/**`, `src/setup/**`, every other `registry.ts` entry | CT201-02, CT200-04a, **CT201-10** (shares `registry.ts` and `skills/**`, so strictly after it) | No credential file: uninstall is one call, unchanged (existing tests pass untouched). Credential file present: no `confirm` returns `CONFIRMATION_REQUIRED` mentioning stored credentials and deletes nothing (artifact, record and credential file all still present); `confirm: true` uninstalls and deletes the credential file; disable never deletes; `node scripts/skills/lint.mjs`, `node scripts/skills/build-index.mjs --check`, `node scripts/skills/moc.mjs --check` pass; `npm test --workspace=packages/command-and-control` and `npm run build` green | Test output | S |
| **CT201-13** | Doctor: per-module credentials | `packages/command-and-control/src/setup/{read_state,doctor,types}.ts`, `tests/setup/**` | modules, tools | CT200-08 (same files), CT201-03 | `modules.credentials` rows per declared kind; shared-fallback list; legacy label; module credential files included in `security.file_permissions`; secret-absence test extended | Test output plus redacted doctor JSON | M |
| **CT201-14** | Docs (#201) | `docs/commands-and-credentials.md` (§3 intro line "channel adds no new credentials", §3.1 table), `docs/architecture-modules.md` (contract v2, ctx, declarations, trust caveat, token-scope reality), `docs/module-channel.md` (publishing a v2 module) | `docs/modules.md` (generated), code | CT200-11 (same file), CT201-10, CT201-13 | Docs match shipped behaviour; storage layout, fallback rules and in-process caveat present | Doc diff | S |
| **CT201-12** | Announcements 1.2.0: source + artifact + catalog in one PR (**Kevin-gated, after the `vN` release tag**) | `packages/module-announcements/**` (contract v2, version → 1.2.0), `modules/announcements/1.2.0/announcements-1.2.0.mjs` (new, built by `npm run build:module -- announcements`), `module-catalog.json` (announcements entry only), `docs/modules.md` (via `npm run docs:modules`), `scripts/check-app-paths.mjs` (delete the temporary allowlist entry only) | `modules/announcements/1.1.0/**`, every other package and file | CT201-01, CT200-09, release `vN` published, Kevin OK | Module suite green; `npm run build:module -- announcements` twice gives the same sha256; `npm run verify:modules` green (built == committed == catalog for 1.2.0); `npm run docs:modules && git diff --exit-code docs/modules.md` clean; `node scripts/check-app-paths.mjs` green with the entry gone; `minHostVersion` = N; `git diff --stat origin/main -- modules/announcements/1.1.0` empty; installer-ci green (it triggers on `module-catalog.json`) | CI green; release URL; sha256 | M |
| **CT-99** | Manual Windows proof (Kevin) | none | — | all above | Seeded legacy home migrates; doctor JSON shows `%APPDATA%`/`%LOCALAPPDATA%`; module-specific Canvas token set through `ct_setup` | Redacted doctor JSON plus transcript attached to the PR | S |

*Note on CT200-09 ordering:* the guard lands only after every module job, because module packages still contain `homedir()` until their CT201 job runs. Builders on CT201-04…08 should run the guard locally as a self-check. `module-announcements` is the exception: its source cannot change before release (§5.4), so it rides a temporary allowlist entry that CT201-12 deletes.

## 13. Review round 1

A reviewer from another vendor returned **CHANGES** (5 blocking, 6 nits). I checked every finding against the code at `36bd43a` before acting. All 11 hold up. None was rejected outright; for #9 I took the reviewer's allowlist option rather than rewriting the scripts.

| # | Finding | Verified against | Resolution |
|---|---|---|---|
| 1 | `canvas-store.ts` `homedir()` not covered by any job | `shared-types/src/canvas-store.ts:27,47-52`; CT200-01 and CT201-02 both listed it as must-not-touch | **Fixed.** §4.1 call sites now include it; new job **CT200-01b** (Wave 1) delegates `ccHome()` / `canvasDesignHome()` to the resolver; CT201-02 depends on it; CT200-09 deps start at CT200-01b |
| 2 | Bumping announcements to 1.2.0 breaks `verify:modules` | `verify-module-artifacts.mjs:27-84` rebuilds each catalog entry from current source; `build-module.mjs:20-23` names output from `package.json`; the catalog pins 1.1.0; `main` CI green at baseline (run 39074680862) | **Fixed by resequencing.** CT201-09 is retired. Source, artifact, catalog bump and docs regeneration are one post-release, Kevin-gated PR (**CT201-12**, now size M). The announcements source is must-not-touch for every other job. The guard gets a temporary allowlist entry for `module-announcements/src/canvas.ts`, which CT201-12 deletes. The alternative of changing the verify script was rejected (§5.4) |
| 3 | C&C Panopto workflow tools use module-video loaders outside ctx | `bulk_fetch_panopto_transcripts.ts:1,42`, `compare_transcripts.ts:10,69,83`, `enrich_panopto_transcripts.ts:15-16,68,83`; exports at `module-video/src/index.ts:26-27` | **Fixed.** §4.5 defines the host path: `resolveModuleCredential('video','panopto',{shareDefault:true})` plus a path-taking `loadPanoptoVocab(configDir)` fed `ccConfigHome()`. CT201-08 now owns module-video **and** those three files plus their tests, so the export change and its only callers land atomically. CT200-04b lists them as must-not-touch. CT201-08 gains a dep on CT201-02 |
| 4 | Migration doesn't run from `canvas-toolchain doctor` | `canvas-toolchain.mjs:15,133` imports `dist/setup/index.js` and calls `runDoctor()`; `doctor.ts:656-659`; `installer/tasks/doctor.go` | **Fixed.** §5.1 adds `runDoctor()` as a fourth caller (first statement, skipped when `opts.state` is injected, which is how `get_started.ts:542` calls it). `readSetupState()` stays read-only on purpose. CT200-07 may now touch that one line of `doctor.ts`, with new acceptance checks |
| 5 | Legacy wrapper on the unused `handlers` map | `index.ts:77-80` dispatches via `loadedModules.byId` → `adaptModuleTools` (`module_adapter.ts:13-28`); `handlers` (`registry.ts:158-165`) has no production reader | **Fixed.** §5.3: `registry.ts` stores a wrapped shallow copy of each legacy channel module in `active`, so `byId` and `handlers` both carry the wrapper. CT201-03's acceptance test drives `loadModules()` → `adaptModuleTools` → `op.handler`. `index.ts` and `module_adapter.ts` are must-not-touch. Self-review item 7 is annotated |
| 6 | Q1(a) incompatible with the two-root `AppPaths` | §4.1 interface, §2.2 classification rule | **Folded into Q1(a)** as a concrete option: a third `secrets` root, its Windows/POSIX/override resolution, three-root staging order, and which files move. It applies only if Kevin accepts 1(a) |
| 7 | Date-only rename collides on a same-day retry | Windows `rename` onto an existing dir fails | **Fixed.** §5.1 step 4: `YYYYMMDD-HHmmss`, plus a `-2…-100` suffix on collision, then `partial`. Q6 updated |
| 8 | peerassessment also uses roster's `loadColumnMap` | `module-peerassessment/src/source/peoplesoft.ts:1,10`; `module-roster/src/peoplesoft/column-map.ts:6` | **Fixed.** §4.5 table, CT201-05 (exports `loadColumnMap(configDir)`), CT201-06 (calls it with `ctx.paths.config`), §10 risk row |
| 9 | Guard would fail on `scripts/verify-*.mts` | `homedir` + `.command-and-control` in `verify-64-publish-course.mts`, `verify-88-*.mts` (3 files) | **Fixed by allowlisting** the glob with a reason (maintainer-run, not shipped, not in CI, macOS-only). Rewriting them buys nothing. CT200-09 lists them as must-not-touch |
| 10 | `tryGet` returns an untyped union | §4.3 | **Fixed.** Per-kind `tryGet` overloads matching `get` |
| 11 | Fixture path separators | §4.1 | **Fixed.** Fixture stores forward slashes; TS compares `actual.replaceAll('\\','/')`, Go compares `filepath.ToSlash(actual)` |

**Job-list re-check after these edits (round 1):** every job names its may-touch and must-not-touch files. No two jobs in one wave share a file. The only shared directory is C&C `src/tools/workflows/` in Wave 3, and there CT200-04b and CT201-08 own disjoint, named files. CT200-07 → CT200-08 → CT201-13 stay strictly sequential on `src/setup/doctor.ts`. CT201-08 is the one job that crosses two packages. That is deliberate: splitting it would leave `main` failing to compile between the export change and its callers. All jobs are S or M.

## 14. Review round 2

The reviewer returned **CHANGES** (1 blocking, 3 nits). I checked each against the code in this worktree. All four hold up; none rejected.

| # | Finding | Verified against | Resolution |
|---|---|---|---|
| 1 (blocking) | `uninstall_module` has no preview/confirm today; CT201-11 lacked `registry.ts` and `skills/**` | `channel/install.ts:341-369` (single call, `{ moduleId }`), `surface/registry.ts:336-346` (`required: ['moduleId']`), `module_channel_tools.ts:26-36` | **Fixed.** §4.4 now says the job **adds** a gate, and a conditional one: `confirm?: boolean`, enforced only when a credential file exists, so credential-less uninstalls and their tests are unchanged (uniform gate rejected). CT201-11 may touch the `uninstall_module` registry entry and regenerated `skills/**`, and its checks include `lint.mjs`, `build-index.mjs --check`, `moc.mjs --check`. It shared those files with CT201-10 in Wave 5, so it moves to Wave 6 with a CT201-10 dependency |
| 2 (nit) | `PathEnv` lacks test-injection fields | §4.1 used `ignoreUpgradeWindow`, `legacyExists`, `newExists` that the interface did not declare | **Fixed.** `PathEnv` now declares all three; CT200-01 acceptance requires them injected so every row runs on any OS |
| 3 (nit) | `generate_student_personas` description hard-codes the path | `canvas-design-studio/src/index.ts:296` | **Fixed.** Added to §2.1 and CT200-07 (with :517/:653). `:69` is a Docker volume-mount example, left alone |
| 4 (nit) | Legacy hint shown to non-Windows users | §5.3 applied it to every `*_NOT_CONFIGURED` | **Fixed.** Appended only when `process.platform === 'win32'` (§5.3, CT201-03 code and acceptance, §7 test list); darwin test asserts no hint |

**Job-list re-check (round 2):** CT201-10 and CT201-11 no longer share a wave; they are strictly ordered on `registry.ts` and `skills/**`. CT200-11 (Wave 7) also regenerates skills but runs after both. CT201-11's other files (`install.ts`, `module_channel_tools.ts`) are touched by no other job (CT200-04a owns `installed.ts` and `catalog.ts`, not `install.ts`). All jobs remain single-domain, S or M, with runnable acceptance commands.
