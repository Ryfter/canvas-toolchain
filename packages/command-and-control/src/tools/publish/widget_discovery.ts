/** Widget discovery + iframe-src substitution for publish_course.
 *
 *  Pages rendered by generate_course go through substituteWidgetPlaceholders
 *  (in canvas-design-mcp) which replaces every `{{ widget:<id> }}` in the
 *  source markdown with a self-contained <iframe> pointing at
 *  `<pageSlug>/widgets/<id>.html` (relative path).
 *
 *  At publish time we scan that rendered HTML, find every such iframe,
 *  upload each widget's HTML to Canvas Files via publish_widget, then
 *  rewrite the iframe `src` to point at the returned Canvas Files preview
 *  URL before pushing the page.
 *
 *  Per Phase 0 finding (2026-06-03 against BSU sandbox), Canvas Files
 *  `on_duplicate=overwrite` is delete + recreate semantics — the file_id
 *  changes on every overwrite. So every widget update triggers an iframe
 *  src rewrite, which means every widget update is also a page change.
 *  That's baked in here. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InteractiveSpec } from 'canvas-design-mcp/dist/tools/widget/types.js';

export interface WidgetRef {
  /** Page slug — first path component of the iframe src (e.g., "assignment"). */
  slug: string;
  /** Widget id — basename of the src without extension (e.g., "data-types-categorize"). */
  id: string;
  /** Exact substring to substitute. Used to do a precise replace that won't
   *  collide with another iframe that has a different src but otherwise
   *  identical attributes. */
  fullMatch: string;
}

/** Match the iframe tag produced by substituteWidgetPlaceholders. Captures the
 *  src attribute value and the full tag for precise substitution. Allows arbitrary
 *  attribute ordering inside the tag (markdown converter may add its own). */
const WIDGET_IFRAME_RE = /<iframe\b[^>]*\bsrc="([a-z0-9-]+)\/widgets\/([a-z0-9-]+)\.html"[^>]*>[\s\S]*?<\/iframe>/gi;

export function discoverWidgetRefs(html: string): WidgetRef[] {
  const out: WidgetRef[] = [];
  for (const m of html.matchAll(WIDGET_IFRAME_RE)) {
    out.push({ slug: m[1]!, id: m[2]!, fullMatch: m[0]! });
  }
  return out;
}

/** Replace a specific widget iframe (matched verbatim against ref.fullMatch)
 *  with a new iframe whose `src` points at the Canvas Files preview URL.
 *  Preserves all other attributes from the original iframe (title, sandbox,
 *  width, height, etc.) via a string replace on just the src attribute value. */
export function substituteWidgetIframeSrc(html: string, ref: WidgetRef, canvasFilesUrl: string): string {
  const updated = ref.fullMatch.replace(
    /\bsrc="[a-z0-9-]+\/widgets\/[a-z0-9-]+\.html"/i,
    `src="${canvasFilesUrl}"`,
  );
  return html.replace(ref.fullMatch, updated);
}

export interface WidgetFiles {
  htmlPath: string;
  specPath: string;
}

/** Resolve the local file paths for a widget reference, relative to a course
 *  folder. Convention: widget source lives at `<courseDir>/<slug>/widgets/<id>.{html,spec.json}`
 *  per Plan A's authoring spec.
 *
 *  This is intentionally simple — no week-segment awareness. If your course
 *  uses week-segmented folders (`<courseDir>/week-01/<slug>/widgets/`), you
 *  can either (a) pass a `courseDir` that already includes the week segment
 *  per page being published, or (b) extend in a follow-up task. */
export function resolveWidgetFiles(courseDir: string, ref: WidgetRef): WidgetFiles {
  const widgetsDir = join(courseDir, ref.slug, 'widgets');
  return {
    htmlPath: join(widgetsDir, `${ref.id}.html`),
    specPath: join(widgetsDir, `${ref.id}.spec.json`),
  };
}

/** Load an InteractiveSpec from a spec.json path. Throws if missing or malformed. */
export function loadWidgetSpec(specPath: string): InteractiveSpec {
  if (!existsSync(specPath)) {
    throw new Error(`widget spec not found at ${specPath}`);
  }
  const raw = readFileSync(specPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`widget spec at ${specPath} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  // Trust the on-disk shape — the renderer's contentSchema will catch
  // problems at render time. Here we just check the required top-level fields.
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`widget spec at ${specPath} is not an object`);
  }
  const s = parsed as Record<string, unknown>;
  for (const field of ['id', 'name', 'kind', 'dimensions', 'accessibility']) {
    if (!(field in s)) {
      throw new Error(`widget spec at ${specPath} missing required field: ${field}`);
    }
  }
  return parsed as InteractiveSpec;
}
