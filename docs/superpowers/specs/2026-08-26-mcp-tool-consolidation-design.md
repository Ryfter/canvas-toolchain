# MCP tool surface consolidation — design

**Date:** 2026-08-26
**Status:** approved design, not yet implemented
**Scope:** `packages/command-and-control`, `packages/module-contract`, the six in-repo modules, and the docs that describe the tool surface.

## Problem

`canvas-toolchain` exposes **97 MCP tools** — 82 from the core server plus 15 from the six
in-repo modules:

| Source | Count |
| --- | --- |
| Inline in `src/index.ts` | 51 |
| `src/passthrough/ci_tools.ts` | 26 |
| `src/passthrough/downloader_tools.ts` | 3 |
| `src/passthrough/design_tools.ts` | 2 |
| Six modules (video 5, roster 3, group-builder 3, announcements 2, peerassessment 1, oral-assessment 1) | 15 |
| **Total** | **97** |

Every tool's name, description, and full `inputSchema` is injected into the model's context
on every turn. Three consequences, in the order they matter:

1. **Client tool-count limits.** Some MCP clients cap how many tools they accept or display.
2. **Context cost and selection accuracy.** Ninety-seven schemas is a large permanent context
   tax, and near-duplicate tools (six `list_*` variants) make the model pick wrong.
3. **Unbounded growth.** `src/index.ts:865` spreads `...loadedModules.tools` straight onto the
   top-level list, so every module a professor enables inflates the count further.

### A live bug this surfaced

`list_modules` is registered **twice**, meaning two different things:

- `src/index.ts:231` — list toolchain **plug-in modules**
- `src/passthrough/ci_tools.ts:111` — list **Canvas course modules** (a course's weeks/units)

Both are emitted into `tools/list`, so clients receive a duplicate tool name. In dispatch,
`runCoreTool`'s switch (`src/index.ts:905`) matches first and the passthrough lookup sits at
`src/index.ts:1081` — after it. **Listing a course's Canvas modules is therefore unreachable.**
The capability is built, documented, and dead.

This is not incidental. A flat 97-entry namespace with no uniqueness test is what allowed it,
and nothing in the current test suite would catch a recurrence.

## Goals

- Reduce the exposed tool count to ~10 and hold it there as modules are added.
- Lose no capability. Operations may change address; they may not vanish.
- Make the surface testable, so collisions and orphans fail CI instead of going unnoticed.
- Keep the decision reversible if the MCP ecosystem later makes large tool counts viable.

## Non-goals

- **Backward compatibility.** Two people run this toolchain and neither invokes tools by name.
  No aliases, no deprecation window. Old names cease to exist.
- **Professor-facing legibility.** The tool list is not a human-facing surface; professors
  describe what they want in prose. Optimise the list for the model.
- Rewriting handler logic. This is a wiring change.

## Decisions

### D1 — Organise by workflow intent, not object family

Tools mirror the semester lifecycle documented in `docs/tool-overview.md`, because that matches
how the toolchain is actually driven ("I just explain what I need"). Nine intent tools plus one
sidecar:

| Tool | Intent | Common actions |
| --- | --- | --- |
| `ct_setup` | get connected | cc, anthropic, canvas, ollama, backup, transcripts, course, courses_root, status |
| `ct_import` | pull in prior course data | canvas_archive, transcripts, previous_shell, course |
| `ct_inspect` | read current course state | state, assignments, pages, canvas_modules, resources, export |
| `ct_analyze` | find what's stale | course, diff_semesters, topics, currency, off_syllabus |
| `ct_plan` | plan next semester | semester, outline, shift_dates, assignment_brief |
| `ct_build` | generate materials | course, materials, examples, layout, rubric, full_pipeline |
| `ct_review` | quality/accessibility gate | accessibility, queue, rubric, policy |
| `ct_publish` | safe publishing | preview, publish, rollback, snapshots |
| `ct_ask` | course Q&A | ask, index |
| `ct_advanced` | sidecar over the long tail | describe, run |

`ct_inspect` is kept separate from `ct_analyze` deliberately: `ct_inspect` is cheap and
read-only, `ct_analyze` costs LLM calls. Merging them would make cost unpredictable.

`ct_inspect(action: "canvas_modules")` is where the shadowed CI tool returns to life; the
collision resolves by construction because the two `list_modules` land in different tools.

### D2 — The sidecar is in-band `describe`/`run`, not Resources or dynamic toolsets

Three mechanisms were considered for exposing the long tail without paying its schema cost:

| Option | Verdict |
| --- | --- |
| **S1** in-band `describe`/`run` actions | **Chosen.** No protocol dependency; works in every client. |
| **S2** MCP Resources as a schema store | Rejected. Client support treats resources as user-attached, so the model cannot fetch autonomously — right mechanism, wrong actor. |
| **S3** dynamic toolsets via `notifications/tools/list_changed` | Deferred. Nicer when it works, but depends on clients honouring `list_changed` and re-fetching mid-conversation; when they don't, the model is stranded with no fallback. |

Contract:

```
ct_advanced({ action: "describe" })                    -> sections + operation names (cheap)
ct_advanced({ action: "describe", section: "quiz" })   -> full schemas for that section
ct_advanced({ action: "describe", operation: "..." })  -> full schema for one operation
ct_advanced({ action: "run", operation: "...", params: {...} })
```

`ct_advanced`'s static description carries **section names and operation names only — never
schemas**. That is the entire saving: names are cheap, schemas are not. Estimated 400–600
tokens against several thousand for the same operations as full `inputSchema` blocks.

**Error contract:** an unknown or malformed operation returns a *tool execution error*
(`isError: true`) whose payload lists valid operations for the nearest matching section — never
a protocol error. The MCP `2025-11-25` revision changed input-validation failures to tool
execution errors specifically to let models self-correct; this design depends on that.

Advanced sections: `modules`, `registry`, `transcripts`, `research`, `accessibility`,
`snapshots`, `design`, `admin`.

### D3 — One registry; exposure is a data field

Every operation — exposed or not — lives in one registry with its full schema:

```ts
interface Operation {
  id: string;
  section: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (args: unknown) => Promise<unknown>;
  taskCategory: TaskCategory;   // preserved: routes fast vs judgment LLM
  exposure: 'intent' | 'advanced' | 'internal';
  intentTool?: string;
  intentAction?: string;
}
```

`exposure` is the reversibility lever (see **Revisit**). Re-promoting an operation is a data
change, not a rewrite. A fourth mode, `'top-level'`, can be added later to restore an operation
as its own tool exactly as it exists today.

`taskCategory` already exists on `PassthroughTool` and drives fast-vs-judgment LLM routing. It
survives unchanged; dropping it would silently change which model runs which operation.

### D4 — Modules register into sections

`module-contract` 2.0.0 replaces `tools: ModuleTool[]` with `operations: ModuleOperation[]`:

```ts
export interface ModuleOperation {
  id: string;                 // host namespaces to `<moduleId>.<id>`
  section: string;
  description: string;
  inputSchema: Tool['inputSchema'];
  handler(args: unknown): Promise<CallToolResult>;
  promote?: { intentTool: IntentToolId; action: string };  // at most one per module
}
```

1. **Host-side namespacing** (`video.bulk_fetch_transcripts`) structurally prevents the
   `list_modules` collision class: the namespace is assigned by the host, not chosen by the author.
2. **Promotion cap of one** per module. Without a cap, "modules register into sections" decays
   back to today's situation one polite exception at a time.
3. **Over-cap promotions are ignored, not fatal** — the module still loads, extras dropped with
   a warning. This upholds the guarantee in `docs/tool-overview.md`: *"a problem with one module
   never prevents the toolchain itself from starting."*
4. **Sections: join an existing one, or declare exactly one of your own.** Unbounded options are
   both bad — forcing existing sections piles everything into `admin`; unlimited new sections
   just relocates the proliferation.

**Module channel caveat.** Modules install as hash-pinned artifacts from outside the repo, so a
1.x module can reach a 2.0 host. The contract gains an explicit `contractVersion`; the loader
**refuses incompatible modules with a clear message** rather than crashing or half-loading.
Today's `isCanvasToolchainModule` guard would accept a 1.x module and then fail confusingly when
`operations` is undefined. Backward compatibility is a non-goal, but artifacts outlive the host
that built them — this is a version gate, not compatibility support.

### D5 — Internal restructure

Handlers are **not touched**. Registry entries point at the functions already in `src/tools/`.

```
src/surface/
  operation.ts       Operation type
  registry.ts        all operations + exposure flags
  sections.ts        advanced sections
  list_tools.ts      derives tools/list from the registry
  dispatch.ts        routes tools/call -> handler
  intents/
    setup.ts  import.ts  inspect.ts  analyze.ts  plan.ts
    build.ts  review.ts  publish.ts  ask.ts  advanced.ts
src/index.ts         thin wiring — target ~100 lines, from 1106
```

Named `src/surface/`, **not** `src/registry/` — that path already exists and means the *resource*
registry (`install_resource`, `local_registry`, `search_registry`). Two registries sharing one
name is how the `list_modules` problem happens a second time.

`full_pipeline` becomes an operation whose handler calls other operations *through the registry*.
That is also what makes the internal demotions work: internal callers use the registry, they just
are not exposed.

## Disposition table

All 97 operations, each with its verdict and destination. **No operation is deleted.** Verdicts: `merge` = becomes an intent-tool action; `demote` = moves to a `ct_advanced` section, still callable with its schema on request; `internal` = runs as a step inside another operation and is no longer separately callable.

| Verdict | Count |
| --- | --- |
| merge | 52 |
| demote | 42 |
| internal | 3 |
| **delete** | **0** |

> **Provenance.** The mechanical mapping was drafted by `openrouter-ox-alpha` (bulk fleet worker) and reviewed row-by-row before acceptance, per that worker's `UNBENCHMARKED ... never as a finisher` seating. Four rows were corrected: `discover_tools` (proposed *delete* — the rationale misread it as MCP tool enumeration when it scans the Canvas instance for institutional tooling), and `show_canvas_capabilities`, `enrich_panopto_transcripts`, `fetch_academic_calendar` (each proposed *internal*, each restored to *demote* because they are useful standalone). Only the three pre-approved internals stand.


### Core — inline (`src/index.ts`) (51)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `setup_cc` | merge | `ct_setup:cc` | Direct cc setup action match. |
| `setup_anthropic` | merge | `ct_setup:anthropic` | Direct anthropic setup action match. |
| `setup_canvas` | merge | `ct_setup:canvas` | Direct canvas setup action match. |
| `setup_ollama` | merge | `ct_setup:ollama` | Direct ollama setup action match. |
| `show_canvas_capabilities` | demote | `advanced:design` | Canvas-safe pattern catalog; useful as a standalone lookup. |
| `preview_canvas_pattern` | merge | `ct_build:layout` | Pattern preview belongs with layout building. |
| `set_active_llm_provider` | demote | `advanced:admin` | Runtime provider toggle; infrequent admin control. |
| `set_module_enabled` | demote | `advanced:modules` | Plug-in enablement lives in modules sidecar. |
| `list_modules` | demote | `advanced:modules` | Lists toolchain plug-ins per consolidation note. |
| `browse_module_catalog` | demote | `advanced:modules` | Catalog browsing is plug-in management. |
| `install_module` | demote | `advanced:modules` | Plug-in installation stays in modules sidecar. |
| `uninstall_module` | demote | `advanced:modules` | Plug-in removal stays in modules sidecar. |
| `discover_tools` | demote | `advanced:modules` | Scans Canvas for institutional tooling; not MCP enumeration. |
| `save_institution_profile` | demote | `advanced:admin` | Occasional profile entry; administrative data. |
| `submit_usage_feedback` | demote | `advanced:admin` | Non-core feedback channel. |
| `set_course_aias_default` | demote | `advanced:admin` | Per-course defaults are admin settings. |
| `set_courses_root` | merge | `ct_setup:courses_root` | Exact courses_root action match. |
| `open_dashboard` | merge | `ct_setup:status` | Dashboard view equals status reporting. |
| `get_cc_status` | merge | `ct_setup:status` | Direct status action match. |
| `analyze_course` | merge | `ct_analyze:course` | Exact course analysis action match. |
| `plan_next_semester` | merge | `ct_plan:semester` | Exact semester planning action match. |
| `update_course_materials` | merge | `ct_build:materials` | Direct materials action match. |
| `full_pipeline` | merge | `ct_build:full_pipeline` | Exact full_pipeline action match. |
| `bulk_fetch_panopto_transcripts` | merge | `ct_import:transcripts` | Transcript acquisition is import action. |
| `enrich_panopto_transcripts` | demote | `advanced:transcripts` | Costly LLM step; must be re-runnable on its own. |
| `setup_transcript_source` | merge | `ct_setup:transcripts` | Direct transcripts setup action match. |
| `compare_transcripts` | demote | `advanced:transcripts` | Niche comparison kept callable in sidecar. |
| `preview_course_publish` | merge | `ct_publish:preview` | Direct preview action match. |
| `publish_course` | merge | `ct_publish:publish` | Direct publish action match. |
| `rollback_course_publish` | merge | `ct_publish:rollback` | Direct rollback action match. |
| `list_publish_snapshots` | merge | `ct_publish:snapshots` | Snapshot listing folds into snapshots action. |
| `prune_publish_snapshots` | demote | `advanced:snapshots` | Housekeeping rarely needed at top level. |
| `setup_lecture_answers` | merge | `ct_ask:index` | Answer-engine setup is index configuration. |
| `index_course_for_answers` | merge | `ct_ask:index` | Direct index action match. |
| `ask_course` | merge | `ct_ask:ask` | Direct ask action match. |
| `reembed_course_index` | internal | `inside:ct_ask:index` | Pre-decided reindex step inside indexing. |
| `snapshot_course` | internal | `inside:ct_publish:publish` | Pre-decided; snapshots taken during publish. |
| `draft_student_rubric` | merge | `ct_build:rubric` | Rubric drafting matches build rubric action. |
| `review_canvas_rubric` | merge | `ct_review:rubric` | Direct rubric review action match. |
| `accessibility_review_queue` | merge | `ct_review:queue` | Queue action matches directly. |
| `audit_course_accessibility` | merge | `ct_review:accessibility` | Direct accessibility review action match. |
| `review_accessibility_policy` | merge | `ct_review:policy` | Direct policy review action match. |
| `wave_deep_check` | demote | `advanced:accessibility` | Heavy WAVE audit; occasional deep check. |
| `brainstorm_interactive` | demote | `advanced:research` | Ideation session joins research sidecar. |
| `install_resource` | demote | `advanced:registry` | Resource installation is registry work. |
| `list_installed_resources` | demote | `advanced:registry` | Registry listing; inspect covers course resources. |
| `uninstall_resource` | demote | `advanced:registry` | Registry removal operation. |
| `search_registry` | demote | `advanced:registry` | Registry search operation. |
| `install_resources_from_lockfile` | demote | `advanced:registry` | Batch lockfile install is registry work. |
| `paste_layout` | merge | `ct_build:layout` | Layout application matches build layout action. |
| `save_layout_as_template` | demote | `advanced:design` | Template storage is design sidecar concern. |

### Core — `passthrough/ci_tools.ts` (26)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `setup_course` | merge | `ct_setup:course` | Direct course setup action match. |
| `get_course_state` | merge | `ct_inspect:state` | Direct state inspection action match. |
| `ingest_canvas_archive` | merge | `ct_import:canvas_archive` | Direct archive import action match. |
| `list_assignments` | merge | `ct_inspect:assignments` | Direct assignments inspection match. |
| `list_pages` | merge | `ct_inspect:pages` | Direct pages inspection match. |
| `list_modules` | merge | `ct_inspect:canvas_modules` **(was shadowed — now reachable)** | Per note: lists Canvas course modules. |
| `list_resources` | merge | `ct_inspect:resources` | Direct resources inspection match. |
| `diff_semesters` | merge | `ct_analyze:diff_semesters` | Direct diff_semesters action match. |
| `ingest_transcripts` | merge | `ct_import:transcripts` | Direct transcripts import action match. |
| `map_transcripts_to_weeks` | internal | `inside:ct_import:transcripts` | Pre-decided week mapping inside ingestion. |
| `extract_lecture_topics` | merge | `ct_analyze:topics` | Topic extraction matches topics action. |
| `find_off_syllabus_topics` | merge | `ct_analyze:off_syllabus` | Direct off_syllabus action match. |
| `build_quote_bank` | demote | `advanced:research` | Quote bank is a research asset. |
| `fetch_news_feed` | demote | `advanced:research` | News gathering is research support. |
| `scan_recent_developments` | demote | `advanced:research` | Currency scanning joins research sidecar. |
| `suggest_topics` | merge | `ct_analyze:topics` | Topic suggestion matches topics action. |
| `score_topic_currency` | merge | `ct_analyze:currency` | Direct currency scoring action match. |
| `recommend_for_topic` | demote | `advanced:research` | Recommendation lookup is research support. |
| `generate_ideas_file` | demote | `advanced:research` | Ideation artifact kept beside research outputs. |
| `import_previous_shell` | merge | `ct_import:previous_shell` | Direct previous_shell import match. |
| `fetch_academic_calendar` | demote | `advanced:research` | Calendar lookup is useful independently of date shifting. |
| `shift_dates` | merge | `ct_plan:shift_dates` | Direct shift_dates action match. |
| `generate_recommended_outline` | merge | `ct_plan:outline` | Outline generation matches outline action. |
| `draft_assignment_brief` | merge | `ct_plan:assignment_brief` | Direct assignment brief action match. |
| `update_examples` | merge | `ct_build:examples` | Direct examples action match. |
| `export_course_folder` | merge | `ct_inspect:export` | Direct export action match. |

### Core — `passthrough/downloader_tools.ts` (3)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `setup_canvas_backup` | merge | `ct_setup:backup` | Direct backup setup action match. |
| `download_canvas_archive` | merge | `ct_import:canvas_archive` | Archive retrieval feeds import action. |
| `download_transcripts` | merge | `ct_import:transcripts` | Transcript retrieval feeds import action. |

### Core — `passthrough/design_tools.ts` (2)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `import_course` | merge | `ct_import:course` | Direct course import action match. |
| `generate_course` | merge | `ct_build:course` | Full generation matches build course action. |

### Module — video (5)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `setup_panopto` | demote | `advanced:transcripts` | Panopto credentials live with transcript sources. |
| `setup_panopto_vocab` | demote | `advanced:transcripts` | Vocabulary tuning sits with transcript tooling. |
| `video_embed` | merge | `ct_build:materials` | Embedding video while assembling materials. |
| `video_fetch_captions` | demote | `advanced:transcripts` | Caption fetching joins transcript sidecar. |
| `video_search` | demote | `advanced:transcripts` | Lecture-video search sits with transcripts. |

### Module — roster (3)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `commit_roster` | demote | `advanced:admin` | Roster commits are administrative records. |
| `propose_roster` | demote | `advanced:admin` | Roster proposals are administrative workflow. |
| `resolve_identity` | demote | `advanced:admin` | Identity resolution supports admin workflows. |

### Module — group-builder (3)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `create_groups` | demote | `advanced:admin` | Group creation is administrative course setup. |
| `propose_major_buckets` | demote | `advanced:admin` | Bucket proposals are group-admin workflow. |
| `record_groups` | demote | `advanced:admin` | Recording groups is bookkeeping. |

### Module — peerassessment (1)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `build_peerassessment_import` | demote | `advanced:admin` | Import-file builder is assessment administration. |

### Module — oral-assessment (1)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `design_oral_assessment` | demote | `advanced:design` | Assessment design fits design section. |

### Module — announcements (2)

| Tool | Verdict | Destination | Rationale |
| --- | --- | --- | --- |
| `audit_announcements` | demote | `advanced:admin` | Announcement audits are operational checks. |
| `recreate_announcement` | demote | `advanced:admin` | Announcement recreation is operational messaging. |

## Testing

**Existing suite unchanged.** All 140 test files import handlers directly from `src/tools/` —
none import `src/index.ts`. The restructure therefore breaks no existing tests. That same fact
explains the `list_modules` bug: **the tool surface currently has zero test coverage.**

One exception: `tests/server_identity.test.ts` tests by reading `src/index.ts` as a *string* and
asserting it contains `name: 'canvas-toolchain'`. It must be rewritten to assert against the
constructed server object.

New surface-layer tests:

- Every registry `id` is unique across core and module operations *(regression: `list_modules`)*
- `tools/list` returns exactly 10 tools
- Every intent action resolves to a live registry operation
- **Every registry operation is reachable via some exposure path** — the no-orphan test
- `ct_advanced describe` returns valid schemas per section
- `ct_advanced run` on an unknown operation returns `isError` with the valid-operation list
- Module contract: promotion cap enforced; over-cap ignored, not fatal; `contractVersion`
  mismatch refused cleanly

The no-orphan test is the mechanical guarantee behind "no capability is lost": an operation that
exists but no tool can reach becomes a failing test.

## Rollout

| Stage | Lands | Verification |
| --- | --- | --- |
| 0 | Registry built alongside the old surface; nothing exposed | Parity test: all 97 tools have exactly one registry entry |
| 1 | `ListTools`/`CallTool` derive from the registry; 10 tools live | Surface tests; `npm run smoke:integration` green |
| 2 | Old switch + passthrough presentation deleted | `index.ts` ~100 lines; full suite green |
| 3 | `module-contract` 2.0 + six modules migrated | Per-module load tests; version-gate test |
| 4 | Docs regenerated | `AGENTS.md`, `docs/commands-and-credentials.md` |

Stage 0 is deliberately inert. Proving parity **before** anything is exposed means the risky step
is a test run, not a release: if parity fails, a capability about to be lost is found while the
old surface is still live.

Stage 4 is a deliverable, not cleanup. `docs/commands-and-credentials.md` (35KB) and `AGENTS.md`
(40KB) both describe the 82-tool world; docs describing tools that no longer exist would be worse
than the current state.

## Revisit

This design removes granular tools from the exposed surface because the ecosystem makes 97 tools
expensive today. **That may not stay true.** Re-check quarterly — MCP has averaged roughly two
revisions a year, so a quarterly cadence catches a change within a release of it landing.

**Triggers to check:**

- A new MCP protocol revision (current: `2025-11-25`).
- Changes to `tools/list` pagination semantics.
- Broader client support for `notifications/tools/list_changed` — this would promote **S3** from
  deferred to viable.
- Any emerging tool-search or tool-indexing convention that makes large tool counts cheap.
- Client tool-count caps rising materially.
- Equivalent capabilities appearing in adjacent AI/agent specifications.

**Action if a trigger fires:** re-evaluate `exposure` flags in the registry. Because promotion is
a data change (D3), re-exposing operations is an afternoon's work, not a project. Nothing is
deleted to hit the tool count — the long tail is re-addressed, not removed, and `ct_advanced` is
what makes that guarantee concrete.

## Risks

| Risk | Mitigation |
| --- | --- |
| Model never reaches for `ct_advanced` and half-solves with intent tools | Each intent tool's description names the advanced section extending it; intent-tool errors name the section to look in |
| Extra round-trip on rare operations | Accepted. Schemas stay in context for the rest of a conversation once fetched — pay-per-use, per session |
| Merging silently drops a parameter | The disposition table reviews every operation individually; parity and no-orphan tests catch structural loss |
| A module built for 1.x reaches a 2.0 host | `contractVersion` gate refuses cleanly without breaking startup |
| Concurrent work by other agents in this repo | Stages are independently shippable; Stage 0 changes no behaviour |

## Open questions

None blocking. `ct_inspect`/`ct_analyze` could merge to reach nine tools if the split proves
unhelpful in practice; deferred until there is real usage evidence.
