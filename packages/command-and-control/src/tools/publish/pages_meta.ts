import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PagesMeta, PageMetaEntry } from './manifest_types.js';

const FILE = 'pages-meta.json';

export function emptyPagesMeta(): PagesMeta {
  return { pages: {} };
}

/** Same fail-soft read semantics as widgets_meta / state_meta — missing or
 *  malformed file returns empty meta. Foundation for the V&R drift detector,
 *  which will land in a later plan; today preview just writes; nothing reads
 *  for behavioral decisions yet. */
export function readPagesMeta(snapshotDir: string): PagesMeta {
  const path = join(snapshotDir, FILE);
  if (!existsSync(path)) return emptyPagesMeta();
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PagesMeta;
  } catch {
    return emptyPagesMeta();
  }
}

export function writePagesMeta(snapshotDir: string, meta: PagesMeta): void {
  writeFileSync(join(snapshotDir, FILE), JSON.stringify(meta, null, 2), 'utf-8');
}

export function updatePageMetaEntry(
  snapshotDir: string,
  filename: string,
  patch: Partial<PageMetaEntry>,
): void {
  const meta = readPagesMeta(snapshotDir);
  const existing = meta.pages[filename];
  meta.pages[filename] = { ...(existing ?? ({} as PageMetaEntry)), ...patch } as PageMetaEntry;
  writePagesMeta(snapshotDir, meta);
}
