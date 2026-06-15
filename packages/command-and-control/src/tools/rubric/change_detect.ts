// src/tools/rubric/change_detect.ts
import type { PulledRubric, RubricChangeReport } from './sync_types.js';

/** Parse `## Criterion N: <name> — <pts> pts` + `**Faculty rubric language:**`
 *  blocks from a previously rendered rubric markdown into { name: facultyText }. */
export function parseFacultyBlocks(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Split on criterion headers, keeping the name.
  const headerRe = /^##\s+Criterion\s+\S+:\s+(.+?)\s+—\s+\d+\s+pts\s*$/gm;
  const matches = [...md.matchAll(headerRe)];
  for (let i = 0; i < matches.length; i += 1) {
    const name = matches[i][1].trim();
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? md.length) : md.length;
    const section = md.slice(start, end);
    const fac = section.match(/\*\*Faculty rubric language:\*\*\s*\n([\s\S]*?)(?:\n\s*\n|\n##|$)/);
    if (fac) out[name] = fac[1].trim();
  }
  return out;
}

export function detectRubricChange(pulled: PulledRubric, priorMd?: string): RubricChangeReport {
  if (!priorMd || priorMd.trim() === '') {
    return { status: 'first-draft', added: [], removed: [], modified: [] };
  }
  const prior = parseFacultyBlocks(priorMd);
  const pulledByName = new Map(pulled.criteria.map(c => [c.name, c.description.trim()]));

  const added: string[] = [];
  const modified: RubricChangeReport['modified'] = [];
  for (const [name, after] of pulledByName) {
    if (!(name in prior)) { added.push(name); continue; }
    if (prior[name].trim() !== after) modified.push({ name, before: prior[name].trim(), after });
  }
  const removed = Object.keys(prior).filter(name => !pulledByName.has(name));

  const status = added.length === 0 && removed.length === 0 && modified.length === 0 ? 'unchanged' : 'changed';
  return { status, added, removed, modified };
}
