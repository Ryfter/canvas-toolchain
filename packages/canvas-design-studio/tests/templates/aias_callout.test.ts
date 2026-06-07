import { describe, expect, it } from 'vitest';
import { renderAiasCallout } from '../../src/templates/aias_callout.js';

describe('renderAiasCallout', () => {
  it('renders level + name + note', () => {
    const html = renderAiasCallout({ aias: { level: 3, note: 'Custom note here.' } });
    expect(html).toContain('Level 3');
    expect(html).toContain('AI Collaboration');
    expect(html).toContain('Custom note here.');
  });

  it('HTML-escapes name and note', () => {
    const html = renderAiasCallout({ aias: { level: 1, note: 'No <em>AI</em> & no "tools".' } });
    expect(html).toContain('No &lt;em&gt;AI&lt;/em&gt; &amp; no &quot;tools&quot;.');
    expect(html).not.toContain('No <em>AI</em>');
  });

  it('uses warning-tan palette (#FAEEDA / #854F0B)', () => {
    const html = renderAiasCallout({ aias: { level: 2, note: 'x' } });
    expect(html).toContain('#FAEEDA');
    expect(html).toContain('#854F0B');
  });
});
