import {
  loadProfile,
  saveProfile,
  mergeTools,
  writeClassDelta,
  getProfilePath,
  type ProfileTool,
} from '../discovery/profile.js';

export interface SaveProfileToolInput {
  id: string;
  name: string;
  scope?: 'global' | 'class';
  module?: string;
  source: 'detected' | 'self-reported';
}

export interface SaveInstitutionProfileInput {
  tools: SaveProfileToolInput[];
  identifiers?: Record<string, string>;
  perClass?: Array<{ courseDir: string; uses?: string[]; skips?: string[] }>;
}

export type SaveInstitutionProfileResult =
  | {
      ok: true;
      profilePath: string;
      added: string[];
      updated: string[];
      classesWritten: string[];
      classErrors: Array<{ courseDir: string; error: string }>;
    }
  | { ok: false; error: string; message: string; fix: string[] };

function normalize(t: SaveProfileToolInput): ProfileTool {
  return {
    id: t.id,
    name: t.name,
    scope: t.scope ?? 'global',
    module: t.module ?? 'none',
    source: t.source,
  };
}

export async function saveInstitutionProfile(
  input: SaveInstitutionProfileInput,
): Promise<SaveInstitutionProfileResult> {
  if (!Array.isArray(input.tools)) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      message: 'tools must be an array',
      fix: ['Pass tools: [{ id, name, source }, …]'],
    };
  }

  const current = loadProfile();
  const { merged, added, updated } = mergeTools(current.tools, input.tools.map(normalize));
  const identifiers = { ...current.identifiers, ...(input.identifiers ?? {}) };
  saveProfile({ identifiers, tools: merged });

  const classesWritten: string[] = [];
  const classErrors: Array<{ courseDir: string; error: string }> = [];
  for (const c of input.perClass ?? []) {
    try {
      writeClassDelta(c.courseDir, { uses: c.uses, skips: c.skips });
      classesWritten.push(c.courseDir);
    } catch (err) {
      classErrors.push({ courseDir: c.courseDir, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { ok: true, profilePath: getProfilePath(), added, updated, classesWritten, classErrors };
}
