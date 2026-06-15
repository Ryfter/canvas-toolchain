// src/tools/rubric/triage.ts
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { AnthropicLlmClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../setup_anthropic.js';
import type { PulledRubric, RubricChangeReport, RubricTriageReport } from './sync_types.js';
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from './triage_prompts.js';

export interface TriageInput {
  pulled: PulledRubric;
  change: RubricChangeReport;
  assignmentSignal: string;
}
export interface TriageDeps { llm?: LlmClient; }

const VERDICTS = new Set(['acceptable', 'needs-update', 'needs-review']);
const EVIDENCE = new Set(['assignment-drift', 'vague-language', 'change-detected']);

function parseTriageJson(raw: string): RubricTriageReport {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*\n/, '').replace(/\n?```\s*$/, '').trim();
  }

  let parsed: unknown;
  try { parsed = JSON.parse(t); }
  catch { throw new Error(`Triage LLM did not return valid JSON. First 200 chars: ${t.slice(0, 200)}`); }

  const o = parsed as Record<string, unknown>;
  if (!VERDICTS.has(String(o.verdict))) {
    throw new Error(`Triage verdict must be acceptable|needs-update|needs-review, got: ${String(o.verdict)}`);
  }
  const flagsRaw = Array.isArray(o.flags) ? o.flags : [];
  const flags = flagsRaw.map(f => {
    const fo = f as Record<string, unknown>;
    const evidence = EVIDENCE.has(String(fo.evidence)) ? String(fo.evidence) : 'vague-language';
    return { criterion: String(fo.criterion ?? ''), issue: String(fo.issue ?? ''), evidence } as RubricTriageReport['flags'][number];
  });

  const report: RubricTriageReport = {
    verdict: o.verdict as RubricTriageReport['verdict'],
    flags,
    rationale: String(o.rationale ?? ''),
  };
  if (report.verdict === 'needs-update' && typeof o.proposedFacultyRubric === 'string') {
    report.proposedFacultyRubric = o.proposedFacultyRubric;
  }
  return report;
}

export async function triageRubric(input: TriageInput, deps: TriageDeps = {}): Promise<RubricTriageReport> {
  const llm = deps.llm ?? new AnthropicLlmClient(loadAnthropicConfig());
  const userPrompt = buildTriageUserPrompt(input);
  const response = await llm.complete(TRIAGE_SYSTEM_PROMPT, userPrompt, { maxTokens: 4096 });
  return parseTriageJson(response.text);
}
