import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { AiasLevel } from '@canvas-toolchain/shared-types';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

function isAiasLevel(v: unknown): v is AiasLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

export interface PageAiasOverride {
  level: AiasLevel;
  note?: string;
}

export function extractAiasFromFile(mdPath: string): PageAiasOverride | undefined {
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

  const obj = parsed as Record<string, unknown>;
  if (!isAiasLevel(obj.aiasLevel)) return undefined;

  const result: PageAiasOverride = { level: obj.aiasLevel };
  if (typeof obj.aiasNote === 'string' && obj.aiasNote.length > 0) {
    result.note = obj.aiasNote;
  }
  return result;
}
