import type {
  BrainstormInteractiveInput, BrainstormInteractiveResult, WidgetConcept,
} from '../brainstorm/types.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../brainstorm/prompts.js';
import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../setup_anthropic.js';
import { loadKb, type BridgedKb } from '../../lib/kb-bridge.js';

export interface BrainstormInteractiveHooks {
  /** Injectable LLM client for testing. */
  llm?: LlmClient;
  /** Injectable kb bridge for testing. Production callers pass nothing
   *  and the workflow uses the real disk-backed bridge when input.courseId
   *  is set. */
  kb?: BridgedKb;
}

/** When input.courseId is set, fill missing philosophy + persona context from
 *  the kb-bridge. Caller-provided text wins; explicit `includePhilosophy:false`
 *  / `includePersonas:false` suppresses auto-load. No-op when courseId absent. */
function enrichInputFromKb(
  input: BrainstormInteractiveInput,
  kb: BridgedKb | null,
): BrainstormInteractiveInput {
  if (!input.courseId || kb === null) return input;

  const wantPhilosophy = input.includePhilosophy !== false;
  const wantPersonas = input.includePersonas !== false;

  const philosophyKb = input.philosophyKb
    ?? (wantPhilosophy ? (kb.philosophyKb() ?? undefined) : undefined);
  const studentPersonas = input.studentPersonas
    ?? (wantPersonas ? (kb.studentPersonas() ?? undefined) : undefined);

  return {
    ...input,
    includePhilosophy: input.includePhilosophy ?? (philosophyKb !== undefined),
    includePersonas: input.includePersonas ?? (studentPersonas !== undefined),
    philosophyKb,
    studentPersonas,
  };
}

function stripCodeFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n/, '').replace(/\n?```\s*$/, '').trim();
  }
  return s;
}

function asString(v: unknown, field: string, ctx: string): string {
  if (typeof v !== 'string') {
    throw new Error(`${ctx}: field '${field}' must be a string`);
  }
  return v;
}

function asNumber(v: unknown, field: string, ctx: string): number {
  if (typeof v !== 'number') {
    const n = typeof v === 'string' ? Number(v) : NaN;
    if (Number.isNaN(n)) throw new Error(`${ctx}: field '${field}' must be a number`);
    return n;
  }
  return v;
}

function asRecord(v: unknown, field: string, ctx: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(`${ctx}: field '${field}' must be an object`);
  }
  return v as Record<string, unknown>;
}

function parseConcepts(raw: string): WidgetConcept[] {
  const stripped = stripCodeFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(`LLM did not return valid JSON. First 200 chars: ${stripped.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== 'object' || !('concepts' in parsed)) {
    throw new Error("LLM response missing top-level 'concepts' array.");
  }
  const concepts = (parsed as { concepts: unknown }).concepts;
  if (!Array.isArray(concepts) || concepts.length === 0) {
    throw new Error("'concepts' is not a non-empty array.");
  }

  return concepts.map((c, i): WidgetConcept => {
    const ctx = `Concept ${i}`;
    const o = asRecord(c, 'concepts[i]', ctx);
    const spec = asRecord(o.spec, 'spec', ctx);
    const dimensions = asRecord(spec.dimensions, 'spec.dimensions', ctx);
    const accessibility = asRecord(spec.accessibility, 'spec.accessibility', ctx);
    const fit = asString(o.pedagogicalFit, 'pedagogicalFit', ctx);
    if (fit !== 'high' && fit !== 'medium' && fit !== 'low') {
      throw new Error(`${ctx}: pedagogicalFit must be 'high', 'medium', or 'low' (got '${fit}')`);
    }

    return {
      id: asString(o.id, 'id', ctx),
      name: asString(o.name, 'name', ctx),
      rationale: asString(o.rationale, 'rationale', ctx),
      pedagogicalFit: fit,
      personaConsiderations: typeof o.personaConsiderations === 'string' ? o.personaConsiderations : undefined,
      spec: {
        id: asString(spec.id, 'spec.id', ctx),
        name: asString(spec.name, 'spec.name', ctx),
        kind: asString(spec.kind, 'spec.kind', ctx),
        purpose: asString(spec.purpose, 'spec.purpose', ctx),
        contentSchema: asRecord(spec.contentSchema, 'spec.contentSchema', ctx),
        initialContent: asRecord(spec.initialContent, 'spec.initialContent', ctx),
        dimensions: {
          minHeight: asNumber(dimensions.minHeight, 'spec.dimensions.minHeight', ctx),
          maxHeight: asNumber(dimensions.maxHeight, 'spec.dimensions.maxHeight', ctx),
          aspectRatio: typeof dimensions.aspectRatio === 'string' ? dimensions.aspectRatio : undefined,
        },
        accessibility: {
          keyboardEquivalent: asString(accessibility.keyboardEquivalent, 'spec.accessibility.keyboardEquivalent', ctx),
          screenReaderSummary: asString(accessibility.screenReaderSummary, 'spec.accessibility.screenReaderSummary', ctx),
          minTouchTarget: asNumber(accessibility.minTouchTarget, 'spec.accessibility.minTouchTarget', ctx),
        },
      },
    };
  });
}

/** Propose interactive widget concepts that serve a specific learning goal.
 *
 *  See packages/command-and-control/docs/superpowers/specs/
 *      2026-05-20-brainstorm-interactive-controls-design.md
 *  for the design rationale, schema decisions, and out-of-scope items.
 *
 *  This is a brainstorming tool — it returns specs, not runnable widget code.
 *  A future render step (separate sub-spec) compiles a chosen spec into a
 *  hostable HTML/JS bundle. */
export async function brainstormInteractive(
  input: BrainstormInteractiveInput,
  hooks: BrainstormInteractiveHooks = {},
): Promise<BrainstormInteractiveResult> {
  const kb = input.courseId ? (hooks.kb ?? loadKb()) : null;
  const effective = enrichInputFromKb(input, kb);
  const llm = hooks.llm ?? new AnthropicLlmClient(loadAnthropicConfig());
  const response = await llm.complete(SYSTEM_PROMPT, buildUserPrompt(effective), { maxTokens: 4096 });
  const concepts = parseConcepts(response.text);
  return {
    topic: input.topic,
    learningGoal: input.learningGoal,
    concepts,
    usage: response.usage,
  };
}
