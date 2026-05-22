import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Verdict } from '@canvas-toolchain/shared-types';
import { listInstalledResources } from '../registry/local_registry.js';
import type { RegistryIndexEntry } from '../registry/local_registry.js';

/**
 * Template family names.
 * Each verdict maps to a family; templates are tagged `family:<name>`.
 */
export type TemplateFamily = 'standard' | 'refresh' | 'new-topic';

/**
 * Resolved template + theme + prompt-set for one assignment.
 */
export interface ResolvedResources {
  templateId: string;
  templateVersion: string;
  themeId: string;
  themeVersion: string;
  promptSetId: string;
  promptSetVersion: string;
}

/** Fallback defaults from the cds-defaults seed bundle. */
const FALLBACK_TEMPLATE_ID = 'assignment';
const FALLBACK_TEMPLATE_VERSION = '1.0.0';
const FALLBACK_THEME_ID = 'cds-default';
const FALLBACK_THEME_VERSION = '1.0.0';
const FALLBACK_PROMPTSET_ID = 'cds-default';
const FALLBACK_PROMPTSET_VERSION = '1.0.0';

/**
 * Maps a KEEP/UPDATE/ADD/DROP verdict to the template family tag it should use.
 * DROP verdicts are not rendered — callers should skip them and record in droppedAssignments.
 */
export function verdictToFamily(verdict: Verdict): TemplateFamily | null {
  switch (verdict) {
    case 'KEEP': return 'standard';
    case 'UPDATE': return 'refresh';
    case 'ADD': return 'new-topic';
    case 'DROP': return null;
  }
}

/** Course-level template preferences, from course config. */
export interface TemplatePreferences {
  /** Explicit override per family — bypass registry lookup for that family. */
  familyPreference?: Partial<Record<TemplateFamily, { templateId: string; templateVersion: string }>>;
  /** Per-assignment override — always wins. */
  overrides?: Record<string, { templateId: string; templateVersion: string }>;
  themeId?: string;
  themeVersion?: string;
  promptSetId?: string;
  promptSetVersion?: string;
}

/**
 * Resolves the template, theme, and prompt-set for one assignment.
 *
 * Resolution order for template:
 * 1. Per-assignment override in `prefs.overrides`
 * 2. Family preference in `prefs.familyPreference`
 * 3. Registry lookup: installed templates tagged `family:<family>` AND `assignment`
 *    (most recently installed wins when multiple match)
 * 4. Fallback to cds-defaults seed (`assignment@1.0.0`)
 */
export function resolveResources(
  verdict: Verdict,
  assignmentName: string,
  prefs: TemplatePreferences = {},
): ResolvedResources | null {
  const family = verdictToFamily(verdict);
  if (family === null) return null; // DROP — caller handles

  const themeId = prefs.themeId ?? FALLBACK_THEME_ID;
  const themeVersion = prefs.themeVersion ?? FALLBACK_THEME_VERSION;
  const promptSetId = prefs.promptSetId ?? FALLBACK_PROMPTSET_ID;
  const promptSetVersion = prefs.promptSetVersion ?? FALLBACK_PROMPTSET_VERSION;

  // 1. Per-assignment override
  if (prefs.overrides?.[assignmentName]) {
    const o = prefs.overrides[assignmentName];
    return { templateId: o.templateId, templateVersion: o.templateVersion, themeId, themeVersion, promptSetId, promptSetVersion };
  }

  // 2. Family preference
  if (prefs.familyPreference?.[family]) {
    const f = prefs.familyPreference[family]!;
    return { templateId: f.templateId, templateVersion: f.templateVersion, themeId, themeVersion, promptSetId, promptSetVersion };
  }

  // 3. Registry lookup by tag
  const match = findTemplateByFamily(family);
  if (match) {
    return { templateId: match.id, templateVersion: match.version, themeId, themeVersion, promptSetId, promptSetVersion };
  }

  // 4. Fallback to seed defaults
  return {
    templateId: FALLBACK_TEMPLATE_ID,
    templateVersion: FALLBACK_TEMPLATE_VERSION,
    themeId,
    themeVersion,
    promptSetId,
    promptSetVersion,
  };
}

function findTemplateByFamily(family: TemplateFamily): RegistryIndexEntry | null {
  const templates = listInstalledResources({ kind: 'template' });
  const familyTag = `family:${family}`;

  const matches: RegistryIndexEntry[] = [];
  for (const entry of templates) {
    const tags = readManifestTags(entry.path);
    if (tags.includes(familyTag) && tags.includes('assignment')) {
      matches.push(entry);
    }
  }

  if (matches.length === 0) return null;

  // Most recently installed wins
  return matches.sort((a, b) =>
    new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime()
  )[0];
}

function readManifestTags(resourcePath: string): string[] {
  const manifestPath = join(resourcePath, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { tags?: string[] };
    return manifest.tags ?? [];
  } catch {
    return [];
  }
}
