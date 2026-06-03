// packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../src/tools/widget/catalog/index.js';
import { buildWidgetHtml } from '../../../src/tools/widget/wrapper.js';
import type { InteractiveSpec, WidgetKind } from '../../../src/tools/widget/types.js';

// Minimal fixture content per kind. Plan B adds entries for new kinds as they land.
const FIXTURE_CONTENT: Record<WidgetKind, Record<string, unknown>> = {
  'card-flip-reveal': { cards: [{ front: 'F', back: 'B' }] },
  // Plan B will populate the rest.
  'sortable-ordering': {
    items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
    correctOrder: ['a', 'b', 'c'],
  },
  'drag-to-categorize': {
    items: [{ id: 'a', label: 'A', correctBin: 'b1' }],
    bins: [{ id: 'b1', label: 'B1' }, { id: 'b2', label: 'B2' }],
  },
  'branching-scenario': {} as Record<string, unknown>,
  'multi-step-reveal': {} as Record<string, unknown>,
  'hotspot-image': {} as Record<string, unknown>,
};

function makeSpec(kind: WidgetKind): InteractiveSpec {
  return {
    id: `contract-${kind}`,
    name: `Contract test: ${kind}`,
    kind,
    purpose: 'test',
    contentSchema: {},
    initialContent: FIXTURE_CONTENT[kind],
    dimensions: { minHeight: 200, maxHeight: 600 },
    accessibility: { keyboardEquivalent: 'kbd', screenReaderSummary: 'summary', minTouchTarget: 44 },
  };
}

describe.each(Object.entries(CATALOG))('contract assertions: %s', (kind, renderer) => {
  if (!renderer) return;

  const spec = makeSpec(kind as WidgetKind);
  const validated = renderer.validateContent(spec.initialContent);
  if (!validated.ok) {
    it.fails('fixture content should validate', () => {
      expect(validated.ok, validated.error).toBe(true);
    });
    return;
  }
  const { body, css, js } = renderer.render(validated.value, spec);
  const html = buildWidgetHtml({ body, css, js, spec });

  it('document has DOCTYPE, lang, viewport, charset', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html lang=');
    expect(html).toContain('<meta charset=');
    expect(html).toContain('<meta name="viewport"');
  });

  it('contains the sr-only live region', () => {
    expect(html).toContain('id="widget-status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('class="sr-only"');
  });

  it('every interactive element has aria-label or aria-labelledby', () => {
    const interactiveTags = (body.match(/<(?:button|a|input|select|textarea|[a-z]+\s+role="button")[^>]*>/gi) ?? []);
    for (const tag of interactiveTags) {
      const hasLabel = /aria-label="/.test(tag) || /aria-labelledby="/.test(tag);
      expect(hasLabel, `interactive element missing aria-label/aria-labelledby: ${tag}`).toBe(true);
    }
  });

  it('does not use transition / animation / transform CSS', () => {
    expect(css).not.toMatch(/(?<![a-z-])transition\s*:/);
    expect(css).not.toMatch(/(?<![a-z-])animation\s*:/);
    expect(css).not.toMatch(/(?<![a-z-])transform\s*:/);
  });

  it('has no external requests (no http(s) src/href/import)', () => {
    expect(html).not.toMatch(/<link[^>]*href="https?:/i);
    expect(html).not.toMatch(/<script[^>]*src="https?:/i);
    expect(html).not.toMatch(/<iframe[^>]*src="https?:/i);
    expect(js).not.toMatch(/import\s*\(?['"]https?:/);
    expect(js).not.toMatch(/fetch\s*\(\s*['"]https?:/);
  });

  it('has no inline event handlers in renderer body (use addEventListener instead)', () => {
    expect(body).not.toMatch(/\son[a-z]+="/i);
  });
});
