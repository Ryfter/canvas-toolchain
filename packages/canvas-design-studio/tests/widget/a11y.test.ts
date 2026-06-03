import { describe, expect, it } from 'vitest';
import { WRAPPER_A11Y_CSS, WRAPPER_BOOTSTRAP_JS, SR_REGION_HTML } from '../../src/tools/widget/a11y.js';

describe('widget/a11y', () => {
  it('exports an sr-only CSS class', () => {
    expect(WRAPPER_A11Y_CSS).toContain('.sr-only');
    // Classic visually-hidden pattern: 1×1 clip, absolute positioning, no overflow
    expect(WRAPPER_A11Y_CSS).toMatch(/position:\s*absolute/);
    expect(WRAPPER_A11Y_CSS).toMatch(/clip(?:-path)?:/);
  });

  it('exports a prefers-reduced-motion media query that disables transitions/animations', () => {
    expect(WRAPPER_A11Y_CSS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(WRAPPER_A11Y_CSS).toMatch(/transition:\s*none/);
    expect(WRAPPER_A11Y_CSS).toMatch(/animation:\s*none/);
  });

  it('exports a .touch-target utility class with 44px minimums', () => {
    expect(WRAPPER_A11Y_CSS).toMatch(/\.touch-target[^}]*min-width:\s*44px/);
    expect(WRAPPER_A11Y_CSS).toMatch(/\.touch-target[^}]*min-height:\s*44px/);
  });

  it('exports an announce() bootstrap that writes to #widget-status', () => {
    expect(WRAPPER_BOOTSTRAP_JS).toContain('window.__announce');
    expect(WRAPPER_BOOTSTRAP_JS).toContain('widget-status');
  });

  it('renders the SR region with aria-live="polite" and class="sr-only"', () => {
    const html = SR_REGION_HTML('Test summary');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('id="widget-status"');
    expect(html).toContain('Test summary');
  });

  it('escapes HTML in the summary text', () => {
    const html = SR_REGION_HTML('<script>x</script>');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
