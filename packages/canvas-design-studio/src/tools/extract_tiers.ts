import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { PageTiers, SectionTier, Tier } from '@canvas-toolchain/shared-types';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

function isTier(v: unknown): v is Tier {
  return v === 1 || v === 2 || v === 3;
}

export function extractTiersFromFile(mdPath: string): PageTiers | undefined {
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

  const tiersRaw = (parsed as Record<string, unknown>).tiers;
  if (!tiersRaw || typeof tiersRaw !== 'object' || Array.isArray(tiersRaw)) return undefined;

  const tiersObj = tiersRaw as Record<string, unknown>;
  const sectionsRaw = tiersObj.sections;
  if (!Array.isArray(sectionsRaw)) return undefined;

  const sections: SectionTier[] = [];
  for (const s of sectionsRaw) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined;
    const obj = s as Record<string, unknown>;
    if (typeof obj.heading !== 'string' || !isTier(obj.tier) || typeof obj.summary !== 'string') {
      return undefined;
    }
    sections.push({ heading: obj.heading, tier: obj.tier, summary: obj.summary });
  }

  const locked = tiersObj.locked === true;
  return locked ? { locked, sections } : { sections };
}
