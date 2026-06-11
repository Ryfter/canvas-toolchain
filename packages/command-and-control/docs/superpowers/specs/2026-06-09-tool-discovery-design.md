# Post-Install Tool Discovery Design (#76)

**Status:** Approved 2026-06-09
**Issue:** #76 — post-install institutional tool-discovery
**Depends on:** #78 (module architecture, shipped), #94 (`set_module_enabled`/`list_modules`, shipped)
**Feeds:** #77 (usage feedback — the institution profile this produces is #77's payload)

## Problem

After install, the toolchain has no idea what tools a professor actually uses. We want two things: (1) help the professor by detecting tools they have and offering to enable the matching modules, and (2) build a standardized "institution profile" that #77 can submit via GitHub so the author can prioritize what to support next. Most institutions will NOT have this level of API access — discovery must degrade gracefully to a manual path (universal-tool rule, `docs/institutions/example-university.md`).

## Solution overview

**Active discovery** (not just a survey): scan the Canvas instance + take the professor's self-report, match findings against the modules' `handles[]`, and offer to enable matching modules right there via the existing `set_module_enabled` tool. The institution profile is produced as part of the flow and is the #77 payload.

Two new C&C tools + reuse of `set_module_enabled`/`list_modules`:
- **`discover_tools`** (read-only) — runs the Canvas scan cascade, loads the catalog, cross-references detected/known tools against module `handles[]` and current enabled-state, returns a structured report. No side effects.
- **`save_institution_profile`** (write) — merges a confirmed tool set into the master profile (accretive) and writes per-class deltas into each course's `course-config.md`. Atomic 0o600 tmp+rename, same idiom as `set_module_enabled`.

The interactive "confirm & expand" happens in the conversation: Claude presents `discover_tools`' report, the professor confirms/adds tools, Claude calls `set_module_enabled` for accepted module suggestions and `save_institution_profile` to persist.

## Data model — accretive, two-tier

Professors use largely the same tools across all their classes, so the model is **inheritance, not repetition**:

- **Master institution profile** — `~/.command-and-control/institution-profile.md`. The cumulative *library* of every tool the professor uses. Running discovery again (new semester/class) **merges** new findings in; it never overwrites. This file IS the #77 payload.
- **Per-class deltas** — a `tools:` section added to each course folder's existing `course-config.md` (the files the dashboard already walks under `coursesRoot`). A class lists only deltas (also-uses / skips) referencing master tool ids; empty = inherits the master globals.

### Master profile format (structured markdown)

Human-readable for the GitHub submission (#77), machine-parseable for aggregation. Identifiers block + a fenced YAML `tools` data block:

```markdown
# Institution Profile

## Identifiers
- canvas: example.instructure.com

## Tools
​```yaml
tools:
  - id: panopto
    name: Panopto
    scope: global          # global = used everywhere; class = class-specific
    module: video          # the module handles[] id, or 'none'
    source: detected       # detected | self-reported
  - id: iclicker
    name: iClicker
    scope: global
    module: none
    source: self-reported
​```
```

Profile holds **only identifiers + tool inventory** — never API tokens or student data.

### Per-class delta (in `course-config.md`)

```yaml
tools:
  uses: [gradescope]     # in addition to master globals
  skips: [google-forms]  # a master global this class doesn't use
```

## The catalog — `packages/command-and-control/data/known-tools.yaml`

Hybrid: catalog the tools that map to a module (so suggestions are precise) and let everything else be captured free-form (the real #77 signal). Content-PR extensible, same spirit as `canvas-capabilities.yaml`. Each entry:

```yaml
- id: panopto
  name: Panopto
  identifiers: [panopto, example.hosted.panopto.com]   # LTI names/domains as they appear in Canvas external_tools
  module: video                                    # handles[] id, or null
```

Seed set: panopto→video, plus `module: null` entries for zoom, teams, google-meet, youtube, echo360, kaltura, iclicker, google-forms, turnitin, gradescope. A catalog **miss is not a failure** — an unmatched detected/typed tool is recorded with `module: none`, `source` preserved.

## Canvas scan — best-effort cascade

Uses `loadInstitutionConfig()` (`{ canvasUrl, apiToken }` from `canvas-config.json`) and direct `fetch` with Link-header pagination, mirroring existing C&C Canvas calls (`tools/publish/breadcrumbs.ts`).

1. **Account-level:** `GET /api/v1/accounts/self/external_tools` (and/or the account id from `/accounts`). Most complete; usually admin-only.
2. **On 401/403 → per-course:** list the professor's courses (`GET /api/v1/courses?enrollment_type=teacher&per_page=100`, paginated), then `GET /api/v1/courses/:id/external_tools` for each. Per-course results give **per-class attribution**; their union seeds the master.
3. **No usable token / total failure → self-report only:** skip the scan, return the catalog pick-list for the professor to choose from.

Partial failures degrade to "what we got" with a noted gap — never block. Each detected external tool is normalized (lowercased name/domain) and matched against catalog `identifiers`.

## Components & files

| File | Responsibility | Change |
| --- | --- | --- |
| `packages/command-and-control/data/known-tools.yaml` | Catalog data | **Create** |
| `src/discovery/catalog.ts` | Load + index the catalog (by id, by identifier) | **Create** |
| `src/discovery/canvas_scan.ts` | Cascade scan → `DetectedTool[]` grouped by course | **Create** |
| `src/discovery/profile.ts` | Parse / serialize / **merge** master profile; read/write `course-config.md` `tools:` delta | **Create** |
| `src/discovery/match.ts` | Cross-reference detected/catalog tools ↔ module `handles[]` + enabled state | **Create** |
| `src/tools/discover_tools.ts` | Read-only MCP tool: orchestrates scan + catalog + match → report | **Create** |
| `src/tools/save_institution_profile.ts` | Write MCP tool: accretive merge + per-class deltas | **Create** |
| `src/index.ts` | Register both tools as core (next to `set_module_enabled`) | **Modify** |
| tests for each of the above | | **Create** |

## Tool contracts

### `discover_tools()` (no required args; optional `{ scope?: 'account'|'course'|'self' }` to force a tier for testing/override)

Returns:
```ts
{
  scanTier: 'account' | 'course' | 'self-report';   // what actually ran
  gaps: string[];                                    // e.g. "account-level denied; used per-course"
  detected: Array<{ id?: string; rawName: string; courses?: string[]; catalogHit: boolean }>;
  matchedModules: Array<{ tool: string; module: string; enabled: boolean }>;  // suggestions
  unmatched: string[];                               // detected/known, no module — free-form #77 signal
  catalogPickList: Array<{ id: string; name: string; module: string | null }>; // for self-report/expand
}
```
Read-only. The handler reads module state via the same registry helpers `list_modules` uses.

### `save_institution_profile(input)`

```ts
{
  tools: Array<{ id: string; name: string; scope?: 'global'|'class'; module?: string; source: 'detected'|'self-reported' }>;
  identifiers?: Record<string, string>;     // e.g. { canvas: 'example.instructure.com' }
  perClass?: Array<{ courseDir: string; uses?: string[]; skips?: string[] }>;
}
```
- **Merge** `tools` into the existing master (by `id`): new ids added, existing ids updated (never dropped) — accretive like `set_module_enabled`'s manifest merge.
- Write each `perClass` entry as a `tools:` delta in that course's `course-config.md` (create the section if absent; validate `courseDir` exists).
- Atomic 0o600 write of the master. Returns `{ ok: true, profilePath, added: string[], updated: string[], classesWritten: string[] }` or `{ ok: false, error, message, fix }`.

## Flow

```
professor runs discover_tools (post-install; installer may nudge)
  → cascade scan + catalog load + module match
  → report { detected, matchedModules(suggestions), unmatched, catalogPickList }
Claude presents conversationally:
  "Across your courses I found Panopto (→ video module, currently DISABLED), iClicker, Google Forms.
   Enable video? Anything to add?"
professor: "yes, and add our oral-assessment tool"
  → Claude calls set_module_enabled({ module:'video', enabled:true })
  → Claude calls save_institution_profile({ tools:[…, oral-assessment], identifiers, perClass })
  → master institution-profile.md written/merged; #77 can later submit it
```

## Error handling / universal degradation

- No `canvas-config.json` / no token → `scanTier:'self-report'`, return catalog pick-list, no error.
- Account 401/403 → fall to per-course, note in `gaps`.
- A course read fails → include successful courses, note the gap.
- `save_institution_profile` with a `courseDir` that doesn't exist → `{ ok:false, error:'COURSE_NOT_FOUND' }`, master still written (per-class is best-effort and reported).
- Corrupt existing master → tolerant parse (treat as empty library), merge re-creates a clean file (same tolerance as `loadModuleManifest`).
- Never persist tokens or student data.

## Testing

- **catalog.ts** — loads YAML; indexes by id and by identifier; unknown identifier → miss.
- **canvas_scan.ts** — mocked fetch: account-200 → account tier; account-403 → per-course fallback (lists courses, unions tools, per-course attribution); no token → self-report tier; one course 500 → others still returned + gap noted.
- **match.ts** — catalog hit with a module → suggestion carrying enabled-state; catalog hit `module:null` → unmatched; detected raw name with no catalog hit → unmatched free-form.
- **profile.ts** — serialize→parse round-trip; **accretive merge** (second run adds new tool ids, preserves + updates existing, never drops; global vs class scope respected); corrupt master tolerated; `course-config.md` `tools:` delta written/updated without clobbering other config.
- **discover_tools / save_institution_profile** — end-to-end with mocked scan + tmp `CC_HOME`/`coursesRoot`: report shape; merge writes atomic structured markdown (0o600 on non-win32); `COURSE_NOT_FOUND`.

## Out of scope (YAGNI)

- Auto-promoting a tool found in all courses to `global` (the merge just records per-course attribution; the professor/Claude sets scope). Revisit if useful.
- The actual GitHub submission — that is #77.
- Account-id discovery beyond `accounts/self`; if `self` is denied, go straight to per-course.
- Editing/removing tools from the master via tool (hand-edit or re-run; deletion is rare).
