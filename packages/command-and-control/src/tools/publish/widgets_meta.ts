import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WidgetsMeta, WidgetMetaEntry } from './manifest_types.js';

const FILE = 'widgets-meta.json';

/** Compose the canonical widgets-meta key. Double underscore separator because
 *  both slug and id can legitimately contain single hyphens (catalog kinds use
 *  them — `drag-to-categorize`, `multi-step-reveal`, etc.). */
export function widgetMetaKey(slug: string, id: string): string {
  return `${slug}__${id}`;
}

export function emptyWidgetsMeta(): WidgetsMeta {
  return { widgets: {} };
}

/** Read widgets-meta.json from a snapshot dir. Treats missing or malformed file
 *  as empty — same approach state_meta uses for the publish-state pointer file.
 *  A corrupt sidecar must not hard-block the next publish; the meta gets rebuilt
 *  fresh on the next preview anyway. */
export function readWidgetsMeta(snapshotDir: string): WidgetsMeta {
  const path = join(snapshotDir, FILE);
  if (!existsSync(path)) return emptyWidgetsMeta();
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as WidgetsMeta;
  } catch {
    return emptyWidgetsMeta();
  }
}

export function writeWidgetsMeta(snapshotDir: string, meta: WidgetsMeta): void {
  writeFileSync(join(snapshotDir, FILE), JSON.stringify(meta, null, 2), 'utf-8');
}

/** Merge-patch a single widget entry. Writes back through writeWidgetsMeta.
 *  Preserves any keys already present in the entry (publish only patches
 *  publishedCanvasFileId; preview writes the full record). */
export function updateWidgetMetaEntry(
  snapshotDir: string,
  key: string,
  patch: Partial<WidgetMetaEntry>,
): void {
  const meta = readWidgetsMeta(snapshotDir);
  const existing = meta.widgets[key];
  meta.widgets[key] = { ...(existing ?? ({} as WidgetMetaEntry)), ...patch } as WidgetMetaEntry;
  writeWidgetsMeta(snapshotDir, meta);
}
