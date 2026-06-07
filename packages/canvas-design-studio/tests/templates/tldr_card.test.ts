import { describe, expect, it } from 'vitest';
import { renderTldrCard } from '../../src/templates/tldr_card.js';

describe('renderTldrCard', () => {
  it('renders a bullet list from tier-1 sections', () => {
    const html = renderTldrCard({
      tiers: {
        sections: [
          { heading: 'Due Date', tier: 1, summary: 'Friday Oct 17 at 11:59 PM' },
          { heading: 'Submission', tier: 2, summary: 'Single PDF' },
          { heading: 'Deliverable', tier: 1, summary: 'Three-page analysis' },
        ],
      },
    });
    expect(html).toContain('Quick Reference');
    expect(html).toContain('<strong>Due Date:</strong> Friday Oct 17 at 11:59 PM');
    expect(html).toContain('<strong>Deliverable:</strong> Three-page analysis');
    expect(html).not.toContain('Submission');
  });

  it('returns empty string when there are no tier-1 sections', () => {
    const html = renderTldrCard({
      tiers: {
        sections: [
          { heading: 'Submission', tier: 2, summary: 'PDF' },
          { heading: 'Rubric', tier: 3, summary: 'see below' },
        ],
      },
    });
    expect(html).toBe('');
  });

  it('respects section order from input', () => {
    const html = renderTldrCard({
      tiers: {
        sections: [
          { heading: 'Second', tier: 1, summary: 'b' },
          { heading: 'First', tier: 1, summary: 'a' },
        ],
      },
    });
    const idxSecond = html.indexOf('Second');
    const idxFirst = html.indexOf('First');
    expect(idxSecond).toBeGreaterThanOrEqual(0);
    expect(idxFirst).toBeGreaterThan(idxSecond);
  });

  it('HTML-escapes heading and summary content', () => {
    const html = renderTldrCard({
      tiers: {
        sections: [
          { heading: 'Name <with> "quotes" &', tier: 1, summary: '<em>raw</em>' },
        ],
      },
    });
    expect(html).toContain('Name &lt;with&gt; &quot;quotes&quot; &amp;');
    expect(html).toContain('&lt;em&gt;raw&lt;/em&gt;');
    expect(html).not.toContain('<em>raw</em>');
  });

  it('uses BSU primary blue (#0033A0) palette', () => {
    const html = renderTldrCard({
      tiers: { sections: [{ heading: 'X', tier: 1, summary: 'y' }] },
    });
    expect(html).toContain('#0033A0');
    expect(html).toContain('#E6ECF9');
  });
});
