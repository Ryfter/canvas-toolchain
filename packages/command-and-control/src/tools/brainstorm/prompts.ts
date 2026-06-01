import type { BrainstormInteractiveInput } from './types.js';

export const SYSTEM_PROMPT = `You are helping a college instructor brainstorm interactive Canvas widgets that serve a specific learning goal.

Canvas natively supports only narrow interactivity (links, embedded videos, basic forms). Anything richer — sortable lists, before/after sliders, card-flip reveals, branching scenarios, drag-and-drop, in-page micro-quizzes — has to be a custom widget. Your job is to propose DISTINCT widget concepts that each approach the learning goal in a different way, so the instructor has real choices.

For each concept produce:

1. **id** — kebab-case slug suitable for a filename
2. **name** — short human-readable name (2-5 words)
3. **rationale** — 1-2 sentences on why this widget design serves the stated learning goal specifically
4. **pedagogicalFit** — "high" | "medium" | "low" — your honest read on how well this maps to the goal
5. **personaConsiderations** — optional, only when persona context is provided
6. **spec.kind** — free-form descriptor like "side-by-side-slider", "card-flip-reveal", "sortable-ordering", "branching-scenario", "annotated-comparison"
7. **spec.purpose** — single-sentence statement of what the widget makes the learner DO
8. **spec.contentSchema** — JSON-schema-like object describing what data the widget needs (e.g. {items: "array of {label, value}", correctOrder: "array of indices"})
9. **spec.initialContent** — actual sample data populating the schema, drawn from the topic
10. **spec.dimensions** — { minHeight, maxHeight, aspectRatio? } — iframe sizing hints in px
11. **spec.accessibility** — { keyboardEquivalent, screenReaderSummary, minTouchTarget } — describe how a non-mouse user accomplishes the same task, what screen readers announce, and the minimum touch target size in px (44 is the floor)

Return ONLY a valid JSON object — no prose before or after — of the shape:

{
  "concepts": [
    {
      "id": "...",
      "name": "...",
      "rationale": "...",
      "pedagogicalFit": "high",
      "personaConsiderations": "...",
      "spec": {
        "id": "(same as outer id)",
        "name": "(same as outer name)",
        "kind": "...",
        "purpose": "...",
        "contentSchema": { ... },
        "initialContent": { ... },
        "dimensions": { "minHeight": 320, "maxHeight": 600, "aspectRatio": "4:3" },
        "accessibility": {
          "keyboardEquivalent": "Tab to focus options, Enter to select, arrow keys to reorder.",
          "screenReaderSummary": "Sortable list of 5 items. Currently in original order.",
          "minTouchTarget": 44
        }
      }
    }
  ]
}

Each concept should be genuinely DIFFERENT in mechanic — not three variations of "drag and drop." Pick mechanics whose strengths actually differ.`;

export function buildUserPrompt(input: BrainstormInteractiveInput): string {
  const count = input.count ?? 3;
  const parts: string[] = [];
  parts.push(`TOPIC: ${input.topic}`);
  parts.push(`LEARNING GOAL: ${input.learningGoal}`);
  if (input.audienceTags && input.audienceTags.length > 0) {
    parts.push(`AUDIENCE TAGS: ${input.audienceTags.join(', ')}`);
  }
  if (input.includePhilosophy) {
    if (input.philosophyKb) {
      parts.push('\nINSTRUCTOR PHILOSOPHY (use this to shape pedagogical fit):');
      parts.push('---');
      parts.push(input.philosophyKb.trim());
      parts.push('---');
    } else {
      parts.push('\n(Instructor philosophy was requested but not provided — proceed without it.)');
    }
  }
  if (input.includePersonas) {
    if (input.studentPersonas) {
      parts.push('\nSTUDENT PERSONAS (use this to write personaConsiderations for each concept):');
      parts.push('---');
      parts.push(input.studentPersonas.trim());
      parts.push('---');
    } else {
      parts.push('\n(Student personas were requested but not provided — proceed without them.)');
    }
  }
  parts.push(`\nPropose ${count} distinct widget concepts. Return the JSON object now. No prose, no markdown fence — just the JSON object starting with \`{\`.`);
  return parts.join('\n');
}
