import type { SectionId } from './types.js';

/** A parsed snapshot document. `managedSections` maps each AUTO:start id to
 *  its current body. The document itself is reconstructed by walking
 *  `orderedSegments` — each segment is either a verbatim prose chunk or a
 *  reference to a managed section by id. */
export interface ParsedSnapshot {
  managedSections: Map<SectionId, string>;
  /** Segments in document order. Either { prose } (verbatim) or { sectionId }
   *  (a placeholder that the composer fills with regenerated content). */
  orderedSegments: Array<{ prose: string } | { sectionId: SectionId }>;
  /** Existing Update Log rows in the order they appear (typically newest-first
   *  per Kevin's convention). Used by the composer to prepend new rows. */
  existingUpdateLogRows: string[];
}

const MARKER_RE = /<!--\s*AUTO:start\s+id="([a-z-]+)"\s*-->([\s\S]*?)<!--\s*AUTO:end\s*-->/g;

/** Parse a previously-written snapshot doc into its managed sections + verbatim
 *  prose segments. Returns a structure the composer can use to rewrite ONLY the
 *  managed section contents while preserving every byte of prose around them.
 *
 *  If a content has no AUTO markers (e.g. a hand-written file the user pointed
 *  the tool at, or a corrupted file), the whole document is treated as a single
 *  prose segment — the composer will insert all sections at the end. */
export function parseExistingSnapshot(content: string): ParsedSnapshot {
  const managed = new Map<SectionId, string>();
  const segments: Array<{ prose: string } | { sectionId: SectionId }> = [];

  let cursor = 0;
  MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_RE.exec(content)) !== null) {
    const fullStart = match.index;
    const fullEnd = match.index + match[0].length;
    const id = match[1] as SectionId;
    const body = match[2].trim();

    if (fullStart > cursor) {
      segments.push({ prose: content.slice(cursor, fullStart) });
    }
    managed.set(id, body);
    segments.push({ sectionId: id });
    cursor = fullEnd;
  }
  if (cursor < content.length) {
    segments.push({ prose: content.slice(cursor) });
  }

  // Extract Update Log rows from the managed `update-log` body (if present).
  const existingUpdateLogRows: string[] = [];
  const logBody = managed.get('update-log');
  if (logBody) {
    // The body is a markdown table. Skip header + separator rows; collect data rows.
    const lines = logBody.split('\n').map(l => l.trim()).filter(Boolean);
    let seenHeader = false;
    let seenSeparator = false;
    for (const line of lines) {
      if (!line.startsWith('|')) continue;
      if (!seenHeader) { seenHeader = true; continue; }
      if (!seenSeparator) {
        // Separator row contains only |, -, :, and spaces
        if (/^\|[\s|:-]+\|$/.test(line)) { seenSeparator = true; continue; }
        // Some users may write the header without a separator immediately — fall through
        seenSeparator = true;
      }
      existingUpdateLogRows.push(line);
    }
  }

  return { managedSections: managed, orderedSegments: segments, existingUpdateLogRows };
}
