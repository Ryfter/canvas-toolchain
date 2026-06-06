import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { PageTiers } from '@canvas-toolchain/shared-types';

export interface AssignTiersSection {
  heading: string;
  body: string;
}

const FM_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function readPageFrontMatter(filePath: string): {
  fm: Record<string, unknown>;
  body: string;
} {
  const raw = readFileSync(filePath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) {
    return { fm: {}, body: raw };
  }
  let fm: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      fm = parsed as Record<string, unknown>;
    }
  } catch {
    // leave fm empty on parse failure
  }
  return { fm, body: m[2] };
}

export function writePageTiers(filePath: string, tiers: PageTiers): void {
  const { fm, body } = readPageFrontMatter(filePath);
  const mergedFm: Record<string, unknown> = { ...fm, tiers };

  const fmYaml = stringifyYaml(mergedFm).trimEnd();
  const output = `---\n${fmYaml}\n---\n${body.startsWith('\n') ? body : '\n' + body}`;

  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, output, 'utf-8');
  renameSync(tmp, filePath);
}

export function splitSections(body: string): AssignTiersSection[] {
  const lines = body.split('\n');
  const sections: AssignTiersSection[] = [];
  let current: AssignTiersSection | null = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h2 || h3) {
      if (current) sections.push(current);
      current = { heading: (h2 ?? h3)![1], body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) sections.push(current);

  return sections.map((s) => ({ heading: s.heading, body: s.body.trim() }));
}
