# Oral Assessment module (Rhetorix Lab as recommended provider) — design

- **Issue:** #75 (feat: Rhetorix Lab integration (module))
- **Milestone:** v2.0
- **Date:** 2026-06-12
- **Status:** Design — approved in brainstorm, pending spec review
- **Author tool tier:** `agent:opus`

---

## 1. Context & research findings

Issue #75 originally framed Rhetorix Lab integration as "scope intentionally open," blocked on a conversation with the tool's author, because the public marketing pages show no API/LTI/export. A thorough pass on **2026-06-12** changed that picture.

**What Rhetorix Lab is.** An "AI-irrelevant by design" video-based assessment platform — asynchronous video capture with AI-enhanced grading, for oral exams, quizzes, journals, and short essays. It confirms genuine student understanding rather than detecting AI. Built by a Boise State professor; `rhetorixlab.example.edu` is the BSU deployment, `rhetorixlab.io` is the productized public version (tiers: Foundations $0/student, Scholar $9.99/student, Campus custom).

**The decisive finding (BSU instructor resources page).** Rhetorix Lab is **already an LTI tool with native Canvas integration**:

- External Tool Link: `https://rhetorixlab.example.edu/lti/launch` — a standard LTI launch endpoint.
- Instructors can "create assignments in Canvas that are linked to Rhetorix Lab assessments" and "link existing Rhetorix Lab assessments to new Canvas assignments."
- It already does **grade passback** ("how to sync grades with Canvas" — LTI AGS).
- Students launch the assessment from inside the Canvas assignment.

**Implication.** The two directions that looked author-dependent — *embedding* and *pulling results back* — are **already solved by Rhetorix's own LTI integration**. We must not reinvent launch or grade sync. The real, un-met value for canvas-toolchain is **authoring-side**, which is exactly the toolchain's strength and needs **nothing** from the Rhetorix author. **#75 is buildable now; the author conversation becomes a nice-to-have, not a blocker.**

Sources: `rhetorixlab.io/product`, `rhetorixlab.io/pricing`, `rhetorixlab.example.edu/instructorResources`, `rhetorixlab.example.edu/useCases`.

---

## 2. Goal & non-goals

**Goal.** Ship an optional, config-time-enabled module that helps a professor **author** an oral/video assessment and **frame it in Canvas**:

1. Generate a **paste-ready Rhetorix assessment spec** (prompts, timing, randomization, attempts, rubric criteria) the professor drops into Rhetorix's assignment creator.
2. Generate a **student-facing Canvas wrapper page** (a generic CDS page type) that explains the assessment, sets expectations, states the AI-use policy, shows the rubric, and links the launch.

**Non-goals (deferred — see §9).**

- No results/grade ingestion — Rhetorix's LTI already syncs grades to Canvas.
- No second provider implementation — only the seam.
- No auto-placement of the Canvas LTI assignment via the Canvas API.
- No Rhetorix API calls of any kind (there is no public API, and we don't need one).

---

## 3. Locked design decisions

These were settled in the 2026-06-12 brainstorm:

- **D1 — Authoring-side focus.** The module's job is authoring (generate the assessment + the Canvas wrapper page), not plumbing. Rhetorix's LTI owns launch + grade passback; we hand off *to* it.
- **D2 — Both deliverables in v1.** The paste-ready Rhetorix spec **and** the Canvas wrapper page.
- **D3 — Capability is the boundary, not Rhetorix.** Generic "oral/video assessment" capability with a provider seam; **Rhetorix is provider #1**. Honors the standing pluggable-platforms rule and mirrors `module-video` (Video capability / Panopto provider).
- **D4 — Rhetorix is the recommended / best-of-breed provider.** Not merely "provider #1": it is the default active provider, tagged `recommended` in the tool catalog, with a shipped "why Rhetorix" rationale.
- **D5 — Generic CDS page type.** The wrapper page is a provider-agnostic `oral-assessment` page type (never Rhetorix-branded); the Rhetorix launch URL is just a field.
- **D6 — No credentials.** No API means no secret. At most an optional stored institution Rhetorix domain/launch base URL for building the launch link, kept in `course-config.md` (not a secret, not under `~/.command-and-control/*.json`).
- **D7 — Two-mode input.** The design tool accepts **either** an existing assignment brief **or** a topic + learning goal (mirrors `brainstorm_interactive`).
- **D8 — Peer assessment is a separate, unrelated module.** PeerAssessment.com (issue to follow) is its own capability with its own spec/plan. No shared base or coupling with this module; the similar authoring shape is convention only.

---

## 4. Architecture

### 4.1 New package: `@canvas-toolchain/module-oral-assessment`

Follows the `module-video` template exactly:

- Implements `CanvasToolchainModule` from `@canvas-toolchain/module-contract` (id `oral-assessment`, `handles[]` declaring the oral-assessment provider/tool types).
- Registered in C&C's module registry (`src/modules/registry.ts` → `KNOWN_MODULES`), loaded **fail-soft** (a broken module is logged + skipped, never crashes the host), config-time-enabled via `~/.command-and-control/modules.json`.
- Exposes one MCP tool, `design_oral_assessment` (§6).

### 4.2 Provider seam

```
OralAssessmentProvider (interface)
  ├─ id, displayName, recommended: boolean
  ├─ recommendation(): string            // the "why <provider>" rationale
  ├─ defaults(): AssessmentDefaults      // prep/response/randomization/attempts defaults
  ├─ formatAssessment(spec): string      // paste-ready setup text for the provider's UI
  └─ buildLaunchUrl(domain, ref?): string | null

RhetorixProvider implements OralAssessmentProvider
  ├─ recommended = true (default active provider)
  ├─ recommendation() → AI-resilient async video, native Canvas grade passback via LTI, …
  ├─ defaults() → grounded in Rhetorix's published use-cases (§7)
  ├─ formatAssessment(spec) → Rhetorix-creator-shaped markdown
  └─ buildLaunchUrl(domain) → `https://<domain>/lti/launch` (or null if no domain set)
```

Future providers (Yoodli, Bongo, GoReact) drop in as ~one-file adapters. Provider resolution mirrors `module-video/src/resolve.ts`: a single active provider, default `rhetorix`.

### 4.3 No credentials

There is no `setup_*` secret tool. The only configurable value is an optional **institution Rhetorix domain** (e.g. `rhetorixlab.example.edu`) used to build the launch URL. It lives as an optional field in `course-config.md` (the same place brand/course config already lives), read at render time. When absent, the wrapper page renders a labeled launch-link placeholder instead of a live URL.

---

## 5. The `oral-assessment` CDS page type

A new, generic page type added to Canvas Design Studio (core — provider-agnostic, so it does not violate the universal-tool rule; the Rhetorix-specific launch URL is just data).

**Front-matter fields** (all optional except `promptSummary`):

| Field | Meaning |
| --- | --- |
| `promptSummary` | One-line student-facing description of what they'll be asked to do. |
| `prepSeconds` | Prep time before recording. |
| `responseSeconds` | Max response length. |
| `randomization` | `{ pick: N, of: M }` — "you'll get 1 of M questions." |
| `attempts` | Attempts policy (`1`, `unlimited`, or a number). |
| `rubric` | Reuses the existing CDS rubric rendering (criteria → student-facing). |
| `launchUrl` | The provider launch link (built from the stored domain, or a placeholder). |
| `aiasLevel` | Reuses the existing AIAS callout (AI Assessment Scale 1–5). |

**Rendering.** `generate_page` / `generate_week` / `generate_course` render it like any other page → a Canvas-safe HTML page with: a "what to expect" card (timing + randomization + attempts), the rubric block, the AIAS callout, and a prominent **launch button/link**. Pages without oral-assessment front matter are unaffected (additive only, matching how #66 tiers and #92 AIAS were introduced).

---

## 6. The `design_oral_assessment` tool

A module-owned MCP tool, registered through C&C's module loader. Modeled on `draft_student_rubric` (writes a CDS `.md` and returns auxiliary artifacts) and `brainstorm_interactive` (two-mode input).

**Inputs** (two modes, exactly one required):

- Mode A — **from a brief:** `assignmentBrief` (string or path to a CDS assignment page).
- Mode B — **from scratch:** `topic` + `learningGoal`.

Plus optional overrides: `questionCount` (randomization pool size), `prepSeconds`, `responseSeconds`, `attempts`, `courseContext`, `outputPath`, `aiasLevel`, `provider` (defaults to the recommended `rhetorix`).

**Behavior.** Uses the Anthropic LLM (via the shared LLM client; `setup_anthropic` required for generation, with a clear error if absent) to produce an `AssessmentSpec`:

- `questions[]` — the oral prompt set (size = `questionCount`, default from provider).
- timing (`prepSeconds`, `responseSeconds`), `randomization`, `attempts` — seeded from `provider.defaults()`, overridable.
- `rubricCriteria[]` — assessment rubric criteria.

**Outputs** (three, like `draft_student_rubric`):

1. **A CDS `.md` content file** at `outputPath` — `oral-assessment` page-type front matter (§5) + student-facing body — ready for `generate_course`.
2. **The paste-ready provider spec** — `provider.formatAssessment(spec)` (faculty-facing) — written as a sidecar `<name>.<providerId>.md` (e.g. `<name>.rhetorix.md`) next to the page **and** returned in the tool response, so the professor can paste it straight into the provider's assignment creator.
3. **The `recommendation()` rationale** — returned in the response (and surfaced when the provider is the recommended one).

**Idempotence / safety.** Writing the `.md` mirrors existing CDS write behavior (auto `.bak` of any prior version). Nothing is sent to any network service except the LLM call.

---

## 7. Generation defaults (grounded in Rhetorix's use-cases)

`RhetorixProvider.defaults()` seeds values from Rhetorix's own published sample assignments, so generated assessments match how the tool is actually used:

| Assessment intent | prep | response | randomization | attempts |
| --- | --- | --- | --- | --- |
| Concept check / knowledge verification | ~30s | ~2 min | 1 of 3 | limited |
| AI-resilient oral discussion | view in advance | ~3 min | single prompt | unlimited |
| Impromptu speaking / communication | ~15s | ~2 min | 1 of 3 | limited |

The LLM picks the closest intent from the brief/topic (or honors explicit overrides) and fills timing/randomization accordingly. These are defaults, not constraints — every value is overridable.

---

## 8. Provider recommendation mechanics

- **Catalog (#76):** `data/known-tools.yaml` gains an `oral-assessment` capability entry with **Rhetorix tagged `recommended`**, so `discover_tools` surfaces it when an oral-assessment need is detected and `save_institution_profile` can record it.
- **Default provider:** the module registry marks `rhetorix` the default active `OralAssessmentProvider`; `list_modules` shows the `recommended` flag and active provider.
- **Rationale surfacing:** `design_oral_assessment` returns `provider.recommendation()`; when the active provider is the recommended one, the response leads with the "why Rhetorix" rationale (AI-resilient async video, native Canvas grade passback via LTI, built for genuine-understanding verification).

---

## 9. Deferred (YAGNI)

- **Results/grade ingestion** — Rhetorix's LTI already syncs grades to Canvas; duplicating it would be redundant and fragile.
- **Second provider** (Yoodli/Bongo/GoReact) — build the seam, not a speculative adapter.
- **Canvas LTI auto-placement** — creating the Canvas assignment pre-wired to Rhetorix's external tool via the Canvas API is a plausible future enhancement (needs only the Canvas API + an institution that has Rhetorix installed), but out of v1 scope per D1.
- **Rhetorix author conversation** — now optional. If it happens and surfaces anything beyond LTI, fold it into a follow-up.

---

## 10. Testing

Fully hermetic — there is **no network dependency** (no Rhetorix API; the LLM call is dependency-injected and stubbed in tests, as in the existing LLM tools). TDD coverage:

- Pure-function **spec builder** (brief/topic → `AssessmentSpec`, default seeding, override precedence).
- **`RhetorixProvider`** — `formatAssessment` output shape, `buildLaunchUrl`, `recommendation`, `defaults`.
- **CDS `oral-assessment` page-type renderer** — render contract (what-to-expect card, rubric, AIAS callout, launch button); additive-safety (pages without the front matter unchanged).
- **`design_oral_assessment` tool** — two input modes, three outputs, `.bak` safety, missing-Anthropic error path.
- **Module load** — fail-soft registration; `list_modules` shows recommended/default.

Verification before "done": root `npm test` + `npm run build` + C&C `npm run smoke:integration`.

---

## 11. Data flow (end to end)

```text
assignment brief  OR  topic + learning goal
        │
        ▼
design_oral_assessment  (LLM → AssessmentSpec, defaults from RhetorixProvider)
        │
        ├──▶ <name>.md            (oral-assessment page type)  ──▶ generate_course ──▶ Canvas-safe student wrapper page
        │                                                                              (what-to-expect · rubric · AIAS · launch button)
        ├──▶ <name>.rhetorix.md   (paste-ready spec)            ──▶ professor pastes into Rhetorix's assignment creator
        └──▶ "why Rhetorix" rationale (in tool response)

Rhetorix Lab (its own LTI integration) ──▶ launch inside Canvas + grade passback   [NOT our code]
```

---

## 12. Source-of-truth pointers (for the implementation plan)

- Module pattern: `packages/module-video/src/{index.ts,provider.ts,resolve.ts,tools.ts}`; contract `packages/module-contract/src/index.ts`.
- C&C module wiring: `packages/command-and-control/src/modules/{manifest.ts,registry.ts}`; module spec `…/specs/2026-06-07-module-architecture-design.md`.
- CDS page types + rendering: `packages/canvas-design-studio/src/` (rubric page type and `tldr_card`/AIAS callout are the closest precedents).
- LLM tool pattern: `draft_student_rubric` (`packages/command-and-control/src/tools/`) and `brainstorm_interactive`.
- Tool catalog: `packages/command-and-control/data/known-tools.yaml` (#76).
