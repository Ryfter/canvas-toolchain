import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export interface CatalogEntry {
  id: string;
  name: string;
  identifiers: string[];
  module: string | null;
}

export interface Catalog {
  all: CatalogEntry[];
  byId: Map<string, CatalogEntry>;
}

/** Resolve data/known-tools.yaml relative to this compiled file (dist/discovery → ../../data). */
function catalogPath(): string {
  return fileURLToPath(new URL('../../data/known-tools.yaml', import.meta.url));
}

export function loadCatalog(path: string = catalogPath()): Catalog {
  if (!existsSync(path)) {
    throw new Error(`KNOWN_TOOLS_NOT_FOUND: known-tools.yaml not present at ${path}`);
  }
  const parsed = (parseYaml(readFileSync(path, 'utf-8')) ?? {}) as { tools?: CatalogEntry[] };
  const all = (parsed.tools ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    identifiers: (t.identifiers ?? []).map((s) => s.toLowerCase()),
    module: t.module ?? null,
  }));
  const byId = new Map(all.map((t) => [t.id, t]));
  return { all, byId };
}

/** Case-insensitive substring match of a raw Canvas tool name/domain against catalog identifiers. */
export function matchIdentifier(catalog: Catalog, raw: string): CatalogEntry | undefined {
  const needle = raw.toLowerCase();
  return catalog.all.find((t) => t.identifiers.some((idf) => needle.includes(idf) || idf.includes(needle)));
}
