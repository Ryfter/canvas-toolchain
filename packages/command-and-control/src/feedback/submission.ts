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

/** Pick the institution name for a named-mode title, if one of these keys is present. */
const NAME_KEYS = ['institution', 'name', 'institutionname'];

export function renderIssueTitle(payload: SubmissionPayload): string {
  const n = payload.tools.length;
  if (payload.named) {
    const hit = Object.entries(payload.identifiers).find(([k]) => NAME_KEYS.includes(k.toLowerCase()));
    return `usage-feedback: ${hit ? hit[1] : 'named'} — ${n} tools`;
  }
  return `usage-feedback: anonymous — ${n} tools`;
}

export function renderIssueBody(payload: SubmissionPayload): string {
  const idEntries = Object.entries(payload.identifiers);
  const idTable = idEntries.length
    ? ['| Key | Value |', '|---|---|', ...idEntries.map(([k, v]) => `| ${k} | ${v} |`)].join('\n')
    : payload.named
      ? '_None recorded._'
      : 'None (anonymized).';

  const toolTable = payload.tools.length
    ? [
        '| Tool | Module | Scope | Source |',
        '|---|---|---|---|',
        ...payload.tools.map((t) => `| ${t.name} | ${t.module} | ${t.scope} | ${t.source} |`),
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
