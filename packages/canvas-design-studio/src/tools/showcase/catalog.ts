import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export type SupportStatus = 'supported' | 'partial' | 'aspirational';

export interface CatalogCategory {
  id: string;
  name: string;
  description: string;
}

export interface CatalogPattern {
  id: string;
  name: string;
  category: string;
  supportStatus: SupportStatus;
  description: string;
  whenToUse: string;
  notes?: string;
  exampleHtml: string;
}

export interface CapabilityCatalog {
  version: number;
  updated: string;
  categories: CatalogCategory[];
  patterns: CatalogPattern[];
}

const VALID_STATUS: ReadonlySet<SupportStatus> = new Set<SupportStatus>([
  'supported',
  'partial',
  'aspirational',
]);

function getPackagedYamlPath(): string {
  return fileURLToPath(new URL('../../../data/canvas-capabilities.yaml', import.meta.url));
}

export function loadCatalog(): CapabilityCatalog {
  return loadCatalogFromPath(getPackagedYamlPath());
}

export function loadCatalogFromPath(path: string): CapabilityCatalog {
  if (!existsSync(path)) {
    throw new Error(`CATALOG_NOT_FOUND: canvas-capabilities.yaml not present at ${path}`);
  }

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf-8'));
  } catch (err) {
    throw new Error(`CATALOG_INVALID: YAML parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return validateCatalog(raw);
}

function validateCatalog(raw: unknown): CapabilityCatalog {
  if (!isObject(raw)) throw new Error('CATALOG_INVALID: top-level must be an object');

  const version = raw.version;
  if (typeof version !== 'number') throw new Error('CATALOG_INVALID: version must be a number');

  const updated = raw.updated;
  if (typeof updated !== 'string') throw new Error('CATALOG_INVALID: updated must be a string');

  const categories = raw.categories;
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('CATALOG_INVALID: categories must be a non-empty array');
  }

  const validatedCategories: CatalogCategory[] = categories.map((c, i) => {
    if (!isObject(c)) throw new Error(`CATALOG_INVALID: categories[${i}] must be an object`);
    requireString(c, 'id', `categories[${i}].id`);
    requireString(c, 'name', `categories[${i}].name`);
    requireString(c, 'description', `categories[${i}].description`);
    return { id: c.id as string, name: c.name as string, description: c.description as string };
  });

  const categoryIds = new Set(validatedCategories.map((c) => c.id));

  const patternsRaw = raw.patterns;
  if (!Array.isArray(patternsRaw)) {
    throw new Error('CATALOG_INVALID: patterns must be an array');
  }

  const validatedPatterns: CatalogPattern[] = patternsRaw.map((p, i) => {
    if (!isObject(p)) throw new Error(`CATALOG_INVALID: patterns[${i}] must be an object`);
    requireString(p, 'id', `patterns[${i}].id`);
    requireString(p, 'name', `patterns[${i}].name`);
    requireString(p, 'category', `patterns[${i}].category`);
    requireString(p, 'supportStatus', `patterns[${i}].supportStatus`);
    requireString(p, 'description', `patterns[${i}].description`);
    requireString(p, 'whenToUse', `patterns[${i}].whenToUse`);
    requireString(p, 'exampleHtml', `patterns[${i}].exampleHtml`);

    const category = p.category as string;
    if (!categoryIds.has(category)) {
      throw new Error(`CATALOG_INVALID: patterns[${i}].category="${category}" does not match any defined category`);
    }

    const status = p.supportStatus as string;
    if (!VALID_STATUS.has(status as SupportStatus)) {
      throw new Error(`CATALOG_INVALID: patterns[${i}].supportStatus="${status}" must be one of supported|partial|aspirational`);
    }

    const result: CatalogPattern = {
      id: p.id as string,
      name: p.name as string,
      category,
      supportStatus: status as SupportStatus,
      description: p.description as string,
      whenToUse: p.whenToUse as string,
      exampleHtml: p.exampleHtml as string,
    };
    if (typeof p.notes === 'string') result.notes = p.notes;
    return result;
  });

  return {
    version,
    updated,
    categories: validatedCategories,
    patterns: validatedPatterns,
  };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function requireString(obj: Record<string, unknown>, key: string, label: string): void {
  if (typeof obj[key] !== 'string' || (obj[key] as string).length === 0) {
    throw new Error(`CATALOG_INVALID: ${label} must be a non-empty string`);
  }
}

export function getPatternById(catalog: CapabilityCatalog, id: string): CatalogPattern | null {
  return catalog.patterns.find((p) => p.id === id) ?? null;
}
