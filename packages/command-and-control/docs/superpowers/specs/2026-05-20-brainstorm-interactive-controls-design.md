# Brainstorm Module for Interactive Controls — Design

**Status:** Draft (2026-05-20) — needs review
**Repo:** `D:\Dev\canvas-design-studio` (tool lives here — same place as the Canvas-safe transformation knowledge)
**Size:** Medium
**Depends on:** Philosophy KB and student personas (already in CDS)

---

## 1. Problem

Canvas pages support a narrow set of native interactivity: links, embedded videos, basic forms. Anything beyond that — sortable lists, before/after sliders, A/B reveals, expandable comparisons, drag-and-drop, in-page quizzes — requires custom widgets hosted outside Canvas and iframed in.

The vision is to make it easy for the professor (working with the LLM) to:
1. Describe a learning goal in plain language
2. Get 2-3 widget concepts that would serve that goal
3. Pick one, get a concrete spec for it
4. (Later) render the widget and embed it in a Canvas page

The first two steps are pure design work — no hosting infrastructure required. This spec covers those steps. Widget hosting + rendering is a deferred sub-spec.

## 2. Goals

1. A `brainstorm_interactive` tool that takes a topic + learning goal and proposes 2-3 widget concepts with rationale.
2. Concepts are aware of the professor's philosophy KB (some prefer kinesthetic, some structured) and student personas (accessibility considerations, prior knowledge assumptions).
3. Each concept comes back as a structured spec, not free prose — so a future render step can consume it.
4. The tool is LLM-driven; it doesn't hard-code a widget catalog.

## 3. Non-goals (v1)

- Rendering widgets to HTML/JS bundles. That's the hosting sub-spec.
- A pre-built widget library. We want concepts emergent from the topic, not picked from a menu.
- Hosting infrastructure (GitHub Pages, Cloudflare, etc.).

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ brainstorm_interactive (new CDS tool)                            │
│                                                                  │
│  Input: topic, learning goal, audience tags                      │
│  Optional context: philosophy KB, student personas               │
│  ──────────────────────────────────────────────────              │
│  1. Compose prompt with topic + goal + KB + personas             │
│  2. Call LlmClient with structured output instruction            │
│  3. Parse 2-3 widget concepts                                    │
│  4. For each concept, generate a structured InteractiveSpec      │
│  5. Return concepts with rationale + specs                       │
└──────────────────────────────────────────────────────────────────┘
```

CDS already has an `LlmClient` equivalent pattern through its existing tools — reuse it or wire one in.

## 5. The InteractiveSpec shape

```typescript
export interface InteractiveSpec {
  /** Slug used for the eventual widget bundle filename. */
  id: string;
  /** Human-readable name shown in critique / preview UIs. */
  name: string;
  /** What kind of interaction. Free-form for v1; may become an enum later. */
  kind: string;  // e.g. "side-by-side-slider", "card-flip-reveal", "sortable-ordering"
  /** Plain-language description of the learning intent. */
  purpose: string;
  /** Structured data the widget needs (e.g., {items: [...], correctOrder: [...]}). */
  contentSchema: Record<string, unknown>;
  /** Initial data populated from the topic context. */
  initialContent: Record<string, unknown>;
  /** Iframe sizing hints. */
  dimensions: { minHeight: number; maxHeight: number; aspectRatio?: string };
  /** Accessibility notes the renderer must honour (keyboard nav, ARIA, contrast). */
  accessibility: {
    keyboardEquivalent: string;   // how a non-mouse user accomplishes the same task
    screenReaderSummary: string;  // what gets announced
    minTouchTarget: number;       // px; 44 minimum
  };
}

export interface WidgetConcept {
  id: string;
  name: string;
  rationale: string;            // why this serves the learning goal
  spec: InteractiveSpec;
  pedagogicalFit: 'high' | 'medium' | 'low';
  personaConsiderations?: string;
}

export interface BrainstormInteractiveResult {
  topic: string;
  learningGoal: string;
  concepts: WidgetConcept[];
}
```

## 6. Tool surface

```typescript
interface BrainstormInteractiveInput {
  topic: string;                   // e.g. "Comparing two LLM prompt patterns"
  learningGoal: string;            // e.g. "Students should be able to identify which pattern fits a given task"
  audienceTags?: string[];         // e.g. ["undergraduate", "first-time-AI-user"]
  includePersonas?: boolean;       // load student-personas KB
  includePhilosophy?: boolean;     // load philosophy KB
  count?: number;                  // default 3
  llmClient?: LlmClient;
}
```

When `includePersonas` or `includePhilosophy` is true, the bridge from the shared resource layer (spec #1) loads those KBs and prefixes the prompt with their content.

## 7. Prompt shape

The prompt asks the LLM to:
1. Read the topic + goal + persona/philosophy context.
2. Propose `count` distinct interactive concepts that each serve the goal in a different way.
3. For each: produce a `WidgetConcept` JSON object matching the schema above.
4. Return JSON only.

Output parser handles markdown fencing (same pattern as `scan_recent_developments`).

## 8. Where this slots into workflows

This is not part of any existing workflow yet. It's a standalone tool the professor (or the agent) invokes during page design: "Brainstorm an interactive for week 5's lesson on prompt patterns." The output is an `InteractiveSpec` which a future render step will consume.

Eventually, `update_course_materials` could optionally invoke this for pages marked UPDATE — but that coupling is out of scope here.

## 9. Test plan

- Unit: prompt builder produces expected text given inputs.
- Unit: parser handles fenced and unfenced JSON, returns empty list on malformed responses.
- Unit: persona/philosophy context appears in the prompt when flags are set.
- Integration: with a mock `LlmClient` returning a stable JSON, verify concept count and structure.

## 10. Open decisions for review

1. **Should `InteractiveSpec.kind` be free-form or an enum?** Free-form gives the LLM room to invent new interaction types. An enum constrains to known patterns and makes rendering tractable. I'd start free-form, harvest common patterns over time, then enumerate the proven ones.

2. **Should this tool also produce widget code, or only specs?** v1 is specs only — keeps the brainstorming step fast and cheap. A separate `generate_interactive_widget(spec)` tool could compile a spec into an HTML/JS bundle later.

3. **Accessibility validation at brainstorm time?** The LLM is asked to fill in `accessibility` fields, but nothing validates them. We could require a check-list pass before returning. Trade-off: more LLM calls vs. weaker guarantees. I'd skip validation in brainstorm and enforce in the future render step.

## 11. Out of scope (separate sub-spec)

- Widget rendering (turning a spec into a runnable HTML/JS bundle)
- Widget hosting infrastructure
- A widget catalog or library of pre-built specs
- In-Canvas iframe embed generation (CDS already has this for Panopto; the pattern transfers)
- Per-student widget data persistence (state across visits)
