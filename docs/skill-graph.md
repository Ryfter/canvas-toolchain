# Skill graph for the `ct_*` operation surface (design)

Status: design + generated drafts. This document is the contract for
`scripts/skills/*.mjs` and the generated tree under
`packages/command-and-control/skills/`.

The goal: an agent that wants to run one operation should read **its intent
tool's topic map and one operation file**, not ten tool schemas plus an operation
catalog. `packages/command-and-control/src/surface/registry.ts` stays the single
source of truth; everything here is generated from it.

## 1. Layout

```text
packages/command-and-control/skills/
  index.md                  # generated: full catalog, one line per operation (fallback)
  moc/<section>.md          # generated: one per SectionId (8)
  moc/<intentTool>.md       # generated: one per intent tool (9) + moc/ct_advanced.md
  ops/<operation-id>.md     # one per Operation: frontmatter + hand-written body
  concepts/<idea>.md        # hand-written cross-cutting notes (J9)
```

Operation ids are unique across core and module operations (module ids are
host-namespaced in `src/surface/module_adapter.ts`), so the file name is exactly
`ops/<id>.md` with no escaping. Ids are `[a-z0-9_.]+`, which is safe as a bare
YAML scalar and inside a wikilink.

MOC file names live in a flat `moc/` directory. Section ids (`admin`, `design`,
…) and intent tool ids (`ct_*`) never collide, so a flat directory stays
unambiguous and a wikilink to a MOC needs no type prefix.

Scope note: this tree is **not** shipped in the npm package
(`packages/command-and-control/package.json` `files` is `["dist", "data"]`), so
nothing here can change the MCP server's runtime behavior. Module operations
only exist at runtime, after a module is enabled; see §9.

### 1.1 Path C — the agent's first read

Three candidate reads were measured (the numbers are in
[`skill-graph-baseline.md`](./skill-graph-baseline.md)). The plan routes agents
through **C**:

| Path | First read | Then | When it is the right start |
| --- | --- | --- | --- |
| A | `index.md` | `ops/<id>.md` | Fallback: the model does not yet know which `ct_*` tool it is in. |
| B | `index.md`, descriptions capped at 140 chars | `ops/<id>.md` | Measured only and rejected: capping drops the caveats selection needs. |
| **C** | **`moc/<intent tool>.md`** | **`ops/<id>.md`** | **The routed path.** The agent is dispatching an action, so it already knows its `ct_*` tool. |

So the first read is the public tool's topic map — `moc/ct_build.md`,
`moc/ct_review.md`, … — not `index.md`. A MOC is the same operation list already
filtered to one tool, so the read is smaller than the index *and* carries the
full uncapped descriptions. **`index.md` stays as the full 86-operation catalog**,
the fallback for the "which tool am I in?" step, which the model decides from the
tool descriptions it already holds.

Both routes end at the same file: the one `ops/<id>.md` the pick implies.

## 2. Frontmatter schema

Operation files (`ops/<id>.md`) carry exactly these keys, in this order:

```yaml
---
id: validate_quiz
description: "Check a quiz for migration hazards before students take it."
section: design
intent_tool: ct_review
intent_action: quiz
exposure: intent
related: [generate_quiz, check_shell_readiness]
---
```

| Key | Source | Notes |
| --- | --- | --- |
| `id` | `Operation.id` | File name minus `.md`. |
| `description` | `Operation.description` | Verbatim from the registry. Compared by the `drift` lint rule. |
| `section` | `Operation.section` | One of the 8 `SectionId`s in `surface/sections.ts`. |
| `intent_tool` | `Operation.intentTool` | Empty string when the op is not on an intent tool. |
| `intent_action` | `Operation.intentAction` | Empty string when absent. |
| `exposure` | `Operation.exposure` | `intent`, `advanced`, or `internal`. |
| `related` | seeded + curated, see §5 | Flow sequence of ids. Wikilink targets. |

All scalars are written as double-quoted strings except `related`, which is a
flow sequence of plain scalars. Strings are escaped for `\` and `"`; the
description is one line by construction (the registry descriptions contain no
newlines).

Map files (`index.md`, `moc/*.md`) carry a smaller schema — they are generated
maps, not skills:

```yaml
---
id: ct_review
kind: intent        # index | section | intent | advanced
description: "Accessibility and quality gates before students see anything."
ops: 6
related: [accessibility, design]
---
```

`concepts/*.md` are hand-written and are **not** covered by the op rules; the
lint only requires that they parse as frontmatter (if they have any) and that
their `id` does not collide with an operation id.

## 3. Wikilink syntax

* `[[op-id]]` — points at an operation file, `ops/<op-id>.md`.
* Links are only recognized inside generated regions and in hand-written bodies.
* A link resolves against the union of: operation ids, MOC ids (`moc/<name>.md`,
  used as `[[<name>]]`), and concept ids.
* Link text **is** the id; display text and aliases (`[[id|label]]`) are not
  supported in v1, so there is exactly one way to write a link and the `broken-wikilink`
  rule has nothing to parse beyond the id.
* `related:` in frontmatter is the machine-readable twin of the body wikilinks.
  The index and MOCs derive their links from `related` and from grouping, so an
  agent that only reads frontmatter still gets the graph edges.

## 4. Generated region vs hand-written body

Every generated file is split at one marker line:

```text
<!-- generated:end -->
```

Everything **above** the marker (frontmatter, headings, index lines, MOC
tables) is regenerated on every run. The marker line and everything **below**
it is never touched once the file exists. New files get a stub body owned by the
generator, which a human then enriches in place.

Consequences:

* Re-running the generator is idempotent: a second run produces zero git diff.
* Hand-written guidance, pitfalls, and examples survive regeneration.
* The frontmatter is authoritative-from-registry, so an op file whose
  frontmatter was hand-edited is reported by the `drift` rule and then repaired
  by the next run. A hand-written description that should outlive a run belongs
  in the registry, which is canonical.

## 5. Grouping and the deterministic seed

MOC assignment (`assignMocs`) is total: **every operation appears in at least
one MOC**, so an orphan is always a generator bug or a hand-deleted file.

| Exposure | MOCs containing the op |
| --- | --- |
| `intent` | `moc/<intent_tool>.md` and `moc/<section>.md` |
| `advanced` | `moc/ct_advanced.md` and `moc/<section>.md` |
| `internal` | `moc/<section>.md` only (never callable) |

There are 18 MOCs — 9 intent tools, `ct_advanced`, and 8 sections — because those
are exactly the closed sets the registry declares. A section MOC's `related`
lists every tool that reaches into it (the intent tools with operations there,
plus `ct_advanced` when the section has advanced operations); an intent MOC's
`related` lists the section that extends it, per `INTENT_TOOLS[].extendedBy`.
That makes the two directions of the same edge visible from either end.

A stale MOC (an id the registry no longer declares) is **left in place**: the
generator's job is to write, not to delete files a human may have annotated. The
`orphan` rule is the detector for that drift.

`related` seeding (`seedRelated`) is deterministic and capped at 8 ids:

1. Operations sharing `intent_tool`, in registry order — the primary seed. This
   is the "what else can I do from here" edge.
2. If the op has no `intent_tool` (advanced and internal ops), operations
   sharing `section`, in registry order.
3. Self is always excluded; the cap keeps a section of 34 admin ops from
   producing unusable link farms.

An LLM may *propose* more links, but only a human merges them, and the merge has
to survive the next idempotent run. That is what the curated data file is for.

### 5.1 Curated `related:` links (J8)

`scripts/skills/data/related.json` is the **hand-reviewed source** of the
intentional cross-tool links. It is not generated output and not part of the
skills tree, so editing it can never touch a generated region.

```json
{ "links": [ { "from": "generate_quiz", "to": "validate_quiz", "reason": "Author the draft locally, then check it." } ] }
```

* **Directed.** `{from, to}` adds `to` to the `related:` list of `from`'s op
  file. Author both directions when the relationship is useful both ways; the
  file is not symmetric by construction.
* **Ids only, deduped.** Every id must be a registered operation, every link
  carries a short `reason` for the reviewer, and a duplicate pair, a self link,
  or an unknown id is a `curated-link` lint violation (`node scripts/skills/lint.mjs`).
* **Merged, not replacing.** `lib/graph.mjs` `mergeRelated` takes the curated
  links first, fills the remaining slots from the deterministic seed, dedupes,
  drops self, and **sorts by id** — so the data file's own order is not
  significant, and reordering it produces a zero diff. The merged list is capped
  at `MAX_RELATED` (12 = the 8-id seed cap plus the curated budget); the cap
  drops seed links before any curated link.
* **Never hand-edit** `skills/ops/*.md` or `skills/moc/*.md`. A link that should
  outlive a regeneration belongs in this data file.

The curated layer is also what guarantees the plan's floor: **every operation's
`related:` is non-empty** (the seed alone already covers the core surface; the
curated layer adds the cross-tool workflow edges the seed cannot know about, such
as prerequisite/setup → use, publish → rollback, and the
transcripts ↔ lecture-answers pairs).

## 6. Lint rules

`scripts/skills/lint.mjs` (rules in `lib/lint-rules.mjs`). Any violation exits
non-zero; `--json` prints the machine-readable report.

| Rule | Scope | Violation |
| --- | --- | --- |
| `missing-description` | ops | `description` absent or empty. |
| `too-long` | ops | `description` longer than `--max-description` (default 200). |
| `duplicate` | ops | Two ops whose normalized descriptions are identical. |
| `near-duplicate` | ops | Normalized trigram Jaccard ≥ `--similarity` (default 0.8). |
| `broken-wikilink` | all files | A `[[x]]` body link or a `related:` entry where `x` is not an op, MOC, or concept id. |
| `orphan` | ops | Op in no MOC (`moc/*.md` no longer mentions it). |
| `drift` | ops, concepts | Ops — frontmatter `description` ≠ registry, frontmatter `id` ≠ file name, an op file the registry no longer declares, or a registry operation with no op file. Concepts — a frontmatter fence that never closes, or a concept id that collides with an operation id. |
| `curated-link` | `data/related.json` | A `from`/`to` id that is not a registered operation, a self link, or a duplicate `from -> to` pair (§5.1). |

`missing-description` short-circuits only the other *description* checks: the id
drift, registry drift, and `related:` link checks still run on an op whose
description is empty, so one empty field cannot hide the rest of the file's
problems.

Normalization for the duplicate rules: lowercase, strip the `[@canvas-toolchain/…]`
co-package prefix that several pass-through descriptions carry, collapse
whitespace and punctuation to single spaces, drop tokens of length < 2.

`orphan` is checked against the MOC files on disk rather than recomputed from
the registry, so a hand-deleted or hand-truncated MOC is caught. `moc/ct_advanced.md`
counts as a MOC.

Deliberately **not** in v1: any rule on prose quality, any tokenizer-based
length rule, and any rule that requires an LLM.

### 6.1 Measured against the real registry (2026-10-17)

`node scripts/skills/lint.mjs` on the 86 generated op files:

| Rule | Violations |
| --- | --- |
| `too-long` | 0 |
| everything else | 0 |

Description lengths: min 58, median 144, max 200 — every one inside the
200-character budget. J7 rewrote the 31 that exceeded it (the previous maximum
was 562), preserving each operation's constraints, prerequisites, safety
warnings, and the distinguishing "use this when / not that" clause. The
per-operation before/after table is in
[`skill-graph-j7-descriptions.md`](./skill-graph-j7-descriptions.md).

An earlier reading of this corpus argued the 200-character budget was
miscalibrated and recommended raising the lint default instead of shortening the
descriptions. That recommendation was superseded: the J7 rewrite showed the
caveats fit at 200, so the default stayed and the descriptions moved.

The nearest near-duplicate pair is `list_assignments` ↔ `list_pages` at **0.750** —
real, below the 0.8 threshold, and worth a human look rather than a rewrite.

The `curated-link` rule (J8) reports 0 against the committed
`scripts/skills/data/related.json` — 140 directed links, 86/86 operations with a
non-empty `related:` list. `lint.test.ts` holds the per-rule fixture (an
unknown `to`, an unknown `from`, a self link, and a duplicate pair).

## 7. Generator flow

```text
                       dist/surface/registry.js        scripts/skills/data/related.json
                                │  (npm run build first)        │  (hand-reviewed)
                                ▼                               ▼
                    lib/registry.mjs  loadOperations()   lib/related.mjs  loadCuratedRelated()
                                │  Operation[] (handler stripped) │  Map<from, to[]>
                                └───────────────┬───────────────┘
                                                ▼
                              lib/graph.mjs  seedRelated -> mergeRelated
                                 │ related: Map<opId, opId[]> (sorted)
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
   build-index.mjs        moc.mjs            lint.mjs
   index.md + ops/*.md    moc/*.md           report, exit code
              └─────────────────┴──────────────────┘
                                │
                        lib/emit.mjs  writeGeneratedFile()
                     (split at <!-- generated:end -->, keep the tail)
```

| Command | Writes |
| --- | --- |
| `node scripts/skills/build-index.mjs` | `skills/index.md`, `skills/ops/<id>.md` |
| `node scripts/skills/moc.mjs` | `skills/moc/<name>.md` |
| `node scripts/skills/lint.mjs [--json]` | nothing; exit 1 on violation |
| `node scripts/skills/eval-baseline.mjs` | `docs/skill-graph-baseline.md` |
| `node scripts/skills/eval-selection.mjs [--set easy\|hard\|all] [--out <dir>]` | `old-<set>.md` + `pathc-<set>.md` prompts (default `/tmp/ct-selection`, default set `easy`) |
| `node scripts/skills/eval-selection.mjs [--set easy\|hard\|all] --score <answers.json>` | nothing; prints overall `correct/total`, per-category accuracy, and the misses |

`--set` selects the fixture list: `easy` is the original 18 asks
(`selection.fixtures.json`), `hard` the 15 adversarial asks
(`selection.hard.fixtures.json`), and `all` their union as **one ordered list**,
so the ask numbers the prompts print and the ask numbers a score reads stay the
same list. The prompt files are named for the set, so running `--set easy` and
`--set hard` into one directory yields the four artifacts `old-easy.md`,
`pathc-easy.md`, `old-hard.md`, and `pathc-hard.md`.

`--score` maps a public-surface answer address to the operation it names before
comparing. Three address shapes resolve through the registry's
`intentTool`/`intentAction`/`id`/`section` fields:

* `<intentTool>.<intentAction>` (e.g. `ct_review.quiz`);
* `ct_advanced.<op id>` (e.g. `ct_advanced.prune_publish_snapshots`) and the
  section-qualified `ct_advanced.<section>.<op id>` (e.g.
  `ct_advanced.snapshots.snapshot_course`) — both only for an op `ct_advanced`
  can actually run (`exposure: 'advanced'`);
* any of the above with **spaces where the dots belong** (`ct_review quiz`,
  `ct_advanced snapshots snapshot_course`), because a model often writes the
  address that way.

So an answer given in the old surface's vocabulary — including the version with
no operation named, `ct_advanced.run`, which matches nothing and stays wrong — is
scored against the same operation the new surface would pick. A miss reports the
raw answer and its mapping, so an unmappable address is visible rather than
silently wrong.

Two rules beyond `expectedOp` + `alsoAcceptable` apply to the hard fixtures, and
the prompt asks for both explicitly:

* **`NONE` is a valid answer.** A hard ask whose capability the toolchain does
  not have (grading, Canvas Inbox/email, enrollment mutation) expects the literal
  `NONE` — the agent would ask a clarifying question instead of guessing.
  `NONE` is compared case-insensitively, a real op for a `NONE` ask is a miss,
  and `NONE` for a real op is a miss.
* **A chain ask is answered by its first op.** For a fixture with `chain`, the
  expected answer is `chain[0]` — the operation the workflow starts with — and
  the later steps are listed for the report but not accepted in its place.

Accuracy is reported **overall and per `category`** (`ambiguous-multi`, `chain`,
`decoy`, `vague`, `none`); a fixture without a category is `uncategorized`.

Flags on both writers: `--root <dir>` (skills root, default
`packages/command-and-control/skills`), `--check` (report what would change,
write nothing — the CI-safe form of the idempotency check), and
`--include-modules` (see §9).

Order matters only in that `moc.mjs` links to op ids while `build-index.mjs`
creates op files; both read the registry directly, so either can run first.

## 8. Idempotency and the check mode

A generator run is idempotent when: the op order is the registry order, the
merged `related` list is deterministic (the seed is registry-ordered and the
curated links are sorted by id, so the data file's own order does not matter),
and nothing embeds a timestamp, a version, or an absolute path. All three hold.
`--check` exists so CI can assert it without a dirty tree: it exits non-zero when
a regeneration *would* change a file.

## 9. Out of scope for v1

* **Module operations.** They are created at runtime by `module_adapter.ts` when
  a module is enabled, so generating them by default would make the output
  depend on the machine. `--include-modules` appends module ops for local use;
  the committed tree is core-only (86 ops).
* **The Python sidecar** (`canvas-backup` CLI bridge) — covered only through the
  pass-through operations, not as skill files.
* **A new MCP tool or a runtime surface hook.** `ct_ask` reading `index.md`
  first is J11. Nothing in this tree is loaded by the server.
* **The "212 skills" number** in the planning doc — unconfirmed, and this repo
  has 86 registry operations, which is what the generator counts.

## 10. Architect rationale

The `architect` skill (pstack) wants grounding, then two structurally distinct
candidates screened against its design red flags, then a synthesis. Its arena
step expects multi-model runners that this environment cannot launch, so the
sketching and the red-flag screen were done by hand; the design-twice
requirement was still honored, and the two candidates are recorded below.

**Grounding.** The registry is a flat `Operation[]` with a handler field, an
`exposure` enum, and an optional `intentTool`/`intentAction` pair; sections and
intent tools are closed sets derived from `surface/sections.ts` and
`intents/index.ts`; module ops are injected later with `section: 'modules'`. The
generator therefore has one real input (the operation list) and three pure
projections of it (index, op file, MOC), plus one side-effecting step (write).
The lint is a fourth pure projection. `lib/registry.mjs` does the dynamic
`import()` of the built `dist`, so handler functions never leak into the
output.

**Candidate A — one script.** A single `build-index.mjs` that loads the
registry, renders index, op stubs, and MOCs, and exposes `--lint`. Smallest file
count, and the fastest thing to write. Red flags: the marker-preserving write
logic is then reachable only by running the script against the real repo, so
every unit test becomes "run the script in a temp dir and diff"; the MOC
grouping rule and the link-resolution rule are not addressable on their own;
and J4/J5's fixtures would have to re-implement or shell out to parts of the
script. It also puts the whole surface behind one interface, which is a wide
interface with a shallow implementation for each caller's needs.

**Candidate B — thin entrypoints over a small library.** `lib/` holds the four
pure projections and the one write seam; four thin CLIs wrap them. Red flags
checked: the shared library is not a pass-through (deleting it would push the
marker split, the MOC rule, and the normalization into four call sites, and the
tests would each need their own copy), so it earns its keep by the deletion
test. There is exactly one adapter per seam — no speculative abstraction, no
plugin seam for "other registries" because nothing varies there.

**Synthesis decision.** Candidate B, with the interface kept to five functions
(`loadOperations`, `assignMocs`, `seedRelated`, `render*`, `writeGeneratedFile`)
and every lint rule a pure function of `(ops, files, options)`. Depth comes from
the write seam: `writeGeneratedFile` is the only code in the repo that knows
about `<!-- generated:end -->`, so the "never clobber a hand-written body" rule
has one implementation and one test. Injection over import — `lint(ops, files,
options)` takes its data as parameters so fixtures can drive it without touching
the real registry — is what makes J4's per-rule fixtures cheap, and it is the
first item in the `codebase-design` note on designing for testability.

**Known gap.** Module ops are runtime-only, so the graph is complete for the
core surface and incomplete for an installation with modules enabled; §9 names
the `--include-modules` escape hatch. Revisit when a module op is promoted to an
intent action.
