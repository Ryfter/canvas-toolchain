import type { InstitutionProfile, ProfileTool } from '../discovery/profile.js';
import { stringify as stringifyYaml } from 'yaml';

/** Coarse, non-identifying identifier keys kept in anonymized mode. Default-deny: anything
 *  not in this set is dropped. Compared lower-cased. */
export const SAFE_IDENTIFIER_KEYS = ['lms', 'institutiontype', 'sizebucket', 'region'] as const;

/** Tool fields allowed to leave the machine. Mirrors #76's ProfileTool exactly; guards against a
 *  future profile change leaking a new field. */
export const SAFE_TOOL_KEYS = ['id', 'name', 'scope', 'module', 'source'] as const;

export interface SubmissionPayload {
  named: boolean;
  identifiers: Record<string, string>;
  tools: ProfileTool[];
}

export interface BuildOptions {
  named?: boolean;
}

const SAFE_ID_SET = new Set<string>(SAFE_IDENTIFIER_KEYS);

export function buildSubmissionPayload(
  profile: InstitutionProfile,
  opts: BuildOptions = {},
): SubmissionPayload {
  const named = opts.named === true;

  const identifiers: Record<string, string> = {};
  for (const [k, v] of Object.entries(profile.identifiers ?? {})) {
    if (named || SAFE_ID_SET.has(k.toLowerCase())) identifiers[k] = v;
  }

  const tools: ProfileTool[] = (profile.tools ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    scope: t.scope,
    module: t.module,
    source: t.source,
  }));

  return { named, identifiers, tools };
}

/** Identifier keys that can name the institution in a named-mode title, in priority order. */
const NAME_KEYS = ['institution', 'institutionname', 'name'];

export function renderIssueTitle(payload: SubmissionPayload): string {
  const n = payload.tools.length;
  if (payload.named) {
    for (const want of NAME_KEYS) {
      const hit = Object.entries(payload.identifiers).find(([k]) => k.toLowerCase() === want);
      if (hit) return `usage-feedback: ${hit[1]} — ${n} tools`;
    }
    return `usage-feedback: named — ${n} tools`;
  }
  return `usage-feedback: anonymous — ${n} tools`;
}

export function renderIssueBody(payload: SubmissionPayload): string {
  const cell = (s: string) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

  const idEntries = Object.entries(payload.identifiers);
  const idTable = idEntries.length
    ? ['| Key | Value |', '|---|---|', ...idEntries.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`)].join('\n')
    : payload.named
      ? '_None recorded._'
      : 'None (anonymized).';

  const toolTable = payload.tools.length
    ? [
        '| Tool | Module | Scope | Source |',
        '|---|---|---|---|',
        ...payload.tools.map((t) => `| ${cell(t.name)} | ${cell(t.module)} | ${cell(t.scope)} | ${cell(t.source)} |`),
      ].join('\n')
    : '_No tools recorded._';

  const yamlBlock = stringifyYaml({
    named: payload.named,
    identifiers: payload.identifiers,
    tools: payload.tools,
  }).trimEnd();

  return [
    '<!-- canvas-toolchain usage-feedback v1 -->',
    `**Mode:** ${payload.named ? 'named' : 'anonymized'}`,
    '',
    '## Identifiers',
    idTable,
    '',
    '## Tools',
    toolTable,
    '',
    '<details><summary>Machine-readable</summary>',
    '',
    '```yaml',
    yamlBlock,
    '```',
    '</details>',
    '',
  ].join('\n');
}
