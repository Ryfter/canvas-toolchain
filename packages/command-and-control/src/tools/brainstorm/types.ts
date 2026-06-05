/** Types matching the 2026-05-20 brainstorm_interactive design spec.
 *  See packages/command-and-control/docs/superpowers/specs/2026-05-20-brainstorm-interactive-controls-design.md
 */

export interface InteractiveSpec {
  /** Slug used for the eventual widget bundle filename. */
  id: string;
  /** Human-readable name shown in critique / preview UIs. */
  name: string;
  /** What kind of interaction. Free-form per spec §10 decision 1 — may become an enum later
   *  once common patterns are harvested. Examples: "side-by-side-slider",
   *  "card-flip-reveal", "sortable-ordering", "branching-scenario". */
  kind: string;
  /** Plain-language description of the learning intent. */
  purpose: string;
  /** Structured data the widget needs (e.g. {items: [...], correctOrder: [...]}).
   *  Loose-typed by design — the LLM proposes the shape per widget. */
  contentSchema: Record<string, unknown>;
  /** Initial data populated from the topic context. */
  initialContent: Record<string, unknown>;
  /** Iframe sizing hints for the eventual rendered widget. */
  dimensions: {
    minHeight: number;
    maxHeight: number;
    aspectRatio?: string;
  };
  /** Accessibility notes the renderer must honour (per spec §10 decision 3 these are
   *  produced by the LLM but not validated at brainstorm time — enforcement lives
   *  in the future render step). */
  accessibility: {
    keyboardEquivalent: string;
    screenReaderSummary: string;
    minTouchTarget: number;
  };
}

export interface WidgetConcept {
  id: string;
  name: string;
  /** Why this concept serves the stated learning goal. */
  rationale: string;
  spec: InteractiveSpec;
  pedagogicalFit: 'high' | 'medium' | 'low';
  /** Optional notes on how the design responds to specific student personas. */
  personaConsiderations?: string;
}

export interface BrainstormInteractiveInput {
  /** Topic the interactive should illuminate. */
  topic: string;
  /** What students should be able to do after engaging with the widget. */
  learningGoal: string;
  /** Optional audience tags (e.g. ["undergraduate", "first-time-AI-user"]). */
  audienceTags?: string[];
  /** When provided, philosophy KB and student personas are auto-loaded from
   *  the kb-bridge (philosophy-kb.md, student-personas.md under CDS home) and
   *  prefixed to the prompt context. Callers may still pass philosophyKb /
   *  studentPersonas / includePhilosophy / includePersonas to override. */
  courseId?: string;
  /** When true, the professor's philosophy KB is prefixed to the prompt context.
   *  Caller is responsible for providing the actual text via `philosophyKb`,
   *  OR for passing `courseId` so the kb-bridge can auto-load it. */
  includePhilosophy?: boolean;
  /** When true, student-persona context is prefixed to the prompt.
   *  Caller is responsible for providing the actual text via `studentPersonas`,
   *  OR for passing `courseId` so the kb-bridge can auto-load it. */
  includePersonas?: boolean;
  /** Optional: philosophy KB text. If absent and includePhilosophy is true,
   *  the prompt notes that philosophy was requested but not available. */
  philosophyKb?: string;
  /** Optional: student-personas text. If absent and includePersonas is true,
   *  the prompt notes that personas were requested but not available. */
  studentPersonas?: string;
  /** How many concepts to generate. Defaults to 3. */
  count?: number;
}

export interface BrainstormInteractiveResult {
  topic: string;
  learningGoal: string;
  concepts: WidgetConcept[];
  /** Token usage from the Anthropic API call, when available. */
  usage?: { inputTokens: number; outputTokens: number };
}
