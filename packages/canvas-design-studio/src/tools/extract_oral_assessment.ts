import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

export interface PageOralAssessment {
  prepSeconds: number;
  responseSeconds: number;
  randomization: { pick: number; of: number };
  attempts: string;
  launchUrl?: string;
}

export function extractOralAssessmentFromFile(mdPath: string): PageOralAssessment | undefined {
  const raw = readFileSync(mdPath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) return undefined;

  let parsed: unknown;
  try {
    parsed = parseYaml(m[1]);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;

  const o = parsed as Record<string, unknown>;
  if (typeof o.prep_seconds !== 'number' || typeof o.response_seconds !== 'number') return undefined;

  const pick = typeof o.randomize_pick === 'number' ? o.randomize_pick : 1;
  const of = typeof o.randomize_of === 'number' ? o.randomize_of : 1;
  const result: PageOralAssessment = {
    prepSeconds: o.prep_seconds,
    responseSeconds: o.response_seconds,
    randomization: { pick, of },
    attempts: String(o.attempts ?? '1'),
  };
  if (typeof o.launch_url === 'string' && o.launch_url.length > 0) result.launchUrl = o.launch_url;
  return result;
}
