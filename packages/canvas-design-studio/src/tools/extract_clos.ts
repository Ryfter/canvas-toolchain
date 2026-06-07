import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

export function extractClosFromFile(mdPath: string): string[] {
  const raw = readFileSync(mdPath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) return [];

  let parsed: unknown;
  try {
    parsed = parseYaml(m[1]);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const closRaw = (parsed as Record<string, unknown>).clos;
  if (!Array.isArray(closRaw)) return [];

  return closRaw
    .map((v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null))
    .filter((v): v is string => v !== null && v.length > 0);
}
