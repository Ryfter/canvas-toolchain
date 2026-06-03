import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverWidgetRefs,
  substituteWidgetIframeSrc,
  resolveWidgetFiles,
  loadWidgetSpec,
} from '../../src/tools/publish/widget_discovery.js';

describe('discoverWidgetRefs', () => {
  it('finds a single iframe widget reference', () => {
    const html = '<p>Practice:</p><iframe src="assignment/widgets/data-types-categorize.html" width="100%" height="400" title="x" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy">fallback</iframe><p>Submit.</p>';
    const refs = discoverWidgetRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.slug).toBe('assignment');
    expect(refs[0]!.id).toBe('data-types-categorize');
    expect(refs[0]!.fullMatch).toContain('<iframe');
    expect(refs[0]!.fullMatch).toContain('</iframe>');
  });

  it('finds multiple widget references on the same page', () => {
    const html = '<iframe src="overview/widgets/first.html">f1</iframe><p>middle</p><iframe src="overview/widgets/second.html">f2</iframe>';
    const refs = discoverWidgetRefs(html);
    expect(refs).toHaveLength(2);
    expect(refs[0]!.id).toBe('first');
    expect(refs[1]!.id).toBe('second');
  });

  it('returns empty array when no widget iframes are present', () => {
    const html = '<p>Plain page with no widgets.</p>';
    expect(discoverWidgetRefs(html)).toHaveLength(0);
  });

  it('ignores iframes whose src is already a Canvas URL', () => {
    const html = '<iframe src="https://canvas.example/courses/1/files/42/preview">x</iframe>';
    expect(discoverWidgetRefs(html)).toHaveLength(0);
  });

  it('ignores iframes whose src is an external HTTPS URL', () => {
    const html = '<iframe src="https://youtube.com/embed/abc123">x</iframe>';
    expect(discoverWidgetRefs(html)).toHaveLength(0);
  });

  it('handles attribute order variation', () => {
    const html = '<iframe loading="lazy" sandbox="x" src="page/widgets/foo.html" width="100%">f</iframe>';
    const refs = discoverWidgetRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.id).toBe('foo');
  });
});

describe('substituteWidgetIframeSrc', () => {
  it('replaces the src on the matched iframe and leaves other attributes alone', () => {
    const html = '<p>before</p><iframe src="assignment/widgets/foo.html" width="100%" title="foo">fb</iframe><p>after</p>';
    const refs = discoverWidgetRefs(html);
    const out = substituteWidgetIframeSrc(html, refs[0]!, 'https://canvas/files/99/preview');
    expect(out).toContain('src="https://canvas/files/99/preview"');
    expect(out).toContain('width="100%"');
    expect(out).toContain('title="foo"');
    expect(out).toContain('<p>before</p>');
    expect(out).toContain('<p>after</p>');
    expect(out).not.toContain('assignment/widgets/foo.html');
  });

  it('does not affect other widget iframes when substituting one of multiple', () => {
    const html = '<iframe src="page/widgets/a.html">a</iframe><iframe src="page/widgets/b.html">b</iframe>';
    const refs = discoverWidgetRefs(html);
    const out = substituteWidgetIframeSrc(html, refs[0]!, 'https://canvas/files/1/preview');
    expect(out).toContain('src="https://canvas/files/1/preview"');
    expect(out).toContain('src="page/widgets/b.html"');
    expect(out).not.toContain('src="page/widgets/a.html"');
  });
});

describe('resolveWidgetFiles', () => {
  it('builds the expected paths under <courseDir>/<slug>/widgets/', () => {
    const files = resolveWidgetFiles('/course', { slug: 'assignment', id: 'foo', fullMatch: '' });
    expect(files.htmlPath).toBe(join('/course', 'assignment', 'widgets', 'foo.html'));
    expect(files.specPath).toBe(join('/course', 'assignment', 'widgets', 'foo.spec.json'));
  });
});

describe('loadWidgetSpec', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'ws-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('loads a valid spec', () => {
    const goodSpec = {
      id: 'foo', name: 'Foo', kind: 'card-flip-reveal', purpose: '',
      contentSchema: {}, initialContent: {},
      dimensions: { minHeight: 200, maxHeight: 400 },
      accessibility: { keyboardEquivalent: '', screenReaderSummary: '', minTouchTarget: 44 },
    };
    const p = join(tmp, 'foo.spec.json');
    writeFileSync(p, JSON.stringify(goodSpec), 'utf-8');
    const loaded = loadWidgetSpec(p);
    expect(loaded.id).toBe('foo');
    expect(loaded.kind).toBe('card-flip-reveal');
  });

  it('throws when the spec file is missing', () => {
    expect(() => loadWidgetSpec(join(tmp, 'nope.spec.json'))).toThrow(/not found/);
  });

  it('throws when the spec file is malformed JSON', () => {
    const p = join(tmp, 'bad.spec.json');
    writeFileSync(p, '{not json', 'utf-8');
    expect(() => loadWidgetSpec(p)).toThrow(/not valid JSON/);
  });

  it('throws when a required top-level field is missing', () => {
    const p = join(tmp, 'incomplete.spec.json');
    writeFileSync(p, JSON.stringify({ id: 'x', name: 'X' }), 'utf-8');
    expect(() => loadWidgetSpec(p)).toThrow(/missing required field/);
  });
});
