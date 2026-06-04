import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
