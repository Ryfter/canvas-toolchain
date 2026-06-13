import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Grouping } from '../types.js';

export interface History { pairCounts: Record<string, number>; }

function dir(courseId: string): string {
  return join(process.env.CC_HOME ?? join(homedir(), '.command-and-control'), 'groups', courseId);
}
function histPath(courseId: string): string { return join(dir(courseId), 'pairing-history.json'); }

export function pairKey(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }

export function loadHistory(courseId: string): History {
  const p = histPath(courseId);
  if (!existsSync(p)) return { pairCounts: {} };
  try { const h = JSON.parse(readFileSync(p, 'utf-8')) as History; return h.pairCounts ? h : { pairCounts: {} }; }
  catch { return { pairCounts: {} }; }
}

export function appendGrouping(courseId: string, grouping: Grouping): string {
  const h = loadHistory(courseId);
  for (const grp of grouping) {
    for (let i = 0; i < grp.length; i++) {
      for (let j = i + 1; j < grp.length; j++) {
        const k = pairKey(grp[i], grp[j]);
        h.pairCounts[k] = (h.pairCounts[k] ?? 0) + 1;
      }
    }
  }
  mkdirSync(dir(courseId), { recursive: true });
  const p = histPath(courseId);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(h, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, p);
  return p;
}
