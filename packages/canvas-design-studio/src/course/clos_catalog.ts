import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { Clo, CloTag } from '@canvas-toolchain/shared-types';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

function isCloTag(v: unknown): v is CloTag {
  return v === 'core' || v === 'supporting';
}

export interface ReadClosCatalogResult {
  clos: Clo[];
  warnings: string[];
}

export function readClosCatalog(courseConfigPath: string): ReadClosCatalogResult {
  const warnings: string[] = [];
  if (!existsSync(courseConfigPath)) return { clos: [], warnings };

  const raw = readFileSync(courseConfigPath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) return { clos: [], warnings };

  let fm: unknown;
  try {
    fm = parseYaml(m[1]);
  } catch {
    return { clos: [], warnings };
  }
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return { clos: [], warnings };

  const closRaw = (fm as Record<string, unknown>).clos;
  if (!Array.isArray(closRaw)) return { clos: [], warnings };

  const clos: Clo[] = [];
  for (let i = 0; i < closRaw.length; i++) {
    const entry = closRaw[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push(`clos[${i}] is not an object — skipped`);
      continue;
    }
    const obj = entry as Record<string, unknown>;
    if (typeof obj.id !== 'string' || obj.id.length === 0) {
      warnings.push(`clos[${i}] missing or empty id — skipped`);
      continue;
    }
    if (typeof obj.name !== 'string' || obj.name.length === 0) {
      warnings.push(`clos[${i}] (id=${obj.id}) missing or empty name — skipped`);
      continue;
    }
    if (typeof obj.statement !== 'string' || obj.statement.length === 0) {
      warnings.push(`clos[${i}] (id=${obj.id}) missing or empty statement — skipped`);
      continue;
    }
    const clo: Clo = { id: obj.id, name: obj.name, statement: obj.statement };
    if (obj.tag !== undefined) {
      if (!isCloTag(obj.tag)) {
        warnings.push(`clos[${i}] (id=${obj.id}) invalid tag "${String(obj.tag)}" — skipped`);
        continue;
      }
      clo.tag = obj.tag;
    }
    clos.push(clo);
  }

  return { clos, warnings };
}
