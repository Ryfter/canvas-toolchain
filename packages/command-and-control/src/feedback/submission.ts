import type { InstitutionProfile, ProfileTool } from '../discovery/profile.js';

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
