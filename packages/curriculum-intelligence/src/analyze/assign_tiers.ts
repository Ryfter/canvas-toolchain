import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { PageTiers, SectionTier, Tier } from '@canvas-toolchain/shared-types';

export interface AssignTiersSection {
  heading: string;
  body: string;
}

export interface AssignTiersInput {
  pageTitle: string;
  sections: AssignTiersSection[];
  llm: LlmClient;
}

export interface AssignTiersResult {
  tiers: PageTiers;
  warnings: string[];
}

const SYSTEM_PROMPT = `You are tagging course-page sections by importance for a student reading the page.

Tier 1 (At a glance):    What a student must know in 5 seconds — due date,
                         deliverable, one-sentence context.
Tier 2 (Working detail): What a student needs to actually complete the work —
                         submission steps, required tools, key resources.
Tier 3 (Deep support):   Rubric breakdowns, examples, reference docs.

For each section provided, return:
  - heading (verbatim from input)
  - tier (1, 2, or 3)
  - summary: ONE LINE, max 12 words, suitable for a "Quick Reference" card.

Return strict JSON: { "sections": [{ "heading": "...", "tier": N, "summary": "..." }] }`;

function buildUserPrompt(pageTitle: string, sections: AssignTiersSection[]): string {
  const sectionBlocks = sections
    .map((s, i) => `Section ${i + 1}: ${s.heading}\n${s.body}`)
    .join('\n\n---\n\n');
  return `Page: ${pageTitle}\n\n${sectionBlocks}`;
}

function isTier(v: unknown): v is Tier {
  return v === 1 || v === 2 || v === 3;
}

export async function assignTiers(input: AssignTiersInput): Promise<AssignTiersResult> {
  const { pageTitle, sections, llm } = input;

  let response;
  try {
    response = await llm.complete(SYSTEM_PROMPT, buildUserPrompt(pageTitle, sections), {
      maxTokens: 1024,
    });
  } catch (err) {
    throw new Error(`TIER_ASSIGN_FAILED: LLM call threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: { sections?: unknown };
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new Error(`TIER_ASSIGN_FAILED: LLM response was not valid JSON: ${response.text.slice(0, 200)}`);
  }

  const rawSections = parsed.sections;
  if (!Array.isArray(rawSections)) {
    throw new Error('TIER_ASSIGN_FAILED: LLM response missing sections array');
  }

  const warnings: string[] = [];
  const validatedSections: SectionTier[] = [];

  for (const s of rawSections) {
    if (typeof s !== 'object' || s === null) {
      warnings.push('Dropping non-object section entry');
      continue;
    }
    const obj = s as Record<string, unknown>;
    const heading = obj.heading;
    if (typeof heading !== 'string' || heading.length === 0) {
      warnings.push('Dropping section with missing/empty heading');
      continue;
    }
    if (!isTier(obj.tier)) {
      warnings.push(`Dropping section "${heading}" — tier value ${String(obj.tier)} not in {1,2,3}`);
      continue;
    }
    if (typeof obj.summary !== 'string' || obj.summary.length === 0) {
      warnings.push(`Dropping section "${heading}" — summary empty`);
      continue;
    }
    validatedSections.push({ heading, tier: obj.tier, summary: obj.summary });
  }

  if (validatedSections.length === 0) {
    throw new Error('TIER_ASSIGN_FAILED: all sections dropped during validation');
  }

  return {
    tiers: { sections: validatedSections },
    warnings,
  };
}
