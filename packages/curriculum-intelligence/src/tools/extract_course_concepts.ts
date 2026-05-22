import type { LlmClient } from '../llm/client.js';

export interface ConceptExtractionInput {
  assignments: { name: string }[];
  modules: { name: string }[];
  llmClient: LlmClient;
}

export interface ExtractedConcept {
  name: string;
  relatedAssignments: string[];
}

export interface ConceptExtractionResult {
  concepts: ExtractedConcept[];
}

function buildPrompt(input: ConceptExtractionInput): string {
  const assignmentList = input.assignments.map((a) => `- ${a.name}`).join('\n');
  const moduleList = input.modules.map((m) => `- ${m.name}`).join('\n');
  return (
    `Identify 5-15 cross-cutting conceptual themes ("concepts") taught in this course.\n` +
    `Each concept should span 1-3 assignments and represent a coherent topic the professor would think of as a unit (e.g., "Prompt engineering", "Agent tool use", "Evaluation methods").\n\n` +
    `Assignments:\n${assignmentList}\n\nModules:\n${moduleList}\n\n` +
    `Return JSON only, no commentary:\n` +
    `{\n  "concepts": [\n    { "name": "Concept Name", "relatedAssignments": ["Assignment 1", "Assignment 3"] }\n  ]\n}\n`
  );
}

function parseResponse(raw: string): ConceptExtractionResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { concepts?: unknown[] };
    const concepts = (parsed.concepts ?? []).filter(
      (c): c is ExtractedConcept =>
        typeof c === 'object' && c !== null && 'name' in c && 'relatedAssignments' in c
        && typeof (c as { name: unknown }).name === 'string'
        && Array.isArray((c as { relatedAssignments: unknown }).relatedAssignments),
    );
    return { concepts };
  } catch {
    return { concepts: [] };
  }
}

export async function extractCourseConcepts(input: ConceptExtractionInput): Promise<ConceptExtractionResult> {
  const raw = await input.llmClient.complete(buildPrompt(input), { maxTokens: 1024 });
  return parseResponse(raw);
}
