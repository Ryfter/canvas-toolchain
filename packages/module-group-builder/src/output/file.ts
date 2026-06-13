import type { Diagnostics, Grouping, StudentRecord } from '../types.js';

function pseudo(byId: Map<string, StudentRecord>, id: string): string { return byId.get(id)?.pseudonym || `(no-pseudonym:${id})`; }

export function renderGroupsCsv(grouping: Grouping, records: StudentRecord[]): string {
  const byId = new Map(records.map((r) => [r.canvasId, r] as const));
  const lines = ['group,pseudonym,canvas_id'];
  grouping.forEach((grp, gi) => grp.forEach((id) => lines.push(`${gi + 1},${pseudo(byId, id)},${id}`)));
  return lines.join('\n') + '\n';
}

export function renderGroupsMarkdown(grouping: Grouping, records: StudentRecord[], d: Diagnostics): string {
  const byId = new Map(records.map((r) => [r.canvasId, r] as const));
  const out: string[] = [`# Groups — ${d.strategy}`, '', `Strategy: ${d.strategy} · ${d.groupCount} groups · seed ${d.seed}`, ''];
  grouping.forEach((grp, gi) => {
    out.push(`## Group ${gi + 1}`);
    grp.forEach((id) => out.push(`- ${pseudo(byId, id)} (canvas ${id})`));
    out.push('');
  });
  if (d.repeatPairs.length > 0) {
    out.push('## Unavoidable repeat pairings', '');
    d.repeatPairs.forEach(([a, b]) => out.push(`- ${pseudo(byId, a)} + ${pseudo(byId, b)}`));
    out.push('');
  }
  return out.join('\n');
}
