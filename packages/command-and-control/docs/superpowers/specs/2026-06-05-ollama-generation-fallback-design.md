# Ollama Generation-Time LLM Provider — Design Spec

**Date:** 2026-06-05
**Issue:** [#89](https://github.com/Ryfter/canvas-toolchain/issues/89) — replaces closed [#62](https://github.com/Ryfter/canvas-toolchain/issues/62) ("Panopto local LLM enrichment") which was misframed; enrichment is rule-based with no LLM calls.
**Scope:** Wire `OllamaLlmClient` as a peer to `AnthropicLlmClient` across all three generation-time LLM call sites in `command-and-control`. Anthropic becomes optional. User picks one provider at setup and can switch via MCP tool.

---

## Goal

Let a professor run canvas-toolchain's three LLM-using features (brainstorming, rubric rewriting, lecture-answers generation) entirely against a local Ollama install with zero Anthropic API key — or pick Anthropic at setup and never touch Ollama. Mirrors the embedding-chain pattern shipped with #61 Phase 1 (Ollama → transformers.js → Voyage), but applied to generation.

---

## Motivation

- **Data sensitivity.** Some institutions can't ship student/course transcript content to a third-party cloud API. A local-only path is the difference between "can use the tool" and "can't."
- **Cost.** Brainstorming and the answers bot are token-heavy day-to-day. A user with capable hardware gets zero variable cost.
- **Resilience.** Anthropic outages or revoked keys no longer break the toolchain for users who have a local fallback configured (after manual switch — no silent fallback; see ADR 3).
- **Pattern parity.** The embedding chain already does this for retrieval. Generation is the obvious next slice.

---

## Architectural Decisions (ADRs)

Four foundational decisions were made during brainstorming. Capturing them up front so future readers see the why.

### ADR 1 — Anthropic becomes optional, not "always required + Ollama additive"

**Decision:** Either-or at setup. Toolchain runs end-to-end on Ollama alone OR Anthropic alone.

**Rejected alternatives:**
- *Strictly additive.* Anthropic still required, Ollama is "use when available." Doesn't solve the data-sensitivity case.
- *Per-feature primary.* Brainstorm/answers default Anthropic, rubric defaults Ollama. Over-engineered for v1; complexity without proven need.

### ADR 2 — Curated short list of Ollama models (but maintained as a markdown page in this repo, not hard-coded)

**Decision:** Maintain `docs/recommended-models.md` in the repo. Fetched at setup time by the toolchain and displayed to the user. The user picks any Ollama model ID; recommendations are guidance, not enforced choices.

**Rejected alternatives:**
- *One hard-coded default in code.* No flexibility; recommendations age with releases.
- *Per-task model picker in config.* See ADR 4 — same model serves all three sites in v1.

### ADR 3 — Hard-fail on provider failure, no cross-provider auto-fallback

**Decision:** When the active provider fails (Ollama down, Anthropic 429, etc.), the feature returns a structured error with a fix line. No silent switch to the other provider.

**Why:** Embedding cross-fallback works because semantic similarity is stable across providers. Generated text isn't — a brainstorming session with three Claude turns and one Ollama turn has inconsistent personality; a rubric rewritten half by each is worse than a clean failure. Faculty tools should fail loudly.

### ADR 4 — One global Ollama model serves all three call sites (not per-task)

**Decision:** `ollama-config.json` has a single `model` field. Brainstorm, rubric, and answers all use it.

**Rejected:** Per-task model fields. The three sites have similar enough needs (one-shot completion, no streaming, modest reasoning) that one well-chosen model serves all three. If a user reports quality issues on one specific feature later, open a follow-up.

---

## Architecture

```
@canvas-toolchain/shared-llm  (existing package — gains modules)
  ├─ LlmClient interface           [exists]
  ├─ AnthropicLlmClient            [exists]
  ├─ OllamaLlmClient               [NEW — implements LlmClient, two-arg shape]
  ├─ resolveLlmClient(cfg)         [NEW — factory; takes provider + per-provider
  │                                  configs, returns concrete LlmClient or throws
  │                                  LlmProviderError]
  ├─ LlmProviderError              [NEW — code + provider + fix[]]
  └─ recommendations.ts            [NEW — fetch + cache + fallback for the
                                     recommended-models markdown page]

C&C (consumes the above)
  ├─ setup_anthropic               [exists — unchanged]
  ├─ setup_ollama                  [NEW MCP tool]
  ├─ set_active_llm_provider       [NEW MCP tool]
  ├─ src/llm/resolve.ts            [NEW — thin shim: reads two config files,
  │                                  calls shared-llm resolveLlmClient]
  ├─ brainstorm/llm_client.ts      [MODIFY — use resolver]
  ├─ rubric/llm_client.ts          [MODIFY — use resolver]
  └─ answers/retrieval/answer.ts   [MODIFY — use resolver]

Configs at ~/.command-and-control/  (atomic 0o600 writes)
  ├─ anthropic-config.json         [exists]
  ├─ ollama-config.json            [NEW — { baseUrl, model }]
  └─ llm-provider.json             [NEW — { provider: "anthropic" | "ollama" }]

Documentation
  └─ docs/recommended-models.md    [NEW — Kevin-maintained model recommendations]
```

**Key invariant:** every generation site calls the C&C resolver, not a provider constructor. Adding a third provider later is one new shared-llm adapter + one new C&C setup tool + one curated section in the markdown page; no feature code changes.

**Hard-fail boundary:** the resolver throws `LlmProviderError` when the active provider's config is missing/invalid. Each feature catches it once at its public boundary and returns `{ error, message, fix }` matching existing C&C error shapes.

---

## File Map

### New files

| File | Purpose |
|---|---|
| `packages/shared-llm/src/ollama.ts` | `OllamaLlmClient implements LlmClient`. Maps system+user → single `<system>\n\n<user>` prompt sent to `/api/generate`. Returns `LlmResponse` with `text` and `usage` (Ollama exposes `prompt_eval_count` and `eval_count`). |
| `packages/shared-llm/src/resolve.ts` | `resolveLlmClient(input: ResolveInput): LlmClient`. Pure factory — no I/O. Throws `LlmProviderError`. |
| `packages/shared-llm/src/errors.ts` | `LlmProviderError extends Error` with `code: string`, `provider: 'anthropic' \| 'ollama' \| 'unknown'`, `fix: string[]`. |
| `packages/shared-llm/src/recommendations.ts` | `fetchRecommendedModels({ url, cachePath, fallback }): Promise<string>`. Returns markdown text. 24h TTL, falls back to bundled copy on network failure. |
| `packages/shared-llm/tests/ollama.test.ts` | Unit tests for `OllamaLlmClient`. |
| `packages/shared-llm/tests/resolve.test.ts` | Unit tests for the factory + error cases. |
| `packages/shared-llm/tests/recommendations.test.ts` | Unit tests for fetch + cache + fallback. |
| `packages/shared-llm/tests/_fixtures/ollama-responses.ts` | Canned `/api/tags` and `/api/generate` response bodies for tests. |
| `packages/command-and-control/src/tools/setup_ollama.ts` | MCP tool. Atomic 0o600 write of `ollama-config.json`. Two modes: discovery (no `model` arg → fetch + return recommendations markdown) and commit (`model` arg → validate + persist). |
| `packages/command-and-control/src/tools/set_active_llm_provider.ts` | MCP tool. Atomic 0o600 write of `llm-provider.json`. Validates the target provider's config exists before writing. |
| `packages/command-and-control/src/llm/resolve.ts` | Thin C&C wrapper: reads `llm-provider.json` + per-provider config file, calls shared-llm `resolveLlmClient`, returns the `LlmClient`. |
| `packages/command-and-control/src/recommended-models.fallback.md` | Bundled offline fallback copy of the recommendations page (committed at release time). |
| `packages/command-and-control/tests/tools/setup_ollama.test.ts` | Unit tests. |
| `packages/command-and-control/tests/tools/set_active_llm_provider.test.ts` | Unit tests. |
| `packages/command-and-control/tests/llm/resolve.test.ts` | Unit tests. |
| `docs/recommended-models.md` | The Kevin-maintained recommendations page (repo root `docs/`, not package-scoped). |

### Modified files

| File | Change |
|---|---|
| `packages/shared-llm/src/index.ts` | (1) Re-export `OllamaLlmClient`, `resolveLlmClient`, `LlmProviderError`, `fetchRecommendedModels`, and their types. (2) Make `AnthropicLlmClient.complete` throw `LlmProviderError` with `ANTHROPIC_INVALID_KEY` on HTTP 401, `ANTHROPIC_RATE_LIMITED` on HTTP 429, and `LLM_REQUEST_FAILED` on all other non-OK responses. Today the method throws a plain `Error`; mapping is required so the catch at each call site can produce structured `{ error, fix }` results. |
| `packages/shared-llm/tests/anthropic-client.test.ts` | Add coverage for the three new error-mapping cases (401, 429, generic 500). Existing happy-path tests unchanged. |
| `packages/command-and-control/src/tools/brainstorm/llm_client.ts` | Replace direct `AnthropicLlmClient` construction with `await resolveLlmClient()` from `../../llm/resolve.js`. |
| `packages/command-and-control/src/tools/rubric/llm_client.ts` | Same change. |
| `packages/command-and-control/src/tools/answers/retrieval/answer.ts` | Default `hooks.llm` now comes from `resolveLlmClient()`; existing hook-injection path for tests unchanged. |
| `packages/command-and-control/src/index.ts` | Register `setup_ollama` and `set_active_llm_provider`. |
| `packages/command-and-control/scripts/smoke-integration.ts` | Add Ollama path step: stub `localhost:11434` server, configure Ollama as active, run answers bot end-to-end. |
| `packages/command-and-control/tests/tools/workflows/brainstorm_interactive.test.ts` | Add 1 test confirming default path goes through resolver. |
| `packages/command-and-control/tests/tools/workflows/draft_student_rubric.test.ts` | Same. |
| `packages/command-and-control/tests/answers/retrieval/answer.test.ts` | Same. |

### Deletions

| File | Why |
|---|---|
| `packages/command-and-control/src/llm/ollama_adapter.ts` | Superseded by `shared-llm/src/ollama.ts`. Uses incompatible single-arg `complete(prompt)` interface; the shared-llm two-arg `complete(system, user)` is what features actually consume. |
| `packages/command-and-control/src/llm/client.ts` | Local single-arg `LlmClient` interface; supplanted by `shared-llm`'s two-arg interface. **Verification step before deletion:** run `rg "from ['\"]\\.\\./llm/client" packages/command-and-control/src` and `rg "from ['\"]\\./client" packages/command-and-control/src/llm`. If hits exist beyond `ollama_adapter.ts`, do **not** delete — leave the file in place, mark its interface `@deprecated`, and open a follow-up to migrate those consumers. The deletion is a nice-to-have; the migration of the three call sites to use `shared-llm`'s `LlmClient` interface is what's load-bearing. |

---

## Config Schemas

All configs use atomic 0o600 writes (tmp + rename), matching the existing C&C setup-tool pattern.

### `~/.command-and-control/ollama-config.json`

```json
{
  "baseUrl": "http://localhost:11434",
  "model": "qwen2.5:14b"
}
```

| Field | Type | Notes |
|---|---|---|
| `baseUrl` | string | Defaults to `http://localhost:11434`. Allows pointing at a LAN box. No trailing slash. |
| `model` | string | Any Ollama model ID. Validated at write time against `/api/tags`. |

### `~/.command-and-control/llm-provider.json`

```json
{ "provider": "ollama" }
```

| Field | Type | Notes |
|---|---|---|
| `provider` | `"anthropic" \| "ollama"` | Two allowed values. `set_active_llm_provider` refuses any other input. |

### Env overrides

| Variable | Effect |
|---|---|
| `CC_HOME` | Overrides `~/.command-and-control/` for the whole config dir (existing behavior, applies here too). |
| `CC_OLLAMA_TIMEOUT_MS` | Per-request timeout for `OllamaLlmClient` HTTP calls. Default `120000` (120 s). |
| `CC_RECOMMENDED_MODELS_URL` | Overrides the markdown fetch URL. Default `https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/docs/recommended-models.md`. Useful for tests. |

---

## Recommended-Models Markdown Page

### Location

`docs/recommended-models.md` at the repo root. Source of truth — no derived JSON, no dual maintenance.

### Distribution

- **Fetched from:** `https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/docs/recommended-models.md` (5 s timeout, override via `CC_RECOMMENDED_MODELS_URL`)
- **Cached at:** `~/.command-and-control/cache/recommended-models.md` (24 h TTL)
- **Bundled fallback:** `packages/command-and-control/src/recommended-models.fallback.md` (committed at release time)

Fetch order on `setup_ollama` discovery call: try network → cache → bundled fallback. First success wins.

### Page structure

```markdown
# Recommended Models for Canvas Toolchain

Fetched by the toolchain at setup time. Update as new models emerge.

---

## General-Purpose Models — by VRAM Tier

For canvas-toolchain's built-in LLM features (brainstorming, rubric, answers
bot), pick **one** model that fits your hardware tier. This becomes your
global generation model.

### Tier: 32 GB (RTX 5090, A6000)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:32b` | [Ollama](https://ollama.com/library/qwen2.5:32b) · [HF](...) | ... | ~20 GB |

### Tier: 24 GB (RTX 4090, RTX 3090)
### Tier: 16 GB (RTX 4080, base M-series Mac)
### Tier: 6 GB

---

## Task-Specialized Models

Not wired into canvas-toolchain by default. Install if you have specific
workflows where a finetune beats a generalist.

### Git Commit Messages

| Model | URL | Why | VRAM |
|---|---|---|---|
| `tavernari/git-commit-message` | [HF](...) | Finetuned for Conventional Commits | ~4 GB |

### OCR

### Whisper (Lecture Audio Transcription)

Will be consumed by sub-project 3 (Panopto Whisper comparison) when it ships.
```

Row schema: **Model · URL · Why · VRAM**.

### No parsing

The toolchain does **not** parse the markdown. The page is returned verbatim from `setup_ollama` in discovery mode; the user reads it and types their chosen model ID. The toolchain validates the chosen model exists in `/api/tags` and writes the config. Markdown format changes don't break the toolchain.

---

## Tool Surfaces

### `setup_ollama`

**Input schema:**

```ts
interface SetupOllamaInput {
  baseUrl?: string;  // defaults to "http://localhost:11434"
  model?: string;    // absent = discovery mode; present = commit mode
}
```

**Discovery mode** (no `model`):

1. Fetch recommended-models markdown (network → cache → fallback).
2. Return:
   ```ts
   {
     mode: 'discovery',
     baseUrl,
     recommendations: '<markdown content>',
     nextStep: 'Pick a model from above and re-run setup_ollama with { model: "<id>" }'
   }
   ```

**Commit mode** (`model` present):

1. Probe `${baseUrl}/api/tags` (3 s timeout). On failure: return `{ error: 'OLLAMA_UNREACHABLE', fix: ['Start Ollama with `ollama serve`'] }`.
2. Verify `model` appears in the `/api/tags` response. On miss: return `{ error: 'OLLAMA_MODEL_NOT_PULLED', fix: ['Run: ollama pull <model>'] }`.
3. Atomic write `ollama-config.json`.
4. Return:
   ```ts
   {
     mode: 'commit',
     ok: true,
     baseUrl,
     model,
     configPath: '~/.command-and-control/ollama-config.json'
   }
   ```

### `set_active_llm_provider`

**Input schema:**

```ts
interface SetActiveLlmProviderInput {
  provider: 'anthropic' | 'ollama';
}
```

**Flow:**

1. If `provider === 'anthropic'`, verify `anthropic-config.json` exists. If missing: return `{ error: 'PROVIDER_NOT_CONFIGURED', fix: ['Run setup_anthropic first'] }`.
2. If `provider === 'ollama'`, verify `ollama-config.json` exists. If missing: return `{ error: 'PROVIDER_NOT_CONFIGURED', fix: ['Run setup_ollama first'] }`.
3. Any other value: return `{ error: 'INVALID_PROVIDER', fix: ['Provider must be "anthropic" or "ollama"'] }`.
4. Atomic write `llm-provider.json`.
5. Return `{ ok: true, provider, configPath: '~/.command-and-control/llm-provider.json' }`.

Note: existing-key validation is *not* re-run here. `setup_anthropic` owns that; `set_active_llm_provider` only verifies the config file exists.

---

## Error Handling

### `LlmProviderError`

Single error class thrown by the resolver and both `LlmClient` implementations:

```ts
export class LlmProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly provider: 'anthropic' | 'ollama' | 'unknown',
    public readonly fix: string[],
  ) {
    super(message);
  }
}
```

Each of the three call sites catches `LlmProviderError` once at its public boundary and returns the existing C&C error shape:

```ts
{ error: err.code, message: err.message, fix: err.fix }
```

### Error code catalog

| Code | Raised in | Trigger | Fix |
|---|---|---|---|
| `LLM_PROVIDER_NOT_SET` | C&C resolver | `llm-provider.json` absent | `["Run set_active_llm_provider to choose Anthropic or Ollama"]` |
| `LLM_PROVIDER_CONFIG_MISSING` | C&C resolver | Active provider's per-provider config absent | `["Run setup_anthropic"]` or `["Run setup_ollama"]` (depending on active provider) |
| `OLLAMA_UNREACHABLE` | `OllamaLlmClient`, `setup_ollama` | Connection refused or probe timeout | `["Start Ollama with 'ollama serve', or switch providers with set_active_llm_provider"]` |
| `OLLAMA_MODEL_NOT_PULLED` | `OllamaLlmClient`, `setup_ollama` | Ollama 404 on model | `["Run: ollama pull <model>"]` |
| `OLLAMA_TIMEOUT` | `OllamaLlmClient` | Request exceeded `CC_OLLAMA_TIMEOUT_MS` (default 120 s) | `["Try a smaller model, or raise CC_OLLAMA_TIMEOUT_MS"]` |
| `ANTHROPIC_INVALID_KEY` | `AnthropicLlmClient` | 401 from `/v1/messages` | `["Re-run setup_anthropic with a valid key"]` |
| `ANTHROPIC_RATE_LIMITED` | `AnthropicLlmClient` | 429 | `["Wait and retry, or switch to Ollama with set_active_llm_provider"]` |
| `LLM_REQUEST_FAILED` | catch-all | Unexpected HTTP failure | `["Check network and provider status"]` |
| `PROVIDER_NOT_CONFIGURED` | `set_active_llm_provider` | Target provider's config file missing | `["Run setup_anthropic first"]` or `["Run setup_ollama first"]` |
| `INVALID_PROVIDER` | `set_active_llm_provider` | Input value not in `{anthropic, ollama}` | `["Provider must be 'anthropic' or 'ollama'"]` |

### Timeouts

- **Anthropic:** existing behavior unchanged (relies on fetch defaults; Anthropic is fast).
- **Ollama:** 120 s per request. Override via `CC_OLLAMA_TIMEOUT_MS`. Maps to `OLLAMA_TIMEOUT` on exceed.

### No silent cross-provider fallback (ADR 3)

The resolver does not auto-try the other provider on failure. If the active provider fails, the structured error surfaces to the caller with the fix line.

---

## Testing

### New unit test files

| File | Coverage |
|---|---|
| `packages/shared-llm/tests/ollama.test.ts` | Request shape (system+user → combined prompt), 200 response parsing with usage extraction, 404 → `OLLAMA_MODEL_NOT_PULLED`, connection refused → `OLLAMA_UNREACHABLE`, abort-on-timeout → `OLLAMA_TIMEOUT`. All using `vi.spyOn(globalThis, 'fetch')`. |
| `packages/shared-llm/tests/resolve.test.ts` | Provider selection (`anthropic` → `AnthropicLlmClient`, `ollama` → `OllamaLlmClient`), missing per-provider config → `LLM_PROVIDER_CONFIG_MISSING`, unknown provider value → throws. |
| `packages/shared-llm/tests/recommendations.test.ts` | Fetch succeeds → returns markdown + writes cache; fetch fails → returns cache; cache stale → re-fetches; cache missing + fetch fails → returns bundled fallback. |
| `packages/command-and-control/tests/tools/setup_ollama.test.ts` | Discovery mode returns markdown + `nextStep`; commit mode happy path; `OLLAMA_UNREACHABLE`; `OLLAMA_MODEL_NOT_PULLED`; atomic write verified (no partial config on probe failure); 0o600 file mode verified. |
| `packages/command-and-control/tests/tools/set_active_llm_provider.test.ts` | Switch to anthropic happy path; switch to ollama happy path; refuses when target config missing; refuses unknown value; 0o600 verified. |
| `packages/command-and-control/tests/llm/resolve.test.ts` | Reads both config files + calls shared resolver; missing `llm-provider.json` → `LLM_PROVIDER_NOT_SET`; missing per-provider config → `LLM_PROVIDER_CONFIG_MISSING`. |

### Modifications to existing test files

| File | Change |
|---|---|
| `packages/command-and-control/tests/tools/workflows/brainstorm_interactive.test.ts` | Existing tests inject fake `LlmClient` via hooks — no behavior change. Add 1 test confirming default code path goes through `resolve.ts`. |
| `packages/command-and-control/tests/tools/workflows/draft_student_rubric.test.ts` | Same. |
| `packages/command-and-control/tests/answers/retrieval/answer.test.ts` | Same. |

### Smoke integration update

`packages/command-and-control/scripts/smoke-integration.ts` gains a step:

1. Write stub `ollama-config.json` pointing at `http://localhost:<ephemeral>`.
2. Set `llm-provider.json` to `ollama`.
3. Stand up a Node `http.createServer` on that port with two handlers:
   - `GET /api/tags` → returns the configured model in `{ models: [{ name: '<model>' }] }`
   - `POST /api/generate` → returns a canned `{ response: 'stub answer [1]', prompt_eval_count: 10, eval_count: 5 }`
4. Run `generateAnswer` end-to-end with real retrieval + the resolver path.
5. Assert the response came back via the Ollama path.
6. Tear down the stub server.

Proves the full wire works without depending on a real Ollama installation.

### Fixture

`packages/shared-llm/tests/_fixtures/ollama-responses.ts` — canned `/api/tags` and `/api/generate` JSON bodies. Reused across `ollama.test.ts` and the smoke step.

### Test counts

- shared-llm new tests: ~25
- C&C new tests: ~20
- Existing tests updated: ~3 small additions
- Smoke step: +1

Total: **~50 new tests.**

### What's intentionally not tested

- Real Ollama integration (the smoke stub server is enough; we'd be testing Ollama itself, not our code).
- Real Anthropic integration (`shared-llm/tests/anthropic-client.test.ts` already covers this).
- LLM output quality on Ollama (subjective; the user evaluates).

---

## Out of Scope

Explicitly not building in this issue:

| Item | Why |
|---|---|
| **Streaming responses** | All three call sites are one-shot today. Streaming adds back-pressure, partial citation parsing, MCP streaming protocol concerns. Defer until a feature needs it. |
| **Per-feature model selection** | Walked back in ADR 4. If a user reports quality issues on one site, open a follow-up. |
| **Cross-provider auto-fallback** | Rejected in ADR 3 — hard-fail is correct for generation. Don't add even as opt-in in v1. |
| **New providers** (llama.cpp, vLLM, LM Studio, OpenAI, Gemini) | The `LlmClient` interface is extensible. One new adapter + one new setup tool + one new markdown section per provider. Wait for actual demand. |
| **Model quality benchmarking** | The `recommended-models.md` page is curated by judgment. No automated scoring. |
| **Embedding chain changes** | Already shipped with #61 Phase 1. Untouched. |
| **Enrichment pipeline** | No LLM calls — rule-based. Closed #62 covered this misframing. |
| **Whisper `setup_whisper` tool** | Sub-project 3 (#60) builds its own. This issue only commits to making `recommendations.ts` reusable. |
| **Installer wizard first-run provider choice** | The native installer (#63) handles its own first-run flow. This issue ships the MCP-tool layer; installer wires it later. |
| **C&C status pane reflecting active provider** | `get_cc_status` could surface it, but v1 ships without. One-line follow-up if wanted. |
| **Token/cost tracking per provider** | Separate concern. Out of v1. |

---

## Acceptance Criteria

Shippable when all of the following hold:

1. **End-to-end with Ollama as primary, Anthropic absent:**
   - `setup_anthropic` never invoked.
   - `setup_ollama --model <pulled model>` succeeds.
   - `set_active_llm_provider --provider ollama` succeeds.
   - Brainstorm, draft-student-rubric, and ask-course tools all return real answers via Ollama with no Anthropic config on disk.

2. **End-to-end with Anthropic as primary, Ollama absent:**
   - Default behavior for existing users (who only have `anthropic-config.json` + `llm-provider.json` set to `anthropic`) is unchanged.
   - No tests for existing call sites need to change beyond the +1 resolver-path test per site.

3. **Provider switch is one MCP call:**
   - `set_active_llm_provider --provider <name>` succeeds when the target config exists.
   - Refuses cleanly with `PROVIDER_NOT_CONFIGURED` when it doesn't.

4. **Discovery mode works offline:**
   - `setup_ollama` (no `model`) succeeds with no network by serving the bundled fallback markdown.

5. **Failure modes return structured errors:**
   - Each error code in the catalog has a triggering test that asserts the `{ error, fix }` shape.

6. **Smoke integration passes the Ollama path:**
   - `npm run smoke:integration` exercises the new code path against the stub Ollama server and asserts a response.

7. **All existing tests still pass:**
   - `npm test` across all packages — no regressions.

8. **Documentation:**
   - `docs/recommended-models.md` exists in the repo with four General-Purpose VRAM tier sections (32 / 24 / 16 / 6 GB) and the Task-Specialized section including a Whisper sub-section (used by future #60 work).
   - **Populated tiers at ship:** 6 GB, 24 GB, and 32 GB each have at least one tested model entry. (Kevin can test these tiers locally.)
   - **Empty-but-present tier:** 16 GB exists as a section header with an `<!-- Open a PR with your tested model -->` placeholder. Mainstream-faculty hardware; populated as users contribute or as Kevin tests on a 16 GB box later. Does not block v1 ship.
   - `packages/command-and-control/CLAUDE.md` updated with the new tools and the provider-switching workflow.
