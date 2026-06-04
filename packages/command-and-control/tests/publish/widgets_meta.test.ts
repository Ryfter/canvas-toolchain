import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
    // Corrupt it — use ESM writeFileSync imported above (not require()).
    writeFileSync(join(snapshotDir, 'widgets-meta.json'), '{not json');
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
