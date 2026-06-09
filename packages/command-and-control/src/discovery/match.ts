import { matchIdentifier, type Catalog } from './catalog.js';
import type { DetectedTool } from './canvas_scan.js';

export interface ModuleStateLike {
  id: string;
  name: string;
  enabled: boolean;
  handles: string[];
}

export interface MatchResult {
  matchedModules: Array<{ tool: string; module: string; enabled: boolean }>;
  unmatched: string[]; // catalog id when known, else raw name
}

/** Pure cross-reference: detected tools → catalog → module handles[] + enabled state. */
export function matchDetected(
  catalog: Catalog,
  moduleState: ModuleStateLike[],
  detected: DetectedTool[],
): MatchResult {
  const matchedModules: MatchResult['matchedModules'] = [];
  const unmatched: string[] = [];
  const seenMatch = new Set<string>();

  for (const d of detected) {
    const entry = matchIdentifier(catalog, d.rawName);
    if (entry?.module) {
      // find a known module that handles this tool/provider id
      const mod = moduleState.find((m) => m.id === entry.module && m.handles.includes(entry.id));
      if (mod) {
        const key = `${entry.id}:${mod.id}`;
        if (!seenMatch.has(key)) {
          seenMatch.add(key);
          matchedModules.push({ tool: entry.id, module: mod.id, enabled: mod.enabled });
        }
        continue;
      }
      // catalog says there's a module, but it's not registered/known → unmatched by catalog id
      if (!unmatched.includes(entry.id)) unmatched.push(entry.id);
      continue;
    }
    const label = entry ? entry.id : d.rawName;
    if (!unmatched.includes(label)) unmatched.push(label);
  }

  return { matchedModules, unmatched };
}
