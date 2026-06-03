import { describe, expect, it } from 'vitest';
import { buildWidgetHtml } from '../../src/tools/widget/wrapper.js';
import type { InteractiveSpec } from '../../src/tools/widget/types.js';

const spec: InteractiveSpec = {
  id: 'test-widget',
  name: 'Test Widget',
  kind: 'card-flip-reveal',
  purpose: 'unit test',
  contentSchema: {},
  initialContent: {},
  dimensions: { minHeight: 200, maxHeight: 600 },
  accessibility: { keyboardEquivalent: 'Tab + Enter', screenReaderSummary: 'A test widget.', minTouchTarget: 44 },
};

describe('buildWidgetHtml', () => {
  const html = buildWidgetHtml({
    body: '<div id="renderer-content">renderer body</div>',
    css: '#renderer-content { color: red; }',
    js: 'console.log("renderer js");',
    spec,
  });

  it('produces a full standalone HTML document', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('includes viewport meta and charset', () => {
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
  });

  it('uses spec.name as the document title', () => {
    expect(html).toContain('<title>Test Widget</title>');
  });

  it('injects wrapper a11y CSS before renderer CSS', () => {
    const wrapperIdx = html.indexOf('.sr-only');
    const rendererIdx = html.indexOf('#renderer-content');
    expect(wrapperIdx).toBeGreaterThan(-1);
    expect(rendererIdx).toBeGreaterThan(wrapperIdx);
  });

  it('seeds the SR live region with spec.accessibility.screenReaderSummary', () => {
    expect(html).toContain('id="widget-status"');
    expect(html).toContain('A test widget.');
  });

  it('places renderer body inside <body>, after the SR region', () => {
    const srIdx = html.indexOf('id="widget-status"');
    const rendererBodyIdx = html.indexOf('renderer body');
    expect(rendererBodyIdx).toBeGreaterThan(srIdx);
  });

  it('injects wrapper bootstrap JS before renderer JS', () => {
    const wrapperJsIdx = html.indexOf('window.__announce');
    const rendererJsIdx = html.indexOf('renderer js');
    expect(wrapperJsIdx).toBeGreaterThan(-1);
    expect(rendererJsIdx).toBeGreaterThan(wrapperJsIdx);
  });

  it('includes dimension-derived CSS', () => {
    expect(html).toContain('min-height: 200px');
    expect(html).toContain('max-height: 600px');
  });

  it('escapes spec.name in <title>', () => {
    const evilSpec = { ...spec, name: '<script>x</script>' };
    const evilHtml = buildWidgetHtml({ body: '', css: '', js: '', spec: evilSpec });
    expect(evilHtml).not.toContain('<title><script>');
    expect(evilHtml).toContain('<title>&lt;script&gt;');
  });
});
