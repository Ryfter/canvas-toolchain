import type { LlmClient } from '@canvas-toolchain/shared-llm';

export interface NormalizeResult {
  /** raw -> canonical, covering every non-empty distinct input. */
  map: Record<string, string>;
  llmUsed: boolean;
}

const SYSTEM =
  'You normalize university major/plan strings to a single clean canonical major name. ' +
  'Return ONLY a JSON object mapping each input string to its canonical major. ' +
  'Strip emphasis/option/degree wrappers (e.g. "Bus Admin: Business Analytics Emphasis" -> ' +
  '"Business Analytics"). Do not invent majors; keep the core field of study.';

function buildUserPrompt(raws: string[]): string {
  return 'Normalize these majors. Respond with a JSON object only.\n' + JSON.stringify(raws);
}

/**
 * Normalize a list of raw major strings to canonical names.
 * - Empty strings are skipped.
 * - Alias overrides win over the LLM and are never sent to it.
 * - When `llm` is null, every remaining raw maps to itself (passthrough), llmUsed=false.
 * - One batched LLM call covers all un-aliased distinct majors.
 */
export async function normalizeMajors(
  raws: string[], llm: LlmClient | null, aliases: Record<string, string>,
): Promise<NormalizeResult> {
  const distinct = [...new Set(raws.map((r) => r.trim()).filter((r) => r.length > 0))];
  const map: Record<string, string> = {};

  const toAsk: string[] = [];
  for (const raw of distinct) {
    if (aliases[raw]) map[raw] = aliases[raw];
    else toAsk.push(raw);
  }

  if (toAsk.length === 0) return { map, llmUsed: false };
  if (!llm) {
    for (const raw of toAsk) map[raw] = raw;
    return { map, llmUsed: false };
  }

  let parsed: Record<string, string> = {};
  try {
    const res = await llm.complete(SYSTEM, buildUserPrompt(toAsk), { maxTokens: 1024 });
    parsed = JSON.parse(res.text) as Record<string, string>;
  } catch {
    parsed = {};
  }
  for (const raw of toAsk) {
    const canon = parsed[raw];
    map[raw] = typeof canon === 'string' && canon.trim() ? canon.trim() : raw;
  }
  return { map, llmUsed: true };
}
