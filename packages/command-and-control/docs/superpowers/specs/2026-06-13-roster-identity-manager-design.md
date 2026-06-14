# Roster & Identity Manager Module — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorm complete) — ready for implementation plan
**Module package:** `module-roster`
**Module id:** `roster`
**Depends on:** Canvas API (`~/.command-and-control/canvas-config.json`), `shared-llm` (`AnthropicLlmClient`), `module-contract`

---

## 1. Purpose

Automate the manual "PeopleSoft → pseudonym → de-identify" roster pipeline the professor maintains by hand each term, and produce the exact PII-free roster file the Group Builder consumes.

Today the professor exports student data from PeopleSoft, assigns each student a username (e.g. `SU26-001`), uses that ID as a VLOOKUP key, strips email/name, and keeps a master spreadsheet mapping the ID back to the real person. This module replaces that spreadsheet workflow with two artifacts — a minimal local identity vault and a de-identified roster — and a propose→commit toolflow that matches students to their Canvas accounts automatically.

The de-identified roster keys on **Canvas user ID + professor pseudonym** (no names/emails), matching the privacy model already used by the Group Builder.

## 2. Scope

### In scope (v1)
- Ingest a PeopleSoft export (CSV/Excel) with a confirmable, remembered column mapping.
- Match each PeopleSoft student to their Canvas account to discover their `canvas_id`.
- Assign a **stable, lifetime pseudonym per student** (one ID per student, prefix = term first seen).
- Recognize returning students (already in the vault) and reuse their pseudonym; flag them.
- AI-normalize the primary major to a clean canonical name (graceful passthrough without an LLM).
- Produce the de-identified roster CSV (`canvas_id,pseudonym,major`) the Group Builder reads.
- Maintain the identity vault (`student_number ↔ canvas_id ↔ pseudonym ↔ first_seen_term`).
- Reverse-lookup: `pseudonym → live Canvas name` (nothing cached).

### Non-goals (v1)
- **No performance-metric gathering** (attendance, grades, peer-review scores). That stays the Group Builder's job / the professor's own roster columns.
- **No Google Forms collection.**
- **No cross-term pairing analytics.** The vault *enables* this later but the module does not compute it.

## 3. Identity model (the core decisions)

| Decision | Choice | Rationale |
|---|---|---|
| Vault contents | **Minimal link only**: `student_number, canvas_id, pseudonym, first_seen_term` | Least PII at rest. No names/emails/userIDs/town/state ever stored. |
| Pseudonym lifetime | **One per student, forever** | Professor wants a single ID per student across terms. |
| Pseudonym prefix | **Term first seen** (e.g. `SU26-014`) | Doubles as a cohort marker; matches existing `SU26-001` habit. Prefix freezes at first contact. |
| Per-term numbering | **New students numbered within the current term's prefix** (`<TERM>-NNN`) | Returning students keep their old ID; only genuinely new students consume a new number in the active term's cohort. |
| Vault anchor | **`student_number`** (SIS) | Stable join key present in both PeopleSoft and Canvas; lets future exports re-link without re-matching. |
| Returning-student behavior | **Reuse existing pseudonym + flag** | Preserves "one id per student" and surfaces who's returning. |
| `major` storage | **On the de-id roster only, not the vault** | Major isn't re-derivable from Canvas; it isn't PII, so it rides the roster. |

Multi-class / multi-term overlap is rare but handled automatically: a student appearing in two courses (same or different term) matches the same `student_number`, so they resolve to one pseudonym and are recognized as already-known.

## 4. Architecture

### Module shape
A new `module-roster` npm package, default-exporting the `CanvasToolchainModule` contract, registered in C&C `KNOWN_MODULES`, enabled via `~/.command-and-control/modules.json`, loaded fail-soft — identical plug-in pattern to `module-group-builder`.

### Persistent artifacts
1. **Identity vault** — `~/.command-and-control/roster-vault/vault.json`, written `0600`.
   Record shape: `{ student_number, canvas_id, pseudonym, first_seen_term }`.
   The only place identity links live. Holds no names/emails.
2. **De-identified roster** — a CSV at a professor-chosen path:
   ```
   canvas_id,pseudonym,major
   ```
   PII-free. `major` = AI-normalized canonical name. The professor or the Group Builder may append numeric metric columns later (the Group Builder treats unknown numeric columns as metrics).

### Supporting state (under `roster-vault/`)
- `column-map.json` — remembered PeopleSoft column mapping (so repeat terms are one-step).
- `major-aliases.json` — remembered `raw → canonical` major overrides.

### Canvas access
A module-local Canvas client reads `canvas-config.json` and lists course users with `email` / `login_id` / `sis_user_id` includes to obtain each enrolled student's `canvas_id` plus match fields. Module-local (not shared) to keep the matching client — which needs more fields than the Group Builder's — decoupled. Injectable for hermetic tests.

### LLM access
Major-normalization uses `shared-llm` `AnthropicLlmClient`, dependency-injected so tests run against a fake. Config loaded module-locally (mirrors `module-oral-assessment`).

## 5. Tools (MCP) — propose → commit flow

### 5.1 `propose_roster` (read-only; writes nothing)

**Inputs:** PeopleSoft file path; Canvas course id (the roster source); current **term code** (e.g. `FA26`, used as the prefix for *new* students' pseudonyms — returning students ignore it); target de-id roster output path. The next per-term number is derived from the vault by counting existing pseudonyms whose prefix matches the current term code.

1. Read the PeopleSoft file at the given path; confirm/override the column mapping (which column is `student_number` / `email` / `userID` / `name` / `major`). Mapping persisted to `column-map.json` for reuse.
2. Pull the Canvas course roster (`users` endpoint with `email`/`login_id`/`sis_user_id` includes) → `canvas_id` + match fields per enrolled student.
3. **Match** PeopleSoft → Canvas in priority order: `student_number → email → userID → name (fuzzy + confirm)`.
4. **Assign pseudonyms** (computed, not yet persisted): look up each `student_number` in the vault → returning students keep their pseudonym (flagged "returning"); new students get the next `<TERM>-NNN` in the active term's cohort.
5. AI-normalize each distinct primary major in one batched call → `{raw → canonical}` map; apply `major-aliases.json` overrides.
6. Return a **review report**: matched (on which key) / ambiguous (with candidates) / unmatched / returning / in-Canvas-not-PeopleSoft / in-PeopleSoft-not-Canvas / `raw → canonical` major mappings / double-major notes. **Nothing is written.** Idempotent and safe to re-run.

### 5.2 `commit_roster` (the only writer)
1. Re-runs the proposal deterministically (or accepts professor edits/overrides for ambiguous rows).
2. **Writes the de-id roster CSV** and **updates the vault** (insert new students; leave returning students untouched).
3. Reports: rows written, vault additions, and anyone still unmatched (excluded from the roster, listed explicitly for manual handling).
   Re-committing the same term is safe — returning-student logic recognizes existing students rather than re-numbering them.

### 5.3 `resolve_identity` (reverse-lookup)
`pseudonym → vault → canvas_id → live Canvas query → current name` (and email if the token exposes it), for one or more pseudonyms. Nothing cached. If a student is no longer reachable via Canvas, it says so plainly.

## 6. AI major-normalization

- Input: raw academic-plan string(s) from PeopleSoft. Output: one canonical major per student.
- **Primary major only.** Second major (if any) is noted in the proposal summary, not written to the roster.
- **One batched call per proposal** over distinct raw majors → `{raw → canonical}` map (not per-student).
- Professor sees every mapping and can override; overrides persist in `major-aliases.json`.
- **No LLM configured → graceful degrade:** raw primary major passes through verbatim (the Group Builder's bucket heuristic still operates on it); the proposal notes "normalization skipped — no LLM."

## 7. Error handling & edge cases

Every condition is surfaced in the proposal and never silently dropped:

| Condition | Behavior |
|---|---|
| Unmatched student (no Canvas hit on any key) | Listed; excluded from roster; never guessed. |
| Ambiguous match (multiple fuzzy candidates) | Listed with candidates; professor picks at commit, else excluded. |
| In Canvas but not PeopleSoft / vice-versa | Reported both directions to spot drops/adds. |
| Vault/SIS collision (same `student_number`, different `canvas_id` than vault) | Flagged for review; never auto-overwritten (protects the stable link). |
| Malformed file / missing required column | Clear error naming the column; no partial writes. |
| Canvas creds missing/invalid | Validated before any work (same as the Group Builder). |

## 8. Testing (TDD, hermetic — no live Canvas/LLM)

Unit tests per unit, with injected fakes for the Canvas client and LLM:
- Column-mapping parser (CSV/Excel; remembered mapping).
- Match-priority resolver: each key tier (`student_number`/`email`/`userID`), fuzzy name match, ambiguity detection.
- Pseudonym assignment: new vs. returning, per-term numbering, prefix-freeze at first contact.
- Vault read/write + `0600`; vault/SIS collision detection.
- Major-normalization: injected fake LLM; the no-LLM passthrough path; alias overrides.
- propose→commit flow: idempotent re-proposal (no writes), safe re-commit (no re-numbering), unmatched exclusion.

## 9. Credentials & privacy summary

- **Required:** Canvas API token (`canvas-config.json`) — the roster source.
- **Optional:** Anthropic key (major-normalization; degrades without it).
- Vault and supporting state are local, `0600`, never echoed in tool output.
- The de-identified roster carries **no PII** — only `canvas_id` (opaque, non-public), `pseudonym`, and canonical `major`.
- Reverse-lookup re-fetches names from Canvas on demand; no names cached at rest.

## 10. Relationship to other modules

- **Group Builder (`module-group-builder`):** the primary consumer. This module *produces* the `canvas_id,pseudonym,major` roster the Group Builder reads; the Group Builder adds metrics and forms groups. Clean producer/consumer seam.
- **PeerAssessment.com round-trip (future):** unaffected; a separate, later module.

## 11. Open items deferred to the plan (not blocking)

- Exact PeopleSoft column header names will be discovered from a real export at implementation; the column-mapping step makes the tool robust to variation regardless.
- Excel parsing dependency choice (lightweight, no native build) to be selected in the plan.
