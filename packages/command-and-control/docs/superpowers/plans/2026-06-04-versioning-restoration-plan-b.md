# Versioning & Restoration — Plan B (Widget content lifecycle)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two known v1.x gaps left over from widget renderer #88 Plan B: (1) widget preview status granularity (`'ready' / 'missing-*'` → `'new' / 'changed' / 'unchanged'` based on real content comparison) and (2) widget rollback restores prior content instead of only deleting the publish-time files. Lays the widget-side data the wider V&R system depends on (`widgets-meta.json` and the captured `prior/widgets/` content).

**Architecture:** A new `CanvasApiClient.getFileContent(fileId)` method fetches widget HTML from Canvas Files. A tiny `hash.ts` wrapper around Node's `crypto` gives us SHA-256. Two new JSON sidecars per snapshot — `widgets-meta.json` and `pages-meta.json` — track per-item content hashes and the canvas file_ids tied to each publish. `preview_course_publish` extends to fetch prior widget content from Canvas, save it to `<snapshot>/prior/widgets/`, hash it, and report `'new' / 'changed' / 'unchanged'`. `publish_course` records the resulting `publishedCanvasFileId` back into `widgets-meta.json` so rollback can find every widget file the publish actually created. `rollback_course_publish` reads `<snapshot>/prior/widgets/<slug>__<id>.html`, re-uploads via `publishWidget` (gets a NEW `file_id` per Phase 0), then rewrites the host page's iframe `src` to point at the new file_id and pushes the page back to Canvas — exactly the mechanism the spec specifies.

**Tech Stack:** TypeScript 5, ESM, Vitest. No new dependencies (`crypto`, `fs`, `path` from Node stdlib; existing `CanvasApiClient` for HTTP).

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-04-versioning-restoration-system-design.md` — see "Widget content capture mechanics" + the rollback path in the same section.

**Depends on:** V&R Plan A shipped (`PublishStateMeta`, `state_meta.ts`, `snapshot_location.ts`, `snapshotsRootFor` / `snapshotDirFor` / `createSnapshotDirFor`, `setup_canvas.snapshotsLocation`). Widget renderer #88 Plan B shipped (`publishWidget`, `widget_discovery` module, `WidgetPreviewStatus` interface, `WidgetPublishResult` interface).

**Ships when complete:**
- `preview_course_publish` returns widget statuses using the upgraded enum: `'new' / 'unchanged' / 'changed' / 'missing-html' / 'missing-spec'`.
- Every snapshot's `prior/widgets/<slug>__<id>.html` contains the actual Canvas-side widget HTML that was live at preview time.
- Every snapshot's `widgets-meta.json` records `{ priorCanvasFileId, priorContentHash, newContentHash, publishedCanvasFileId? }` per widget.
- Every snapshot's `pages-meta.json` records `{ priorCanvasPageSlug, priorContentHash, newContentHash }` per page (foundation; consumed by the V&R drift detector in a later plan).
- `rollback_course_publish` re-uploads each widget's prior content and rewrites the host page's iframe src — meaning a publish→rollback cycle leaves Canvas's visible state where it started, not just "publish-time files deleted."
- End-to-end test exercises preview → publish → rollback on a real-shaped widget and asserts content equality at each phase.

---

## File structure

**New files:**

```
packages/canvas-design-studio/tests/canvas-api-get-file-content.test.ts ← NEW

packages/command-and-control/src/tools/publish/hash.ts                  ← NEW
packages/command-and-control/src/tools/publish/widgets_meta.ts          ← NEW
packages/command-and-control/src/tools/publish/pages_meta.ts            ← NEW
packages/command-and-control/src/tools/publish/widget_iframe_rewrite.ts ← NEW (rollback-time iframe src swap)
packages/command-and-control/tests/publish/hash.test.ts
packages/command-and-control/tests/publish/widgets_meta.test.ts
packages/command-and-control/tests/publish/pages_meta.test.ts
packages/command-and-control/tests/publish/widget_iframe_rewrite.test.ts
packages/command-and-control/tests/workflows/preview_course_publish-widget-capture.test.ts
packages/command-and-control/tests/workflows/publish_course-widgets-meta.test.ts
packages/command-and-control/tests/workflows/rollback_course_publish-widget-restore.test.ts
packages/command-and-control/tests/workflows/widget-content-roundtrip.test.ts ← end-to-end
```

**Modified files:**

```
packages/canvas-design-studio/src/canvas-api.ts                           ← getFileContent(fileId)
packages/command-and-control/src/tools/publish/manifest_types.ts          ← extend WidgetPreviewStatus.status enum + add WidgetsMeta / PagesMeta types
packages/command-and-control/src/tools/publish/snapshot_store.ts          ← createSnapshotDirFor also mkdirs prior/widgets, new/widgets, diffs/widgets
packages/command-and-control/src/tools/workflows/preview_course_publish.ts ← fetch prior widget content, hash, set new/changed/unchanged
packages/command-and-control/src/tools/workflows/publish_course.ts         ← record publishedCanvasFileId in widgets-meta
packages/command-and-control/src/tools/workflows/rollback_course_publish.ts ← restore widget content + rewrite host page iframe src
```

---

## Phase B1 — Foundational types + helpers

### Task B1.1: `CanvasApiClient.getFileContent(fileId)` in canvas-design-studio

**Files:**
- Modify: `packages/canvas-design-studio/src/canvas-api.ts`
- Create: `packages/canvas-design-studio/tests/canvas-api-get-file-content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/canvas-api-get-file-content.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { CanvasApiClient } from '../src/canvas-api.js';
import type { InstitutionConfig } from '../src/types.js';

const cfg: InstitutionConfig = {
  institution: '',
  colors: { primary: '', primaryDark: '', primaryLight: '', secondary: '' },
  canvasUrl: 'https://canvas.example',
  apiToken: 'tk',
};

afterEach(() => vi.unstubAllGlobals());

describe('CanvasApiClient.getFileContent', () => {
  it('fetches metadata then downloads the file body as UTF-8', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 12345,
        url: 'https://canvas.example/files/12345/download?download_frd=1&verifier=abc',
        'content-type': 'text/html',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('<p>widget body</p>', {
        status: 200, headers: { 'content-type': 'text/html; charset=utf-8' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const api = new CanvasApiClient(cfg);
    const body = await api.getFileContent(12345);
    expect(body).toBe('<p>widget body</p>');

    // Verifies two-step flow: metadata then download via the `url` field.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/files/12345');
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/files/12345/download');
  });

  it('throws CanvasApiError when metadata fetch fails (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    const api = new CanvasApiClient(cfg);
    await expect(api.getFileContent(99)).rejects.toMatchObject({ status: 404, code: 'CANVAS_NOT_FOUND' });
  });

  it('throws when the download URL returns non-2xx', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 1, url: 'https://canvas.example/files/1/download?verifier=x',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = new CanvasApiClient(cfg);
    await expect(api.getFileContent(1)).rejects.toThrow(/403|forbidden/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- canvas-api-get-file-content`
Expected: FAIL with "getFileContent is not a function" (or similar).

- [ ] **Step 3: Add `getFileContent` to `CanvasApiClient`**

In `packages/canvas-design-studio/src/canvas-api.ts`, add after `getPageBody`:

```ts
/** Fetch a Canvas Files file's contents as a UTF-8 string. Two-step flow:
 *  GET /api/v1/files/<fileId> returns a metadata payload that includes a
 *  short-lived signed `url`; we then GET that url for the actual bytes.
 *
 *  Used by V&R preview to capture prior widget content for rollback, and by
 *  rollback to materialize that content for re-upload. Widget bodies are
 *  always HTML in practice; non-text files would still decode but downstream
 *  hashing/diffing isn't meaningful for them. */
async getFileContent(fileId: number): Promise<string> {
  const meta = await this.request<{ url?: string }>('GET', `files/${fileId}`);
  if (!meta.url) {
    throw new CanvasApiError(500, 'CANVAS_FILE_NO_URL', `Canvas file ${fileId} metadata had no download URL.`);
  }
  let res: Response;
  try {
    // Note: do NOT send the Bearer token to the signed download URL — it's a
    // pre-signed S3-style URL that uses its own verifier query param.
    res = await fetch(meta.url);
  } catch (err) {
    throw new CanvasApiError(0, 'CANVAS_NETWORK_ERROR', `Could not download Canvas file ${fileId}.`, err);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new CanvasApiError(res.status, 'CANVAS_HTTP_ERROR',
      `Canvas file ${fileId} download returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return await res.text();
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/canvas-design-studio -- canvas-api-get-file-content`
Expected: 3 tests pass.

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/canvas-api.ts packages/canvas-design-studio/tests/canvas-api-get-file-content.test.ts
git commit -m "feat(cds): CanvasApiClient.getFileContent for V&R widget capture

Two-step flow: GET /api/v1/files/<id> for metadata (carries the signed download
url), then GET that url for the raw bytes. The signed url already carries its
own verifier param so we don't forward the bearer token (which would actually
fail with some Canvas instances).

Foundation for the V&R Plan B widget capture path — at preview time we'll fetch
the prior widget HTML so rollback can re-upload it; at rollback time we'll
verify content. 3 tests cover happy path, metadata 404, and download non-2xx."
```

### Task B1.2: SHA-256 hash helper

**Files:**
- Create: `packages/command-and-control/src/tools/publish/hash.ts`
- Create: `packages/command-and-control/tests/publish/hash.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/publish/hash.test.ts
import { describe, expect, it } from 'vitest';
import { sha256 } from '../../src/tools/publish/hash.js';

describe('sha256', () => {
  it('returns the canonical sha256 hex digest for a known string', () => {
    // echo -n "" | sha256sum
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // echo -n "abc" | sha256sum
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is deterministic across calls', () => {
    const input = '<p>widget body</p>';
    expect(sha256(input)).toBe(sha256(input));
  });

  it('differs when content differs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- publish/hash`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/command-and-control/src/tools/publish/hash.ts

import { createHash } from 'node:crypto';

/** SHA-256 hex digest of a UTF-8 string. Used throughout V&R for content-hash
 *  comparisons (prior vs new widget HTML, prior vs new page HTML). SHA-256
 *  picked over the cheaper MD5/SHA-1 per spec Decisions log — collision risk
 *  for educational content is irrelevant in practice, but using a modern hash
 *  avoids ever having to revisit it. */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/hash`
Expected: 3 tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/hash.ts packages/command-and-control/tests/publish/hash.test.ts
git commit -m "feat(cc): sha256 helper for V&R content hashing

Tiny wrapper around Node's built-in crypto.createHash. Returns hex digest
for a UTF-8 string. Used by widgets-meta + pages-meta to compare prior vs
new content and drive the 'new/changed/unchanged' status enum.

3 tests: known-vector check (empty string + 'abc'), determinism, sensitivity."
```

### Task B1.3: `WidgetPreviewStatus.status` enum extension + new type interfaces

**Files:**
- Modify: `packages/command-and-control/src/tools/publish/manifest_types.ts`

- [ ] **Step 1: Extend `WidgetPreviewStatus.status` enum**

Find the existing `WidgetPreviewStatus` interface and update:

```ts
export interface WidgetPreviewStatus {
  id: string;
  slug: string;
  htmlPath: string;
  specPath: string;
  /** V&R Plan B enum:
   *  - 'new'           — page is new OR no prior widget iframe found referencing this id.
   *  - 'unchanged'     — prior content hash matches new content hash; nothing to publish.
   *  - 'changed'       — prior content hash differs from new; will publish + rewrite iframe src.
   *  - 'missing-html'  — local widget HTML file absent (publish will record failed widget).
   *  - 'missing-spec'  — local widget spec.json absent.
   *  The first three values replace #88 Plan B's single 'ready' value. */
  status: 'new' | 'unchanged' | 'changed' | 'missing-html' | 'missing-spec';
}
```

- [ ] **Step 2: Add `WidgetsMeta` and `PagesMeta` interfaces at the bottom of the file**

```ts
/** Per-snapshot widget tracking. Lives at <snapshot>/widgets-meta.json. Records
 *  enough metadata that rollback can find prior content, re-upload it, and
 *  rewrite the host page's iframe src.
 *
 *  Key format: `<slug>__<id>` (double underscore so single-hyphen slugs and ids
 *  don't collide — both are common in catalog kind names like 'data-types'). */
export interface WidgetsMeta {
  widgets: Record<string, WidgetMetaEntry>;
}

export interface WidgetMetaEntry {
  /** Canvas Files file_id of the widget HTML that was live at preview time.
   *  Null when the widget reference didn't exist in the prior Canvas page HTML. */
  priorCanvasFileId: number | null;
  /** SHA-256 of the prior widget HTML content. Null when no prior file. */
  priorContentHash: string | null;
  /** SHA-256 of the local widget HTML the publish is about to upload. */
  newContentHash: string;
  /** Set after publish_course succeeds — Canvas Files file_id assigned at upload.
   *  Distinct from priorCanvasFileId because Phase 0 finding: overwrite changes
   *  the id. Rollback uses this to know which file the publish created. */
  publishedCanvasFileId?: number;
  /** Canvas breadcrumb metadata — reserved for the V&R breadcrumb plan; unused here. */
  canvasBreadcrumb?: { folderId: number; filePath: string; breadcrumbFileId: number };
}

/** Per-snapshot page tracking. Lives at <snapshot>/pages-meta.json. Drift
 *  detection (a later V&R plan) compares priorContentHash against a fresh
 *  fetch at rollback time to surface "page changed in Canvas since preview". */
export interface PagesMeta {
  pages: Record<string, PageMetaEntry>;
}

export interface PageMetaEntry {
  /** Canvas page slug that was live at preview time. Null when the page is new. */
  priorCanvasPageSlug: string | null;
  /** SHA-256 of the prior page HTML at preview time. Null when no prior. */
  priorContentHash: string | null;
  /** SHA-256 of the new page HTML the publish is about to push. */
  newContentHash: string;
  publishedAt?: string;
  /** Reserved for breadcrumb plan. */
  canvasBreadcrumb?: { archivedPageSlug: string; archivedPageId: string };
}
```

- [ ] **Step 3: Build to confirm types**

Run: `npm run build --workspace=packages/command-and-control`
Expected: builds clean. (Existing consumers of `WidgetPreviewStatus.status === 'ready'` will be updated in Task B2.1; for now type-check still passes because `'ready'` was the only value previously emitted by `buildWidgetStatuses` — no narrow type checks on it elsewhere.)

If anything else in the tree narrows on `'ready'`, Step 3 will catch it:

```bash
npm run build --workspace=packages/command-and-control 2>&1 | grep -i "ready" || true
```

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/tools/publish/manifest_types.ts
git commit -m "feat(cc): WidgetPreviewStatus enum upgrade + WidgetsMeta/PagesMeta types

WidgetPreviewStatus.status: extend with 'new' / 'unchanged' / 'changed'
(replacing the single 'ready' value from #88 Plan B). 'missing-html' /
'missing-spec' preserved unchanged.

Adds WidgetsMeta interface (widgets-meta.json schema) with prior + published
canvas file ids and content hashes per widget. Adds PagesMeta interface
(pages-meta.json schema) with prior + new page content hashes per page.

Types-only — implementations land in Phase B2/B3."
```

### Task B1.4: `widgets_meta.ts` read/write/update module

**Files:**
- Create: `packages/command-and-control/src/tools/publish/widgets_meta.ts`
- Create: `packages/command-and-control/tests/publish/widgets_meta.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/publish/widgets_meta.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readWidgetsMeta,
  writeWidgetsMeta,
  updateWidgetMetaEntry,
  widgetMetaKey,
  emptyWidgetsMeta,
} from '../../src/tools/publish/widgets_meta.js';

let snapshotDir: string;

beforeEach(() => { snapshotDir = mkdtempSync(join(tmpdir(), 'widgets-meta-')); });
afterEach(() => rmSync(snapshotDir, { recursive: true, force: true }));

describe('widgetMetaKey', () => {
  it('joins slug and id with double underscore', () => {
    expect(widgetMetaKey('assignment', 'data-types-categorize')).toBe('assignment__data-types-categorize');
  });
});

describe('readWidgetsMeta', () => {
  it('returns empty meta when file does not exist', () => {
    expect(readWidgetsMeta(snapshotDir)).toEqual({ widgets: {} });
  });

  it('reads existing meta file', () => {
    writeWidgetsMeta(snapshotDir, {
      widgets: {
        'wk3__sortable': {
          priorCanvasFileId: 100, priorContentHash: 'abc', newContentHash: 'def',
        },
      },
    });
    expect(readWidgetsMeta(snapshotDir).widgets['wk3__sortable']!.priorCanvasFileId).toBe(100);
  });

  it('returns empty meta on malformed JSON (does not throw)', () => {
    writeWidgetsMeta(snapshotDir, { widgets: {} });
    // Then corrupt it
    require('node:fs').writeFileSync(join(snapshotDir, 'widgets-meta.json'), '{not json');
    expect(readWidgetsMeta(snapshotDir)).toEqual({ widgets: {} });
  });
});

describe('writeWidgetsMeta', () => {
  it('writes pretty-printed JSON', () => {
    writeWidgetsMeta(snapshotDir, emptyWidgetsMeta());
    const raw = readFileSync(join(snapshotDir, 'widgets-meta.json'), 'utf-8');
    expect(raw).toContain('\n');
  });
});

describe('updateWidgetMetaEntry', () => {
  it('creates the file with one entry when none exists', () => {
    updateWidgetMetaEntry(snapshotDir, 'wk3__sortable', {
      priorCanvasFileId: null, priorContentHash: null, newContentHash: 'newhash',
    });
    const meta = readWidgetsMeta(snapshotDir);
    expect(meta.widgets['wk3__sortable']).toEqual({
      priorCanvasFileId: null, priorContentHash: null, newContentHash: 'newhash',
    });
  });

  it('merges patches into an existing entry (publish records publishedCanvasFileId)', () => {
    updateWidgetMetaEntry(snapshotDir, 'wk3__sortable', {
      priorCanvasFileId: 100, priorContentHash: 'old', newContentHash: 'new',
    });
    updateWidgetMetaEntry(snapshotDir, 'wk3__sortable', { publishedCanvasFileId: 200 });
    const meta = readWidgetsMeta(snapshotDir);
    expect(meta.widgets['wk3__sortable']).toEqual({
      priorCanvasFileId: 100, priorContentHash: 'old', newContentHash: 'new', publishedCanvasFileId: 200,
    });
  });

  it('leaves other entries untouched when updating one', () => {
    updateWidgetMetaEntry(snapshotDir, 'a__x', { priorCanvasFileId: 1, priorContentHash: null, newContentHash: 'x' });
    updateWidgetMetaEntry(snapshotDir, 'b__y', { priorCanvasFileId: 2, priorContentHash: null, newContentHash: 'y' });
    const meta = readWidgetsMeta(snapshotDir);
    expect(meta.widgets['a__x']!.priorCanvasFileId).toBe(1);
    expect(meta.widgets['b__y']!.priorCanvasFileId).toBe(2);
  });
});

describe('emptyWidgetsMeta', () => {
  it('returns a frozen-shape empty meta', () => {
    expect(emptyWidgetsMeta()).toEqual({ widgets: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- publish/widgets_meta`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/command-and-control/src/tools/publish/widgets_meta.ts

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
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/widgets_meta`
Expected: 8 tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/widgets_meta.ts packages/command-and-control/tests/publish/widgets_meta.test.ts
git commit -m "feat(cc): widgets_meta module — per-snapshot widget tracking sidecar

read/write/update/empty helpers for <snapshot>/widgets-meta.json. Key format
'<slug>__<id>' (double-underscore separator because both can contain hyphens).

Merge-patch semantics on updateWidgetMetaEntry — preview writes the full
{priorCanvasFileId, priorContentHash, newContentHash}; publish patches only
{publishedCanvasFileId}. Malformed file returns empty meta (same fail-soft
behavior as state_meta).

8 tests cover read/write/update/key composition/malformed-file recovery."
```

### Task B1.5: `pages_meta.ts` read/write/update module

**Files:**
- Create: `packages/command-and-control/src/tools/publish/pages_meta.ts`
- Create: `packages/command-and-control/tests/publish/pages_meta.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/publish/pages_meta.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readPagesMeta,
  writePagesMeta,
  updatePageMetaEntry,
  emptyPagesMeta,
} from '../../src/tools/publish/pages_meta.js';

let snapshotDir: string;

beforeEach(() => { snapshotDir = mkdtempSync(join(tmpdir(), 'pages-meta-')); });
afterEach(() => rmSync(snapshotDir, { recursive: true, force: true }));

describe('readPagesMeta', () => {
  it('returns empty meta when no file exists', () => {
    expect(readPagesMeta(snapshotDir)).toEqual({ pages: {} });
  });

  it('reads existing meta', () => {
    writePagesMeta(snapshotDir, {
      pages: {
        'wk3-overview.html': {
          priorCanvasPageSlug: 'wk3-overview', priorContentHash: 'abc', newContentHash: 'def',
        },
      },
    });
    const m = readPagesMeta(snapshotDir);
    expect(m.pages['wk3-overview.html']!.priorContentHash).toBe('abc');
  });

  it('returns empty meta on malformed file', () => {
    writeFileSync(join(snapshotDir, 'pages-meta.json'), '{not json');
    expect(readPagesMeta(snapshotDir)).toEqual({ pages: {} });
  });
});

describe('updatePageMetaEntry', () => {
  it('creates a new entry', () => {
    updatePageMetaEntry(snapshotDir, 'overview.html', {
      priorCanvasPageSlug: 'overview', priorContentHash: null, newContentHash: 'n1',
    });
    expect(readPagesMeta(snapshotDir).pages['overview.html']!.newContentHash).toBe('n1');
  });

  it('merges into existing entry', () => {
    updatePageMetaEntry(snapshotDir, 'overview.html', {
      priorCanvasPageSlug: 'overview', priorContentHash: null, newContentHash: 'n1',
    });
    updatePageMetaEntry(snapshotDir, 'overview.html', { publishedAt: '2026-06-04T00:00:00.000Z' });
    const e = readPagesMeta(snapshotDir).pages['overview.html']!;
    expect(e.priorCanvasPageSlug).toBe('overview');
    expect(e.publishedAt).toBe('2026-06-04T00:00:00.000Z');
  });
});

describe('emptyPagesMeta', () => {
  it('returns empty pages map', () => {
    expect(emptyPagesMeta()).toEqual({ pages: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- publish/pages_meta`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/command-and-control/src/tools/publish/pages_meta.ts

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
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/pages_meta`
Expected: 6 tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/pages_meta.ts packages/command-and-control/tests/publish/pages_meta.test.ts
git commit -m "feat(cc): pages_meta module — per-snapshot page tracking sidecar

Mirror of widgets_meta but for pages. Stores priorCanvasPageSlug, prior +
new content hashes per page. Foundation for the V&R drift detector (which
will compare priorContentHash against a fresh fetch at rollback time).

Today preview writes; nothing reads for behavior yet. Same fail-soft read
semantics on malformed JSON.

6 tests cover read/write/update/empty + malformed-file recovery."
```

### Task B1.6: Extend `createSnapshotDirFor` to create widget sub-dirs

**Files:**
- Modify: `packages/command-and-control/src/tools/publish/snapshot_store.ts`

- [ ] **Step 1: Add the three new sub-dirs to `createSnapshotDirFor`**

Find `createSnapshotDirFor` (added in V&R Plan A Task A3.2). It currently `mkdirSync`s `prior`, `new`, `diffs`. Add three more:

```ts
export function createSnapshotDirFor(snapshotId: string, courseDir: string): string {
  const dir = join(snapshotsRootFor(courseDir), snapshotId);
  mkdirSync(join(dir, 'prior'), { recursive: true });
  mkdirSync(join(dir, 'new'), { recursive: true });
  mkdirSync(join(dir, 'diffs'), { recursive: true });
  // V&R Plan B: widget content lifecycle sub-dirs.
  mkdirSync(join(dir, 'prior', 'widgets'), { recursive: true });
  mkdirSync(join(dir, 'new', 'widgets'), { recursive: true });
  mkdirSync(join(dir, 'diffs', 'widgets'), { recursive: true });
  return dir;
}
```

Also extend the legacy `createSnapshotDir(snapshotId)` (the deprecated global-only one) so existing callers that haven't migrated still get the widget sub-dirs:

```ts
export function createSnapshotDir(snapshotId: string): string {
  const dir = join(snapshotsRootLegacy(), snapshotId);
  mkdirSync(join(dir, 'prior'), { recursive: true });
  mkdirSync(join(dir, 'new'), { recursive: true });
  mkdirSync(join(dir, 'diffs'), { recursive: true });
  mkdirSync(join(dir, 'prior', 'widgets'), { recursive: true });
  mkdirSync(join(dir, 'new', 'widgets'), { recursive: true });
  mkdirSync(join(dir, 'diffs', 'widgets'), { recursive: true });
  return dir;
}
```

- [ ] **Step 2: Add a small targeted test**

Append to `packages/command-and-control/tests/publish/snapshot_location.test.ts` (added in V&R Plan A) OR create a focused test:

```ts
// packages/command-and-control/tests/publish/snapshot_store-widget-dirs.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSnapshotDirFor } from '../../src/tools/publish/snapshot_store.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
});

describe('createSnapshotDirFor widget sub-dirs', () => {
  it('creates prior/widgets, new/widgets, diffs/widgets alongside the page dirs', () => {
    const dir = createSnapshotDirFor('snap-1', courseDir);
    expect(existsSync(join(dir, 'prior', 'widgets'))).toBe(true);
    expect(existsSync(join(dir, 'new', 'widgets'))).toBe(true);
    expect(existsSync(join(dir, 'diffs', 'widgets'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/snapshot_store-widget-dirs`
Expected: 1 test passes.

Run: `npm test --workspace=packages/command-and-control`
Expected: full suite passes (Plan A's existing snapshot_location tests still green).

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/tools/publish/snapshot_store.ts packages/command-and-control/tests/publish/snapshot_store-widget-dirs.test.ts
git commit -m "feat(cc): snapshot dirs include prior/widgets, new/widgets, diffs/widgets

V&R Plan B captures per-widget HTML at preview (prior side) and during
generate (new side), with diffs alongside. createSnapshotDirFor mkdirs all
three widget sub-dirs eagerly so preview can writeFileSync without first
checking existsSync.

Legacy createSnapshotDir (global-only) gets the same treatment so any
caller that hasn't migrated to the courseDir-aware variant still works."
```

---

## Phase B2 — Preview-time widget capture

### Task B2.1: Helper to scan prior page HTML for matching widget iframe refs by file_id

**Files:**
- Modify: `packages/command-and-control/src/tools/publish/widget_discovery.ts`

The existing `discoverWidgetRefs` only matches the local relative iframe pattern (`<slug>/widgets/<id>.html`). At preview time we ALSO need to scan the PRIOR Canvas page HTML, which contains absolute iframe srcs pointing at Canvas Files preview URLs. We need a second discovery function for that flavor — it extracts the Canvas Files file_id from each iframe.

- [ ] **Step 1: Add `discoverPriorWidgetRefs` + test**

Add a new test file: `packages/command-and-control/tests/publish/widget_discovery-prior.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { discoverPriorWidgetRefs } from '../../src/tools/publish/widget_discovery.js';

describe('discoverPriorWidgetRefs', () => {
  it('extracts file_id from Canvas Files preview iframe', () => {
    const html = `<p>before</p>
<iframe src="/courses/20255/files/12345/preview" title="Sort the SDLC phases" width="100%" height="600"></iframe>
<p>after</p>`;
    const refs = discoverPriorWidgetRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.canvasFileId).toBe(12345);
    expect(refs[0]!.fullMatch).toContain('files/12345/preview');
  });

  it('matches multiple iframes', () => {
    const html = `
<iframe src="/courses/1/files/100/preview"></iframe>
<iframe src="/courses/1/files/200/preview"></iframe>`;
    expect(discoverPriorWidgetRefs(html)).toHaveLength(2);
  });

  it('matches absolute Canvas Files urls too', () => {
    const html = `<iframe src="https://canvas.example/courses/1/files/777/preview" title="X"></iframe>`;
    const refs = discoverPriorWidgetRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.canvasFileId).toBe(777);
  });

  it('returns empty when no iframes match', () => {
    expect(discoverPriorWidgetRefs('<p>no widgets here</p>')).toEqual([]);
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- publish/widget_discovery-prior`
Expected: FAIL ("discoverPriorWidgetRefs is not a function").

- [ ] **Step 2: Add the implementation**

In `widget_discovery.ts`, append:

```ts
export interface PriorWidgetRef {
  /** Canvas Files file_id extracted from the iframe src. */
  canvasFileId: number;
  /** Full iframe tag — used so callers can do precise replacements without
   *  ambiguity when multiple iframes share attributes. */
  fullMatch: string;
}

/** Match iframes that point at a Canvas Files preview URL. Handles both
 *  absolute (`https://canvas.example/courses/N/files/M/preview`) and the
 *  course-relative form Canvas often returns (`/courses/N/files/M/preview`).
 *  Used at preview time to scan the PRIOR Canvas page HTML so we can pull
 *  down each prior widget's content for snapshot capture. */
const PRIOR_WIDGET_IFRAME_RE = /<iframe\b[^>]*\bsrc="(?:https?:\/\/[^"\/]+)?\/courses\/\d+\/files\/(\d+)\/preview(?:[^"]*)?"[^>]*>[\s\S]*?<\/iframe>/gi;

export function discoverPriorWidgetRefs(html: string): PriorWidgetRef[] {
  const out: PriorWidgetRef[] = [];
  for (const m of html.matchAll(PRIOR_WIDGET_IFRAME_RE)) {
    out.push({ canvasFileId: Number(m[1]), fullMatch: m[0]! });
  }
  return out;
}
```

- [ ] **Step 3: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/widget_discovery-prior`
Expected: 4 tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/tools/publish/widget_discovery.ts packages/command-and-control/tests/publish/widget_discovery-prior.test.ts
git commit -m "feat(cc): discoverPriorWidgetRefs — Canvas Files iframe scanner

Mirror of discoverWidgetRefs but for the absolute Canvas Files preview URL
shape (the iframe src that lives in Canvas-side page HTML at preview time).
Extracts file_id so the V&R preview path can fetch the actual prior widget
content via CanvasApiClient.getFileContent().

Handles both course-relative ('/courses/N/files/M/preview') and absolute
('https://canvas.example/courses/N/files/M/preview') forms. Multi-match
supported. 4 tests."
```

### Task B2.2: Extend `preview_course_publish` to capture prior widget content

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/preview_course_publish.ts`

This is the heart of Plan B. Replace the synchronous `buildWidgetStatuses` with an async per-page capture step that, for each widget reference in the rendered local HTML:

1. Hashes the local (new) widget HTML.
2. Scans the prior Canvas page HTML for a matching iframe via file_id matching against `widgets-meta.json` from the most recent successful publish (PreviewManifest doesn't have that; we identify a "match" by widget ORDER in the page, paired with the local widget id — see Step 1 below).
3. Fetches each matched prior widget file via `getFileContent(fileId)`, writes it to `<snapshot>/prior/widgets/<slug>__<id>.html`, hashes it.
4. Compares hashes, emits `'new' / 'unchanged' / 'changed'`.
5. Writes the new local widget HTML to `<snapshot>/new/widgets/<slug>__<id>.html` and a unified diff to `<snapshot>/diffs/widgets/<slug>__<id>.diff`.
6. Records all of the above in `widgets-meta.json`.

**Crucial design note — how do we pair a local widget id with a Canvas-side file_id?**

The local widget reference (from `discoverWidgetRefs`) gives us `{slug, id}`. The prior Canvas page HTML contains iframe(s) with Canvas Files file_ids — but the file_id is opaque; the Canvas Files filename (`display_name`) is what we'd need to match against the spec id. The pragmatic answer: scan in iframe ORDER. For each local widget reference position N in the new HTML, take the file_id at position N in the prior page HTML's iframe list. This works because (a) `generate_course` emits widgets in a stable order from the markdown source, and (b) the prior page HTML, if it was last published by this toolchain, has them in the same order. If counts mismatch (faculty added/removed widgets), excess prior widgets are ignored and excess new widgets get `status: 'new'`.

A more robust approach (matching by Canvas Files display_name) would require an extra API call per page; defer to a follow-up if positional pairing turns out brittle in practice.

- [ ] **Step 1: Write the failing test for the new behavior**

Create `packages/command-and-control/tests/workflows/preview_course_publish-widget-capture.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCoursePublish } from '../../src/tools/workflows/preview_course_publish.js';
import { snapshotsRootFor } from '../../src/tools/publish/snapshot_store.js';
import { readWidgetsMeta } from '../../src/tools/publish/widgets_meta.js';
import { sha256 } from '../../src/tools/publish/hash.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

/** Build a minimal course tree with one page that references one widget. */
function setupMinimalCourse(opts: { widgetBody: string }): void {
  mkdirSync(join(courseDir, 'course'), { recursive: true });
  mkdirSync(join(courseDir, 'course', 'assignment', 'widgets'), { recursive: true });
  writeFileSync(join(courseDir, 'course', 'config.json'), JSON.stringify({
    name: 'Course', code: 'CRS', semester: 'F26',
  }));
  writeFileSync(join(courseDir, 'course', 'assignment', 'assignment.md'),
    `---\ntitle: Assignment\ntype: assignment\n---\n\n{{ widget:sort-the-phases }}\n`);
  writeFileSync(join(courseDir, 'course', 'assignment', 'widgets', 'sort-the-phases.html'), opts.widgetBody);
  writeFileSync(join(courseDir, 'course', 'assignment', 'widgets', 'sort-the-phases.spec.json'), JSON.stringify({
    id: 'sort-the-phases', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
    contentSchema: {}, initialContent: {},
    dimensions: { minHeight: 300, maxHeight: 500 },
    accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
  }));
}

describe('previewCoursePublish widget content capture', () => {
  it('sets status="new" when no prior page exists', async () => {
    setupMinimalCourse({ widgetBody: '<p>new body</p>' });
    // No Canvas pages match.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', {
      status: 200, headers: { 'content-type': 'application/json' } })));

    const result = await previewCoursePublish({ courseDir: join(courseDir, 'course'), courseId: 20255 });
    expect(result.manifest).toBeDefined();
    const page = result.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('new');
  });

  it('sets status="unchanged" when prior widget content matches new', async () => {
    const body = '<p>same body</p>';
    setupMinimalCourse({ widgetBody: body });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/pages') && !u.match(/\/pages\/[^/]+$/)) {
        // List pages
        return new Response(JSON.stringify([{
          page_id: 1, url: 'assignment', title: 'Assignment', html_url: 'https://canvas.example/courses/20255/pages/assignment', body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/assignments')) {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify({
          page_id: 1, url: 'assignment', title: 'Assignment', html_url: '', body: '<iframe src="/courses/20255/files/12345/preview" title="Sort"></iframe>', published: true, updated_at: '',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/files/12345') && !u.includes('/download')) {
        return new Response(JSON.stringify({
          id: 12345, url: 'https://canvas.example/files/12345/download?verifier=x',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/files/12345/download')) {
        return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await previewCoursePublish({ courseDir: join(courseDir, 'course'), courseId: 20255 });
    const page = result.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('unchanged');

    // Verify widgets-meta.json was written with both hashes.
    const snapshotsRoot = snapshotsRootFor(join(courseDir, 'course'));
    const snapshotDir = join(snapshotsRoot, result.snapshotId!);
    const meta = readWidgetsMeta(snapshotDir);
    const entry = meta.widgets['assignment__sort-the-phases'];
    expect(entry).toBeDefined();
    expect(entry!.priorCanvasFileId).toBe(12345);
    expect(entry!.priorContentHash).toBe(sha256(body));
    expect(entry!.newContentHash).toBe(sha256(body));

    // Verify prior/widgets/<key>.html exists with the fetched body.
    const priorPath = join(snapshotDir, 'prior', 'widgets', 'assignment__sort-the-phases.html');
    expect(existsSync(priorPath)).toBe(true);
    expect(readFileSync(priorPath, 'utf-8')).toBe(body);
  });

  it('sets status="changed" when prior content differs from new', async () => {
    setupMinimalCourse({ widgetBody: '<p>new body</p>' });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/pages') && !u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'assignment', title: 'Assignment', html_url: '', body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/assignments')) {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify({
          page_id: 1, url: 'assignment', title: 'Assignment', html_url: '', body: '<iframe src="/courses/20255/files/12345/preview"></iframe>', published: true, updated_at: '',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/files/12345') && !u.includes('/download')) {
        return new Response(JSON.stringify({ id: 12345, url: 'https://canvas.example/files/12345/download?verifier=x' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/files/12345/download')) {
        return new Response('<p>old body</p>', { status: 200 });
      }
      return new Response('404', { status: 404 });
    }));

    const result = await previewCoursePublish({ courseDir: join(courseDir, 'course'), courseId: 20255 });
    const page = result.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('changed');
  });

  it('falls back to status="new" with a logged warning when getFileContent fails', async () => {
    setupMinimalCourse({ widgetBody: '<p>new</p>' });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/pages') && !u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'assignment', title: 'Assignment', html_url: '', body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/assignments')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      if (u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify({
          page_id: 1, url: 'assignment', title: 'Assignment', html_url: '', body: '<iframe src="/courses/20255/files/12345/preview"></iframe>', published: true, updated_at: '',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      // getFileContent metadata 500
      return new Response('boom', { status: 500 });
    }));

    const result = await previewCoursePublish({ courseDir: join(courseDir, 'course'), courseId: 20255 });
    const page = result.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('new');
    expect(page.warnings.some((w: any) => w.message.includes('WIDGET_FETCH_FAILED') || /fetch.*widget/i.test(w.message))).toBe(true);
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- preview_course_publish-widget-capture`
Expected: FAIL ("status: 'new' / 'unchanged' / etc." not present in output — current code emits `'ready'`).

- [ ] **Step 2: Refactor `buildWidgetStatuses` into an async `captureWidgetContent` function**

In `preview_course_publish.ts`:

1. Add imports:

```ts
import { mkdirSync, copyFileSync } from 'node:fs';
import { discoverWidgetRefs, resolveWidgetFiles, discoverPriorWidgetRefs } from '../publish/widget_discovery.js';
import { sha256 } from '../publish/hash.js';
import { updateWidgetMetaEntry, widgetMetaKey } from '../publish/widgets_meta.js';
import { updatePageMetaEntry } from '../publish/pages_meta.js';
import { createSnapshotDirFor } from '../publish/snapshot_store.js';
```

2. Replace `buildWidgetStatuses` with `captureWidgetContent`:

```ts
/** Per-page widget capture + status determination. Replaces #88 Plan B's
 *  synchronous buildWidgetStatuses with the V&R Plan B content-comparison
 *  flow:
 *
 *  For each widget reference in the locally-rendered HTML (paired positionally
 *  with iframes in the prior Canvas page HTML):
 *    1. Hash the local widget HTML → newContentHash.
 *    2. Save the local HTML to <snapshot>/new/widgets/<slug>__<id>.html.
 *    3. If a paired prior iframe exists: fetch its file via getFileContent,
 *       save to <snapshot>/prior/widgets/, hash, set status based on hash
 *       comparison.
 *    4. Otherwise status = 'new'.
 *    5. Save unified diff to <snapshot>/diffs/widgets/.
 *    6. Update widgets-meta.json with priorCanvasFileId / priorContentHash /
 *       newContentHash.
 *    7. Local HTML missing → status 'missing-html' (unchanged from #88).
 *    8. Local spec.json missing → status 'missing-spec'.
 *
 *  Returns the array of statuses (mutates snapshot dir + widgets-meta.json
 *  as a side effect). */
async function captureWidgetContent(
  newPageHtml: string,
  priorPageHtml: string,
  courseDir: string,
  snapshotDir: string,
  api: CanvasApiClient,
  warnings: { kind: string; severity: 'block' | 'warn'; message: string }[],
): Promise<WidgetPreviewStatus[]> {
  const localRefs = discoverWidgetRefs(newPageHtml);
  const priorRefs = discoverPriorWidgetRefs(priorPageHtml);
  const out: WidgetPreviewStatus[] = [];

  for (let i = 0; i < localRefs.length; i++) {
    const ref = localRefs[i]!;
    const files = resolveWidgetFiles(courseDir, ref);
    const key = widgetMetaKey(ref.slug, ref.id);

    if (!existsSync(files.htmlPath)) {
      out.push({ id: ref.id, slug: ref.slug, htmlPath: files.htmlPath, specPath: files.specPath, status: 'missing-html' });
      continue;
    }
    if (!existsSync(files.specPath)) {
      out.push({ id: ref.id, slug: ref.slug, htmlPath: files.htmlPath, specPath: files.specPath, status: 'missing-spec' });
      continue;
    }

    const localHtml = readFileSync(files.htmlPath, 'utf-8');
    const newContentHash = sha256(localHtml);

    // Save the new widget HTML for snapshot.
    const newWidgetPath = join(snapshotDir, 'new', 'widgets', `${key}.html`);
    writeFileSync(newWidgetPath, localHtml, 'utf-8');

    // Pair positionally with prior iframe at the same index.
    const priorRef = priorRefs[i];
    let priorContentHash: string | null = null;
    let priorCanvasFileId: number | null = null;
    let status: WidgetPreviewStatus['status'] = 'new';

    if (priorRef) {
      try {
        const priorHtml = await api.getFileContent(priorRef.canvasFileId);
        priorContentHash = sha256(priorHtml);
        priorCanvasFileId = priorRef.canvasFileId;
        // Save prior widget HTML to snapshot.
        writeFileSync(join(snapshotDir, 'prior', 'widgets', `${key}.html`), priorHtml, 'utf-8');
        // Compute unified diff (use the same computeUnifiedDiff helper used for pages).
        writeFileSync(
          join(snapshotDir, 'diffs', 'widgets', `${key}.diff`),
          computeUnifiedDiff(priorHtml, localHtml),
          'utf-8',
        );
        status = priorContentHash === newContentHash ? 'unchanged' : 'changed';
      } catch (e) {
        // Per spec error-handling table: WIDGET_FETCH_FAILED falls back to 'new'
        // with a warning. Do not block preview.
        warnings.push({
          kind: 'validation',
          severity: 'warn',
          message: `WIDGET_FETCH_FAILED for "${ref.id}" (slug "${ref.slug}", prior file_id ${priorRef.canvasFileId}): ${e instanceof Error ? e.message : String(e)}. Treating as new widget; rollback will not restore prior content for this widget.`,
        });
        status = 'new';
      }
    }

    updateWidgetMetaEntry(snapshotDir, key, {
      priorCanvasFileId,
      priorContentHash,
      newContentHash,
    });

    out.push({ id: ref.id, slug: ref.slug, htmlPath: files.htmlPath, specPath: files.specPath, status });
  }

  return out;
}
```

3. In the main `previewCoursePublish` function, replace the snapshot creation + page loop:

```ts
// Change: createSnapshotDir(snapshotId) → createSnapshotDirFor(snapshotId, input.courseDir)
const dir = createSnapshotDirFor(snapshotId, input.courseDir);
```

Inside the page loop, replace the synchronous `buildWidgetStatuses(p.html, input.courseDir)` call with the async version:

```ts
const widgets = await captureWidgetContent(p.html, priorHtml ?? '', input.courseDir, dir, api, warnings);

// Record page meta (foundation for V&R drift detector — written, not read yet).
updatePageMetaEntry(dir, p.filename, {
  priorCanvasPageSlug: match ? match.p.url : null,
  priorContentHash: priorHtml === null ? null : sha256(priorHtml),
  newContentHash: sha256(p.html),
});
```

The existing "missing widget files" warning loop becomes a NO-OP (the warnings list is now mutated inside `captureWidgetContent`); KEEP it for the `missing-html` / `missing-spec` cases by leaving the `for (const w of widgets) {...}` block in place but guarding only on those two statuses (the function does not push a warning for missing-html/missing-spec itself):

```ts
for (const w of widgets) {
  if (w.status === 'missing-html' || w.status === 'missing-spec') {
    warnings.push({
      kind: 'validation',
      severity: 'warn',
      message: `Widget "${w.id}" (slug "${w.slug}"): ${w.status === 'missing-html' ? 'HTML file' : 'spec.json'} not found at ${w.status === 'missing-html' ? w.htmlPath : w.specPath}. publish_course will skip this widget.`,
    });
  }
}
```

- [ ] **Step 3: Remove the legacy `buildWidgetStatuses` helper**

Delete it — its responsibilities moved into `captureWidgetContent`.

- [ ] **Step 4: Run focused tests**

Run: `npm test --workspace=packages/command-and-control -- preview_course_publish-widget-capture`
Expected: 4 tests pass.

- [ ] **Step 5: Run all existing preview_course_publish tests for regression**

Run: `npm test --workspace=packages/command-and-control -- preview_course_publish`
Expected: existing tests pass. Two callouts:
- Any existing tests that asserted on `status: 'ready'` need to update to one of `'new' / 'changed' / 'unchanged'`. If a test stubs an empty Canvas response (no prior page), `'ready'` becomes `'new'`. If a test stubs the same body in both prior and local, it becomes `'unchanged'`. If different, `'changed'`.
- If a test asserts on the absence of warnings, it should still pass — the new `'new'/'changed'/'unchanged'` statuses don't add warnings.

If tests fail, update them in this same commit:

```bash
# Quickly find tests that need updating
npm test --workspace=packages/command-and-control -- preview_course_publish 2>&1 | grep "Expected"
```

- [ ] **Step 6: Run full C&C suite + build**

Run: `npm test --workspace=packages/command-and-control`
Expected: all pass.

Run: `npm run build`
Expected: all 5 packages build clean.

- [ ] **Step 7: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/preview_course_publish.ts packages/command-and-control/tests/workflows/preview_course_publish-widget-capture.test.ts
git commit -m "feat(cc): preview_course_publish captures prior widget content + 'new/changed/unchanged' status

For each widget reference in a page, pairs positionally with iframes in the
prior Canvas page HTML, fetches each prior widget via getFileContent, saves
to <snapshot>/prior/widgets/<slug>__<id>.html, hashes prior + new, compares,
emits WidgetPreviewStatus.status as 'new' | 'unchanged' | 'changed'.

Also writes <snapshot>/new/widgets/<slug>__<id>.html and a unified diff in
<snapshot>/diffs/widgets/. Records {priorCanvasFileId, priorContentHash,
newContentHash} in widgets-meta.json per widget. Records pages-meta.json
foundation entry per page.

Failure to fetch prior widget content falls back to 'new' with a logged
warning (per spec WIDGET_FETCH_FAILED). Missing-html / missing-spec
behavior preserved unchanged from #88 Plan B.

4 new tests cover new/unchanged/changed/fetch-failed paths."
```

---

## Phase B3 — Publish-time recording

### Task B3.1: `publish_course` records `publishedCanvasFileId` in widgets-meta

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/publish_course.ts`

After the existing `publishWidgetFn(...)` call in the per-widget loop, write the returned file_id into widgets-meta.json so rollback can locate every widget file the publish actually created.

- [ ] **Step 1: Write the failing test**

Create `packages/command-and-control/tests/workflows/publish_course-widgets-meta.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import {
  createSnapshotDirFor, snapshotsRootFor, writeManifest, writePriorHtml, writeNewHtml, writeState,
} from '../../src/tools/publish/snapshot_store.js';
import { writeWidgetsMeta, readWidgetsMeta } from '../../src/tools/publish/widgets_meta.js';
import type { PreviewManifest, PublishState } from '../../src/tools/publish/manifest_types.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('publishCourse widgets-meta recording', () => {
  it('writes publishedCanvasFileId after each publishWidget call', async () => {
    const snapshotId = 'snap-1';
    const dir = createSnapshotDirFor(snapshotId, courseDir);

    // Set up minimal widget on disk.
    mkdirSync(join(courseDir, 'assignment', 'widgets'), { recursive: true });
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.html'), '<p>w</p>');
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), JSON.stringify({
      id: 'sort', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
      dimensions: { minHeight: 200, maxHeight: 400 },
      accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
    }));

    // Seed widgets-meta with a preview-time entry (no publishedCanvasFileId yet).
    writeWidgetsMeta(dir, {
      widgets: {
        'assignment__sort': {
          priorCanvasFileId: null,
          priorContentHash: null,
          newContentHash: 'h',
        },
      },
    });

    const manifest: PreviewManifest = {
      snapshotId, courseId: 20255, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'assignment.html', pageType: 'assignment',
        intendedTitle: 'Assignment', collisionAction: 'update',
        canvasMatch: { pageId: 'assignment', url: '', existingTitle: 'Assignment', similarity: 1 },
        diff: { priorWords: 10, newWords: 20, delta: 10, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
        widgets: [{ id: 'sort', slug: 'assignment', htmlPath: join(courseDir, 'assignment', 'widgets', 'sort.html'), specPath: join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), status: 'changed' }],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'assignment.html', '<p>old</p>');
    writeNewHtml(dir, 'assignment.html', '<iframe src="assignment/widgets/sort.html"></iframe>');
    writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: '2026-06-04T12:00:00.000Z' });

    // Mock Canvas + publishWidget injection
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      page_id: 1, url: 'assignment', title: 'A', html_url: '', body: '', published: true, updated_at: '',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const publishWidgetFn = vi.fn().mockResolvedValue({
      canvasFileId: 9999,
      embedSrc: 'https://canvas.example/courses/20255/files/9999/preview',
      embedHtml: '<iframe src="https://canvas.example/courses/20255/files/9999/preview"></iframe>',
    });

    const result = await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: publishWidgetFn as any },
    );

    expect(result.phase).toBe('published');

    // VERIFY: widgets-meta records publishedCanvasFileId
    const meta = readWidgetsMeta(dir);
    expect(meta.widgets['assignment__sort']!.publishedCanvasFileId).toBe(9999);
  });

  it('does not record publishedCanvasFileId when publishWidget fails', async () => {
    const snapshotId = 'snap-2';
    const dir = createSnapshotDirFor(snapshotId, courseDir);

    mkdirSync(join(courseDir, 'assignment', 'widgets'), { recursive: true });
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.html'), '<p>w</p>');
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), JSON.stringify({
      id: 'sort', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
      dimensions: { minHeight: 200, maxHeight: 400 },
      accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
    }));

    writeWidgetsMeta(dir, {
      widgets: { 'assignment__sort': { priorCanvasFileId: null, priorContentHash: null, newContentHash: 'h' } },
    });

    const manifest: PreviewManifest = {
      snapshotId, courseId: 20255, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'assignment.html', pageType: 'assignment',
        intendedTitle: 'A', collisionAction: 'update',
        canvasMatch: { pageId: 'assignment', url: '', existingTitle: 'A', similarity: 1 },
        diff: { priorWords: 0, newWords: 1, delta: 1, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
        widgets: [{ id: 'sort', slug: 'assignment', htmlPath: join(courseDir, 'assignment', 'widgets', 'sort.html'), specPath: join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), status: 'changed' }],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'assignment.html', '');
    writeNewHtml(dir, 'assignment.html', '<iframe src="assignment/widgets/sort.html"></iframe>');
    writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: '2026-06-04T12:00:00.000Z' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      page_id: 1, url: 'assignment', title: 'A', html_url: '', body: '', published: true, updated_at: '',
    }), { status: 200 })));

    const publishWidgetFn = vi.fn().mockRejectedValue(new Error('Canvas Files boom'));

    await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: publishWidgetFn as any },
    );

    const meta = readWidgetsMeta(dir);
    expect(meta.widgets['assignment__sort']!.publishedCanvasFileId).toBeUndefined();
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- publish_course-widgets-meta`
Expected: FAIL (no publishedCanvasFileId written today).

- [ ] **Step 2: Add the write-back in `publish_course.ts`**

Find the per-widget loop (around line 78-90 of the existing file, where `publishWidgetFn` is awaited). After a successful `publishWidget`, patch `widgets-meta.json`:

Add import:

```ts
import { updateWidgetMetaEntry, widgetMetaKey } from '../publish/widgets_meta.js';
```

In `publishPageWidgets` (or wherever the per-widget loop lives — file currently has it inside the page publish path, near the existing comment about Phase 0 finding), modify the success path:

```ts
const result = await publishWidgetFn({
  htmlPath: files.htmlPath,
  courseId: manifest.courseId,
  canvasConfig: { host: canvasHost, token: cfg.apiToken },
  widgetSpec: spec,
});

// V&R Plan B: record the new canvas file_id in widgets-meta so rollback can
// find the file the publish created (file_id differs from priorCanvasFileId
// per Phase 0 finding — overwrite changes the id).
updateWidgetMetaEntry(snapshotDir, widgetMetaKey(ref.slug, ref.id), {
  publishedCanvasFileId: result.canvasFileId,
});

html = substituteWidgetIframeSrc(html, ref, result.embedSrc);
```

You'll need `snapshotDir` in scope where the loop runs. Trace from `publish_course.ts`'s main function (which already has `dir` from `snapshotDir(input.snapshotId)`); pass it through as a parameter to `publishPageWidgets`. The signature becomes:

```ts
async function publishPageWidgets(
  pageHtml: string,
  courseDir: string,
  manifest: PreviewManifest,
  cfg: { canvasUrl: string; apiToken: string },
  canvasHost: string,
  publishWidgetFn: typeof publishWidgetReal,
  snapshotDir: string,                                  // NEW
  ref: WidgetRef,                                       // (if currently a single-ref helper; otherwise loop inside)
): Promise<{ html: string; widgets: WidgetPublishResult[] }> { ... }
```

Pass `dir` (the snapshot dir already in main scope) into the call site.

- [ ] **Step 3: Run focused tests**

Run: `npm test --workspace=packages/command-and-control -- publish_course-widgets-meta`
Expected: 2 tests pass.

- [ ] **Step 4: Run existing publish_course tests for regression**

Run: `npm test --workspace=packages/command-and-control -- publish_course`
Expected: existing tests still pass (the new write is silent unless inspected).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: all 5 packages build clean.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/publish_course.ts packages/command-and-control/tests/workflows/publish_course-widgets-meta.test.ts
git commit -m "feat(cc): publish_course records publishedCanvasFileId in widgets-meta

After publishWidget returns successfully, patch widgets-meta.json with the
new Canvas Files file_id. Rollback uses this to know which file the publish
created (which is distinct from priorCanvasFileId — overwrite changes the
id per Phase 0).

Failed publishWidget calls leave publishedCanvasFileId unset (rollback then
treats the widget as 'never uploaded' → skip).

2 tests: success records id, failure does not."
```

---

## Phase B4 — Rollback widget restore

### Task B4.1: Iframe src substitution helper for rollback

**Files:**
- Create: `packages/command-and-control/src/tools/publish/widget_iframe_rewrite.ts`
- Create: `packages/command-and-control/tests/publish/widget_iframe_rewrite.test.ts`

Rollback needs to rewrite each iframe in the host page HTML, swapping the publish-time `file_id` with the just-restored `file_id`. The existing `substituteWidgetIframeSrc` handles the local-relative → Canvas-Files direction only; this helper handles Canvas-Files-old → Canvas-Files-new.

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/publish/widget_iframe_rewrite.test.ts
import { describe, expect, it } from 'vitest';
import { rewriteIframeFileId } from '../../src/tools/publish/widget_iframe_rewrite.js';

describe('rewriteIframeFileId', () => {
  it('swaps the file_id in a course-relative iframe src', () => {
    const html = '<p>x</p><iframe src="/courses/20255/files/100/preview" title="W"></iframe>';
    const out = rewriteIframeFileId(html, 100, 200);
    expect(out).toContain('/files/200/preview');
    expect(out).not.toContain('/files/100/preview');
  });

  it('swaps the file_id in an absolute Canvas Files url', () => {
    const html = '<iframe src="https://canvas.example/courses/1/files/100/preview"></iframe>';
    const out = rewriteIframeFileId(html, 100, 999);
    expect(out).toContain('files/999/preview');
  });

  it('only rewrites iframes pointing at the specified oldFileId — leaves others alone', () => {
    const html = '<iframe src="/courses/1/files/100/preview"></iframe><iframe src="/courses/1/files/200/preview"></iframe>';
    const out = rewriteIframeFileId(html, 100, 555);
    expect(out).toContain('files/555/preview');
    expect(out).toContain('files/200/preview');
    expect(out).not.toContain('files/100/preview');
  });

  it('handles iframe src with verifier query param', () => {
    const html = '<iframe src="/courses/1/files/100/preview?verifier=abc"></iframe>';
    const out = rewriteIframeFileId(html, 100, 200);
    expect(out).toContain('/files/200/preview?verifier=abc');
  });

  it('returns the input unchanged when oldFileId is not present', () => {
    const html = '<iframe src="/courses/1/files/999/preview"></iframe>';
    expect(rewriteIframeFileId(html, 100, 200)).toBe(html);
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- publish/widget_iframe_rewrite`
Expected: FAIL ("Cannot find module").

- [ ] **Step 2: Write the implementation**

```ts
// packages/command-and-control/src/tools/publish/widget_iframe_rewrite.ts

/** Rollback's page-HTML rewrite step.
 *
 *  When rollback restores a widget by re-uploading via publishWidget, it gets
 *  a NEW Canvas Files file_id (Phase 0 finding — overwrite changes the id).
 *  The host page's iframe src therefore needs to be swapped from the
 *  publish-time file_id to the just-restored file_id before pushing the
 *  page back to Canvas.
 *
 *  Implementation: targeted regex over /courses/<N>/files/<oldFileId>/preview
 *  (course-relative or absolute). Leaves iframes pointing at OTHER file_ids
 *  untouched — so a page with multiple widgets can be progressively rewritten
 *  one widget at a time without earlier rewrites being clobbered. */
export function rewriteIframeFileId(html: string, oldFileId: number, newFileId: number): string {
  // Match: optional scheme/host, /courses/<courseId>/files/<oldFileId>/preview, optional query string.
  // Capture group 1 = optional scheme+host
  // Capture group 2 = courses/<id> path
  const re = new RegExp(
    `((?:https?:\\/\\/[^\\/"]+)?)(\\/courses\\/\\d+\\/files\\/)${oldFileId}(\\/preview(?:\\?[^"]*)?)`,
    'g',
  );
  return html.replace(re, (_match, scheme, coursesPath, tail) => `${scheme}${coursesPath}${newFileId}${tail}`);
}
```

- [ ] **Step 3: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/widget_iframe_rewrite`
Expected: 5 tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/tools/publish/widget_iframe_rewrite.ts packages/command-and-control/tests/publish/widget_iframe_rewrite.test.ts
git commit -m "feat(cc): rewriteIframeFileId — rollback-time iframe src swap

When rollback restores a widget via re-upload, the new file_id differs from
the publish-time file_id (Phase 0). This helper rewrites just the matching
iframe srcs in the host page HTML, leaving other widget iframes untouched
(critical when multiple widgets per page restore in sequence).

Handles course-relative ('/courses/N/files/M/preview'), absolute
('https://canvas.example/courses/N/files/M/preview'), and query-strung
('?verifier=abc') variants. 5 tests."
```

### Task B4.2: `rollback_course_publish` restores widget content + rewrites page iframe srcs

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/rollback_course_publish.ts`
- Create: `packages/command-and-control/tests/workflows/rollback_course_publish-widget-restore.test.ts`

This replaces the existing "delete-only" widget cleanup with a real restore-then-rewrite flow.

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/workflows/rollback_course_publish-widget-restore.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollbackCoursePublish } from '../../src/tools/workflows/rollback_course_publish.js';
import {
  createSnapshotDirFor, writeManifest, writePriorHtml, writeNewHtml, writeState, snapshotsRootFor,
} from '../../src/tools/publish/snapshot_store.js';
import { writeWidgetsMeta } from '../../src/tools/publish/widgets_meta.js';
import type { PreviewManifest } from '../../src/tools/publish/manifest_types.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('rollbackCoursePublish widget content restore', () => {
  it('re-uploads prior widget content and rewrites page iframe src to the new file_id', async () => {
    const snapshotId = 'snap-1';
    const dir = createSnapshotDirFor(snapshotId, courseDir);

    // Local widget files (needed so re-upload via publishWidget can read htmlPath)
    mkdirSync(join(courseDir, 'assignment', 'widgets'), { recursive: true });
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), JSON.stringify({
      id: 'sort', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
      dimensions: { minHeight: 200, maxHeight: 400 },
      accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
    }));

    // Prior widget content saved during preview.
    const priorWidgetHtml = '<p>prior widget content</p>';
    writeFileSync(join(dir, 'prior', 'widgets', 'assignment__sort.html'), priorWidgetHtml, 'utf-8');

    // widgets-meta has both prior and published file_ids.
    writeWidgetsMeta(dir, {
      widgets: {
        'assignment__sort': {
          priorCanvasFileId: 100,
          priorContentHash: 'h-prior',
          newContentHash: 'h-new',
          publishedCanvasFileId: 200,
        },
      },
    });

    const manifest: PreviewManifest = {
      snapshotId, courseId: 20255, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'assignment.html', pageType: 'assignment',
        intendedTitle: 'A', collisionAction: 'update',
        canvasMatch: { pageId: 'assignment', url: '', existingTitle: 'A', similarity: 1 },
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
        widgets: [{ id: 'sort', slug: 'assignment', htmlPath: join(courseDir, 'assignment', 'widgets', 'sort.html'), specPath: join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), status: 'changed' }],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'assignment.html', '<iframe src="/courses/20255/files/100/preview"></iframe>');
    writeNewHtml(dir, 'assignment.html', '<iframe src="/courses/20255/files/200/preview"></iframe>');
    writeState(dir, {
      phase: 'published',
      published: [{
        filename: 'assignment.html', type: 'page', canvasUrl: '', canvasPageSlug: 'assignment',
        action: 'updated', publishedAt: '2026-06-04T12:00:00.000Z',
        widgets: [{ id: 'sort', status: 'published', canvasFileId: 200 }],
      }],
      lastUpdatedAt: '2026-06-04T12:00:00.000Z',
    });

    // Track what the rollback pushes to Canvas.
    let restoredPageBody: string | undefined;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      // restorePage flow does GET then PUT on the page.
      if (u.match(/\/pages\/assignment$/) && method === 'GET') {
        return new Response(JSON.stringify({ page_id: 1, url: 'assignment', title: 'A', html_url: '', body: '', published: true, updated_at: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.match(/\/pages\/assignment$/) && method === 'PUT') {
        const parsed = JSON.parse(String((init?.body as any) ?? '{}'));
        restoredPageBody = parsed?.wiki_page?.body;
        return new Response(JSON.stringify({ page_id: 1, url: 'assignment', title: 'A', html_url: '', body: parsed?.wiki_page?.body ?? '', published: true, updated_at: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    // Stub publishWidget — returns a new file_id distinct from both 100 and 200.
    const publishWidgetFn = vi.fn().mockResolvedValue({
      canvasFileId: 333,
      embedSrc: 'https://canvas.example/courses/20255/files/333/preview',
      embedHtml: '<iframe src="https://canvas.example/courses/20255/files/333/preview"></iframe>',
    });

    const result = await rollbackCoursePublish(
      { snapshotId },
      { publishWidget: publishWidgetFn as any },
    );

    expect(result.phase).toBe('rolled-back');

    // Widget restore was attempted with the prior content.
    expect(publishWidgetFn).toHaveBeenCalledTimes(1);
    const call = publishWidgetFn.mock.calls[0]![0];
    // The htmlPath passed to publishWidget should be the snapshot's prior widget file
    expect(call.htmlPath).toBe(join(dir, 'prior', 'widgets', 'assignment__sort.html'));

    // The restored page body should contain the NEW file_id (333), not the publish-time one (200).
    expect(restoredPageBody).toBeDefined();
    expect(restoredPageBody!).toContain('/files/333/preview');
    expect(restoredPageBody!).not.toContain('/files/200/preview');

    // widgetsCleaned shape (renamed conceptually but kept as the carrier):
    // Look for a 'restored' status entry.
    const restored = result.widgetsCleaned.find(w => w.id === 'sort');
    expect(restored).toBeDefined();
    expect(restored!.status).toBe('restored');
    expect(restored!.canvasFileId).toBe(333);
  });

  it('falls back to delete-only behavior when no prior widget content exists', async () => {
    const snapshotId = 'snap-2';
    const dir = createSnapshotDirFor(snapshotId, courseDir);

    // No prior widget content saved (e.g., widget was status:'new' at preview).
    writeWidgetsMeta(dir, {
      widgets: {
        'assignment__sort': {
          priorCanvasFileId: null,
          priorContentHash: null,
          newContentHash: 'h-new',
          publishedCanvasFileId: 200,
        },
      },
    });

    const manifest: PreviewManifest = {
      snapshotId, courseId: 20255, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'assignment.html', pageType: 'assignment',
        intendedTitle: 'A', collisionAction: 'create',
        diff: { priorWords: null, newWords: 1, delta: 1, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
        widgets: [{ id: 'sort', slug: 'assignment', htmlPath: 'x', specPath: 'y', status: 'new' }],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'assignment.html', '');
    writeNewHtml(dir, 'assignment.html', '');
    writeState(dir, {
      phase: 'published',
      published: [{
        filename: 'assignment.html', type: 'page', canvasUrl: '', canvasPageSlug: 'assignment',
        action: 'created', publishedAt: '2026-06-04T12:00:00.000Z',
        widgets: [{ id: 'sort', status: 'published', canvasFileId: 200 }],
      }],
      lastUpdatedAt: '2026-06-04T12:00:00.000Z',
    });

    let deletedFileId: number | undefined;
    const deleteFn = vi.fn().mockImplementation(async (_host: string, _tok: string, id: number) => {
      deletedFileId = id;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })));

    const publishWidgetFn = vi.fn();

    const result = await rollbackCoursePublish(
      { snapshotId },
      { publishWidget: publishWidgetFn as any, deleteCanvasFile: deleteFn },
    );

    // Should NOT have called publishWidget for restore.
    expect(publishWidgetFn).not.toHaveBeenCalled();
    // SHOULD have called deleteCanvasFile.
    expect(deletedFileId).toBe(200);
    expect(result.widgetsCleaned.find(w => w.id === 'sort')!.status).toBe('deleted');
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- rollback_course_publish-widget-restore`
Expected: FAIL.

- [ ] **Step 2: Update `WidgetRollbackResult.status` enum**

In `rollback_course_publish.ts`, extend the `WidgetRollbackResult` interface:

```ts
export interface WidgetRollbackResult {
  id: string;
  /** V&R Plan B values:
   *  - 'restored'   — prior content re-uploaded to Canvas (new file_id); host page iframe src rewritten.
   *  - 'deleted'    — no prior content existed (widget was 'new' at preview); the publish-time file was deleted from Canvas Files.
   *  - 'skipped'    — widget had status:'failed' during publish; nothing to undo.
   *  - 'failed'     — Canvas API call errored during restore or delete. */
  status: 'restored' | 'deleted' | 'skipped' | 'failed';
  /** For 'restored': the new file_id after re-upload. For 'deleted': the just-deleted file_id. */
  canvasFileId?: number;
  error?: string;
}
```

- [ ] **Step 3: Add the restore-then-rewrite logic**

Add imports to `rollback_course_publish.ts`:

```ts
import { publishWidget as publishWidgetReal } from 'canvas-design-mcp/dist/tools/publish-widget.js';
import { readWidgetsMeta, widgetMetaKey } from '../publish/widgets_meta.js';
import { loadWidgetSpec, resolveWidgetFiles } from '../publish/widget_discovery.js';
import { rewriteIframeFileId } from '../publish/widget_iframe_rewrite.js';
import { readFileSync, existsSync as existsSyncFs } from 'node:fs';
```

Extend `RollbackHooks`:

```ts
export interface RollbackHooks {
  deleteCanvasFile?: typeof deleteCanvasFile;
  /** Override the publish_widget function (canvas-design-mcp). Tests inject a mock. */
  publishWidget?: typeof publishWidgetReal;
}
```

In `rollbackCoursePublish`, after the existing per-entry restore loop is updated:

For each `entry.widgets[w]` where `status === 'published'` and `canvasFileId` is present:

1. Read `widgets-meta.json` for this snapshot.
2. Look up the meta entry by `widgetMetaKey(slug, id)` — slug comes from the widget reference in the new page HTML (we have to re-discover it; OR store slug on `WidgetPublishResult` going forward — simplest is to scan the new HTML during this same loop, matching ids).
3. If `priorCanvasFileId === null` OR prior widget HTML file doesn't exist on disk → delete-only path (existing behavior).
4. Otherwise: restore path.

Modify the existing widgets loop:

```ts
// For each widget that was published, decide whether to restore (prior content
// exists) or delete (no prior content). Per spec "Widget content capture
// mechanics" rollback path.
const widgetsMeta = readWidgetsMeta(dir);
const publishWidgetFn = hooks.publishWidget ?? publishWidgetReal;

// Restored page HTML (after restorePage above) is what's currently live in Canvas.
// We rewrite iframes on a fresh fetch to ensure we're swapping in the right HTML.
let pageHtmlForRewrite: string | undefined;
let pageHtmlChanged = false;

for (const w of (entry.widgets ?? [])) {
  if (w.status !== 'published' || typeof w.canvasFileId !== 'number') {
    widgetsCleaned.push({ id: w.id, status: 'skipped' });
    continue;
  }

  // Look up meta entry — scan widgets-meta keys for one ending with `__<id>`.
  const metaKey = Object.keys(widgetsMeta.widgets).find(k => k.endsWith(`__${w.id}`));
  const meta = metaKey ? widgetsMeta.widgets[metaKey]! : undefined;
  const slug = metaKey ? metaKey.slice(0, metaKey.length - `__${w.id}`.length) : undefined;

  const priorWidgetPath = (metaKey && slug)
    ? join(dir, 'prior', 'widgets', `${metaKey}.html`)
    : undefined;

  const canRestore = !!(
    meta
    && meta.priorCanvasFileId !== null
    && priorWidgetPath
    && existsSyncFs(priorWidgetPath)
    && slug
  );

  if (canRestore) {
    try {
      // 1. Re-upload prior content via publishWidget.
      //    publishWidget reads htmlPath, uploads to Canvas Files, returns new file_id.
      //    We need a spec; use the local spec file (still on disk in courseDir).
      const files = resolveWidgetFiles(manifest.courseDir, { slug: slug!, id: w.id, fullMatch: '' });
      const spec = loadWidgetSpec(files.specPath);

      const restored = await publishWidgetFn({
        htmlPath: priorWidgetPath!,             // the snapshot's prior copy, not the local courseDir copy
        courseId: manifest.courseId,
        canvasConfig: { host: canvasHost, token: cfg.apiToken },
        widgetSpec: spec,
      });

      // 2. Fetch the current page body so we can rewrite the iframe src.
      //    (restorePage above already PUT the prior page HTML; we re-fetch to get
      //    the canonical version Canvas returned.)
      if (entry.type === 'page') {
        if (pageHtmlForRewrite === undefined) {
          pageHtmlForRewrite = await api.getPageBody(
            manifest.courseId,
            entry.canvasPageSlug ?? (entry.canvasUrl ?? entry.filename).split('/').pop()!,
          );
        }
        const rewritten = rewriteIframeFileId(pageHtmlForRewrite, w.canvasFileId, restored.canvasFileId);
        if (rewritten !== pageHtmlForRewrite) {
          pageHtmlForRewrite = rewritten;
          pageHtmlChanged = true;
        }
      }

      widgetsCleaned.push({ id: w.id, status: 'restored', canvasFileId: restored.canvasFileId });
    } catch (e) {
      widgetsCleaned.push({
        id: w.id, status: 'failed', canvasFileId: w.canvasFileId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    // Delete-only fallback (preserves #88 Plan B behavior for widgets with no
    // prior content — i.e. widget was 'new' at preview, so there's nothing to
    // restore; just remove the file the publish created).
    try {
      await deleteFileFn(canvasHost, cfg.apiToken, w.canvasFileId);
      widgetsCleaned.push({ id: w.id, status: 'deleted', canvasFileId: w.canvasFileId });
    } catch (e) {
      widgetsCleaned.push({
        id: w.id, status: 'failed', canvasFileId: w.canvasFileId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

// After all widgets in this page have been restored/deleted, push the
// rewritten page HTML back to Canvas if any iframe src changed.
if (pageHtmlChanged && entry.type === 'page' && pageHtmlForRewrite !== undefined) {
  try {
    await api.updatePage(
      manifest.courseId,
      entry.canvasPageSlug ?? (entry.canvasUrl ?? entry.filename).split('/').pop()!,
      pageHtmlForRewrite,
    );
  } catch (e) {
    // Surface a failed-restore entry tagged to the page filename — widgets were
    // restored to Canvas Files but the page's iframe srcs still point at the
    // (now-deleted? no — Phase 0: still-existing but stale) publish-time file_ids.
    restoreFailed.push({
      filename: entry.filename,
      reason: `widget restore succeeded but page HTML rewrite failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm test --workspace=packages/command-and-control -- rollback_course_publish-widget-restore`
Expected: 2 tests pass.

- [ ] **Step 5: Run existing rollback tests for regression**

Run: `npm test --workspace=packages/command-and-control -- rollback_course_publish`
Expected: existing tests pass (delete-only path still exists for widgets with no prior).

If any existing test asserted on `status === 'deleted'` for a widget that DID have prior content, update the assertion to `'restored'`.

- [ ] **Step 6: Build + full suite**

Run: `npm run build`
Expected: all 5 packages build clean.

Run: `npm test --workspace=packages/command-and-control`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/rollback_course_publish.ts packages/command-and-control/tests/workflows/rollback_course_publish-widget-restore.test.ts
git commit -m "feat(cc): rollback restores widget content + rewrites page iframe srcs

For each published widget on a rolled-back page, look up widgets-meta to
find priorCanvasFileId. If prior content was captured during preview:
1. Re-upload the snapshot's prior/widgets/<key>.html via publishWidget
   (gets a NEW file_id per Phase 0 finding).
2. Fetch the current page body.
3. Rewrite each matching iframe src from publish-time file_id to the new
   file_id via rewriteIframeFileId.
4. PUT the rewritten page back to Canvas.

When no prior content exists (widget was 'new' at preview), keep the
existing delete-only behavior.

WidgetRollbackResult.status enum extends with 'restored'; existing
'deleted' / 'skipped' / 'failed' values preserved.

2 new tests cover: end-to-end restore-then-rewrite, and fallback to
delete when prior content absent."
```

---

## Phase B5 — End-to-end + regression checkpoint

### Task B5.1: Round-trip integration test

**Files:**
- Create: `packages/command-and-control/tests/workflows/widget-content-roundtrip.test.ts`

Exercise the full preview → publish → rollback cycle with a single widget, asserting that what's on Canvas at the end of rollback matches what was on Canvas at the start of preview.

- [ ] **Step 1: Write the integration test**

```ts
// packages/command-and-control/tests/workflows/widget-content-roundtrip.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCoursePublish } from '../../src/tools/workflows/preview_course_publish.js';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import { rollbackCoursePublish } from '../../src/tools/workflows/rollback_course_publish.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('widget content lifecycle round-trip', () => {
  it('preview → publish → rollback restores Canvas to the pre-preview widget content', async () => {
    // Set up course folder
    mkdirSync(join(courseDir, 'assignment', 'widgets'), { recursive: true });
    writeFileSync(join(courseDir, 'config.json'), JSON.stringify({
      name: 'Course', code: 'C', semester: 'F26',
    }));
    writeFileSync(join(courseDir, 'assignment', 'assignment.md'),
      `---\ntitle: Assignment\ntype: assignment\n---\n\n{{ widget:sort }}\n`);
    const newWidgetBody = '<p>NEW widget content</p>';
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.html'), newWidgetBody);
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), JSON.stringify({
      id: 'sort', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
      dimensions: { minHeight: 200, maxHeight: 400 },
      accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
    }));

    const priorWidgetBody = '<p>PRIOR widget content</p>';
    // Canvas's mutable state across the round-trip.
    const canvasFiles = new Map<number, string>();
    canvasFiles.set(100, priorWidgetBody);
    let nextFileId = 200;
    let livePageBody = '<iframe src="/courses/20255/files/100/preview"></iframe>';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';

      if (u.endsWith('/pages') || u.includes('/pages?')) {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'assignment', title: 'Assignment', html_url: 'https://canvas.example/courses/20255/pages/assignment', body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/assignments')) {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.match(/\/pages\/assignment$/)) {
        if (method === 'GET') {
          return new Response(JSON.stringify({
            page_id: 1, url: 'assignment', title: 'Assignment', html_url: '', body: livePageBody, published: true, updated_at: '',
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (method === 'PUT') {
          const parsed = JSON.parse(String((init?.body as any) ?? '{}'));
          livePageBody = parsed?.wiki_page?.body ?? livePageBody;
          return new Response(JSON.stringify({ page_id: 1, url: 'assignment', title: 'Assignment', html_url: '', body: livePageBody, published: true, updated_at: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
      }
      // File metadata
      const fileMetaMatch = u.match(/\/files\/(\d+)$/);
      if (fileMetaMatch && method === 'GET') {
        const id = Number(fileMetaMatch[1]);
        if (!canvasFiles.has(id)) return new Response('not found', { status: 404 });
        return new Response(JSON.stringify({
          id, url: `https://canvas.example/files/${id}/download?verifier=x`,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      // File download
      const fileDownloadMatch = u.match(/\/files\/(\d+)\/download/);
      if (fileDownloadMatch) {
        const id = Number(fileDownloadMatch[1]);
        return new Response(canvasFiles.get(id) ?? '', { status: 200 });
      }
      // File DELETE
      const fileDeleteMatch = u.match(/\/files\/(\d+)$/);
      if (fileDeleteMatch && method === 'DELETE') {
        canvasFiles.delete(Number(fileDeleteMatch[1]));
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    // Stub publishWidget so it allocates new file_ids deterministically and uploads
    // to our in-memory canvasFiles map. Reads the htmlPath that the caller provides.
    const publishWidgetStub = vi.fn().mockImplementation(async (input: any) => {
      const fileId = nextFileId++;
      const content = readFileSync(input.htmlPath, 'utf-8');
      canvasFiles.set(fileId, content);
      return {
        canvasFileId: fileId,
        embedSrc: `https://canvas.example/courses/20255/files/${fileId}/preview`,
        embedHtml: `<iframe src="https://canvas.example/courses/20255/files/${fileId}/preview"></iframe>`,
      };
    });

    // --- 1. Preview ---
    const preview = await previewCoursePublish({ courseDir, courseId: 20255 });
    expect(preview.manifest).toBeDefined();
    const page = preview.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('changed');

    // --- 2. Publish ---
    const publish = await publishCourse(
      { snapshotId: preview.snapshotId!, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: publishWidgetStub as any },
    );
    expect(publish.phase).toBe('published');

    // After publish, the live page should reference the NEW widget file_id.
    const newFileId = publish.published.find(p => p.filename === 'assignment.html')!.widgets![0]!.canvasFileId!;
    expect(canvasFiles.get(newFileId)).toBe(newWidgetBody);
    expect(livePageBody).toContain(`/files/${newFileId}/preview`);

    // --- 3. Rollback ---
    const rollback = await rollbackCoursePublish(
      { snapshotId: preview.snapshotId! },
      { publishWidget: publishWidgetStub as any },
    );
    expect(rollback.phase).toBe('rolled-back');

    // After rollback, the live page should reference a file whose content matches
    // the PRIOR widget body (the restore re-uploaded prior/widgets/.../sort.html).
    const restoredEntry = rollback.widgetsCleaned.find(w => w.id === 'sort')!;
    expect(restoredEntry.status).toBe('restored');
    const restoredFileId = restoredEntry.canvasFileId!;
    expect(canvasFiles.get(restoredFileId)).toBe(priorWidgetBody);
    expect(livePageBody).toContain(`/files/${restoredFileId}/preview`);
    expect(livePageBody).not.toContain(`/files/${newFileId}/preview`);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npm test --workspace=packages/command-and-control -- widget-content-roundtrip`
Expected: 1 test passes.

- [ ] **Step 3: Run the FULL monorepo test suite for regression**

Run: `npm test`
Expected: previous total (Plan A's ~318 plus new tests: getFileContent 3, hash 3, widgets_meta 8, pages_meta 6, snapshot_store-widget-dirs 1, widget_discovery-prior 4, preview_course_publish-widget-capture 4, publish_course-widgets-meta 2, widget_iframe_rewrite 5, rollback_course_publish-widget-restore 2, widget-content-roundtrip 1) ≈ 357 passing. Zero failures.

Run: `npm run build`
Expected: all 5 packages build clean.

- [ ] **Step 4: Manual verification against University sandbox (with the professor)**

- [ ] Pick a course folder with at least one widget page.
- [ ] Run `preview_course_publish` and inspect the resulting `<courseDir>/.canvas-toolchain/publish-snapshots/<id>/widgets-meta.json` — confirm it has the widget keyed by `<slug>__<id>` with `priorCanvasFileId` and content hashes filled in.
- [ ] Confirm `<id>/prior/widgets/<key>.html` exists and contains the actual Canvas-side widget HTML.
- [ ] Run `publish_course` and re-check widgets-meta — confirm `publishedCanvasFileId` is now set.
- [ ] Run `rollback_course_publish` and visit the page in Canvas — confirm the widget iframe renders the prior content (not "404" and not the post-publish version).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/tests/workflows/widget-content-roundtrip.test.ts
git commit -m "test(cc): widget content lifecycle round-trip integration

preview → publish → rollback with a single widget. Stubs Canvas Files as
an in-memory map keyed by file_id; stubs publishWidget to allocate fresh
ids and write to the map; stubs page GET/PUT to mutate a single live-page
body string.

Asserts:
- Preview reports status='changed' and captures prior content into the snapshot.
- Publish replaces the live page's iframe src with the new file_id and uploads
  the new widget body to that id.
- Rollback re-uploads the captured prior content to a NEW file_id, rewrites
  the page's iframe src to that new id, and leaves Canvas's live state showing
  the prior widget body.

The key invariant: Canvas content the page shows AFTER rollback == content
it showed BEFORE preview. Closes the #88 Plan B v1.x rollback gap end-to-end."
```

---

## Plan B ship checkpoint

After Task B5.1 completes:

- [ ] `npm test` (full monorepo): all green.
- [ ] `npm run build`: all 5 packages clean.
- [ ] Manual sandbox verification done (Task B5.1 Step 4).
- [ ] Memory update: V&R Plan B shipped; widget content lifecycle closed; remaining V&R work is Plan C (backup detection + breadcrumbs + retention + list/prune tools + rollback re-shape).

---

## Self-review checklist

- [ ] **Spec coverage:** Plan B implements every item from spec "Widget content capture mechanics":
    - `CanvasApiClient.getFileContent` ✓ (B1.1)
    - Hash helper ✓ (B1.2)
    - `widgets-meta.json` schema + helpers ✓ (B1.3, B1.4)
    - `pages-meta.json` schema + helpers ✓ (B1.3, B1.5)
    - Snapshot widget sub-dirs ✓ (B1.6)
    - Prior-iframe Canvas-Files scanner ✓ (B2.1)
    - preview_course_publish fetch + hash + status upgrade ✓ (B2.2)
    - publish_course publishedCanvasFileId recording ✓ (B3.1)
    - rollback restore + page iframe rewrite ✓ (B4.1, B4.2)
    - End-to-end round-trip ✓ (B5.1)
- [ ] **Placeholder scan:** No TBD/TODO. Every step has complete code or exact commands.
- [ ] **Type consistency:** `WidgetsMeta`, `WidgetMetaEntry`, `PagesMeta`, `PageMetaEntry`, `PriorWidgetRef` defined in manifest_types.ts / widget_discovery.ts. `widgetMetaKey` shared across preview + publish + rollback. `WidgetPreviewStatus.status` enum extension covers all 5 values referenced in code. `WidgetRollbackResult.status` extended to `'restored'`.
- [ ] **Plan A foundation usage:** Plan B references but does not redefine `PublishStateMeta`, `state_meta.ts`, `snapshot_location.ts`, `snapshotsRootFor` / `snapshotDirFor` / `createSnapshotDirFor` (extended in B1.6), `setup_canvas.snapshotsLocation`. All Plan A semantics preserved.
- [ ] **Backward compat:** Existing `'ready'` status callers updated to `'new'` / `'changed'` / `'unchanged'` (B2.2 Step 5). Existing `'deleted'`/`'skipped'`/`'failed'` rollback statuses preserved. Existing `discoverWidgetRefs` / `substituteWidgetIframeSrc` untouched (new `discoverPriorWidgetRefs` / `rewriteIframeFileId` added alongside).
- [ ] **Phase 0 finding respected:** Rollback re-uploads via publishWidget (NEW file_id), rewrites host page iframe src in lockstep, PUTs the rewritten page — never assumes file_id stability.
- [ ] **Failure modes covered:** `WIDGET_FETCH_FAILED` at preview falls back to `'new'` with warning. `publishWidget` failure at publish leaves `publishedCanvasFileId` unset → rollback then skips. `publishWidget` failure at rollback emits `status: 'failed'` per widget. Page rewrite failure after widget restore surfaces in `restoreFailed[]`.

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task. Same pattern as Plan A and widget renderer Plans A/B.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
