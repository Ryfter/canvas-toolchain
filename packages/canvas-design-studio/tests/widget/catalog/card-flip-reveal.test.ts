import { describe, expect, it } from 'vitest';
import { cardFlipRevealRenderer } from '../../../src/tools/widget/catalog/card-flip-reveal.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'vocab-set-1',
  name: 'Vocab Set 1',
  kind: 'card-flip-reveal',
  purpose: 'Recall IS vocab terms',
  contentSchema: {},
  initialContent: {},
  dimensions: { minHeight: 300, maxHeight: 600 },
  accessibility: {
    keyboardEquivalent: 'Tab to a card; Enter or Space to flip; arrows to move between cards.',
    screenReaderSummary: 'Six vocabulary cards. Tab to a card, then Enter to reveal the definition.',
    minTouchTarget: 44,
  },
};

const goodContent = {
  cards: [
    { front: 'ETL', back: 'Extract, Transform, Load' },
    { front: 'OLAP', back: 'Online Analytical Processing' },
  ],
};

describe('cardFlipRevealRenderer', () => {
  describe('schema validation', () => {
    it('accepts a well-formed cards array', () => {
      const r = cardFlipRevealRenderer.validateContent(goodContent);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.cards).toHaveLength(2);
    });

    it('rejects missing cards key', () => {
      const r = cardFlipRevealRenderer.validateContent({});
      expect(r.ok).toBe(false);
    });

    it('rejects empty cards array', () => {
      const r = cardFlipRevealRenderer.validateContent({ cards: [] });
      expect(r.ok).toBe(false);
    });

    it('rejects card missing front', () => {
      const r = cardFlipRevealRenderer.validateContent({ cards: [{ back: 'x' }] });
      expect(r.ok).toBe(false);
    });

    it('rejects card missing back', () => {
      const r = cardFlipRevealRenderer.validateContent({ cards: [{ front: 'x' }] });
      expect(r.ok).toBe(false);
    });

    it('rejects non-string front/back', () => {
      const r = cardFlipRevealRenderer.validateContent({ cards: [{ front: 1, back: 2 }] });
      expect(r.ok).toBe(false);
    });
  });

  describe('render output', () => {
    const validated = cardFlipRevealRenderer.validateContent(goodContent);
    if (!validated.ok) throw new Error('validation failed in test setup');
    const { body, css, js } = cardFlipRevealRenderer.render(validated.value, baseSpec);

    it('emits one button per card', () => {
      const matches = body.match(/role="button"/g) ?? [];
      expect(matches).toHaveLength(2);
    });

    it('each card has aria-pressed initially "false"', () => {
      expect((body.match(/aria-pressed="false"/g) ?? []).length).toBe(2);
    });

    it('emits aria-label with card position context', () => {
      expect(body).toMatch(/aria-label="Card 1 of 2/);
      expect(body).toMatch(/aria-label="Card 2 of 2/);
    });

    it('does NOT use transition/animation/transform (Canvas RCE safe even though wrapper allows them in iframe context)', () => {
      // Even in iframe context, the renderer should use no-animation patterns because reduced-motion is the universal floor.
      expect(css).not.toMatch(/\btransition\s*:/);
      expect(css).not.toMatch(/\banimation\s*:/);
      expect(css).not.toMatch(/\btransform\s*:/);
    });

    it('escapes HTML in front/back content', () => {
      const evilContent = { cards: [{ front: '<script>x</script>', back: 'safe' }] };
      const ev = cardFlipRevealRenderer.validateContent(evilContent);
      if (!ev.ok) throw new Error('escape test setup failed');
      const evOut = cardFlipRevealRenderer.render(ev.value, baseSpec);
      expect(evOut.body).not.toContain('<script>x</script>');
      expect(evOut.body).toContain('&lt;script&gt;');
    });

    it('emits JS that adds click + keyboard handlers and calls __announce on flip', () => {
      expect(js).toContain('addEventListener');
      expect(js).toMatch(/key\s*===\s*['"]Enter['"]|keyCode\s*===\s*13/);
      expect(js).toContain('__announce');
    });
  });
});
