import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getCcHomePath } from '../kb/config.js';

export interface ProfileTool {
  id: string;
  name: string;
  scope: 'global' | 'class';
  module: string; // module id or 'none'
  source: 'detected' | 'self-reported';
}

export interface InstitutionProfile {
  identifiers: Record<string, string>;
  tools: ProfileTool[];
}

export function getProfilePath(): string {
  return join(getCcHomePath(), 'institution-profile.md');
}

const FENCE = '```';

/** Extract the fenced ```yaml block following a "## Tools" heading. Tolerant: returns empty on any failure. */
export function loadProfile(path: string = getProfilePath()): InstitutionProfile {
  const empty: InstitutionProfile = { identifiers: {}, tools: [] };
  if (!existsSync(path)) return empty;
  try {
    const text = readFileSync(path, 'utf-8');
    const match = text.match(/##\s*Tools\s*\n+```ya?ml\n([\s\S]*?)\n```/);
    if (!match) return empty;
    const data = parseYaml(match[1]) as { identifiers?: Record<string, string>; tools?: ProfileTool[] } | undefined;
    if (!data || !Array.isArray(data.tools)) return empty;
    return { identifiers: data.identifiers ?? {}, tools: data.tools };
  } catch {
    return empty;
  }
}

/** Accretive merge by id: new ids added, existing ids replaced by incoming, nothing dropped. */
export function mergeTools(
  existing: ProfileTool[],
  incoming: ProfileTool[],
): { merged: ProfileTool[]; added: string[]; updated: string[] } {
  const byId = new Map(existing.map((t) => [t.id, t]));
  const added: string[] = [];
  const updated: string[] = [];
  for (const t of incoming) {
    if (byId.has(t.id)) updated.push(t.id);
    else added.push(t.id);
    byId.set(t.id, t);
  }
  return { merged: [...byId.values()], added, updated };
}

function renderProfile(p: InstitutionProfile): string {
  const idLines = Object.entries(p.identifiers)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  const yamlBlock = stringifyYaml({ identifiers: p.identifiers, tools: p.tools }).trimEnd();
  return [
    '# Institution Profile',
    '',
    '> Produced by canvas-toolchain tool discovery (#76). Identifiers + tool inventory only — no tokens or student data.',
    '',
    '## Identifiers',
    idLines || '- (none)',
    '',
    '## Tools',
    `${FENCE}yaml`,
    yamlBlock,
    FENCE,
    '',
  ].join('\n');
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(getCcHomePath(), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content, { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
}

/** Write the full profile (already-merged) atomically. Returns the path. */
export function saveProfile(p: InstitutionProfile, path: string = getProfilePath()): string {
  atomicWrite(path, renderProfile(p));
  return path;
}

/** Append/replace a `tools:` delta in a course's course-config.md. Throws COURSE_NOT_FOUND if the dir is absent. */
export function writeClassDelta(courseDir: string, delta: { uses?: string[]; skips?: string[] }): void {
  if (!existsSync(courseDir) || !statSync(courseDir).isDirectory()) {
    throw new Error(`COURSE_NOT_FOUND: ${courseDir}`);
  }
  const cfgPath = join(courseDir, 'course-config.md');
  const prior = existsSync(cfgPath) ? readFileSync(cfgPath, 'utf-8') : '# Course\n';
  const block = ['tools:', `  uses: [${(delta.uses ?? []).join(', ')}]`, `  skips: [${(delta.skips ?? []).join(', ')}]`].join(
    '\n',
  );
  // Replace an existing tools: block (our simple 3-line shape) or append.
  const stripped = prior.replace(/\n?tools:\n(?:[ \t]+\w+:.*\n?)*/g, '\n').trimEnd();
  const next = `${stripped}\n\n${block}\n`;
  const tmp = `${cfgPath}.tmp`;
  writeFileSync(tmp, next, { encoding: 'utf-8' });
  renameSync(tmp, cfgPath);
}
