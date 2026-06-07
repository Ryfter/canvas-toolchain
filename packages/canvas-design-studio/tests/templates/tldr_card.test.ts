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

  it('renders the Supports CLOs line when clos.resolved is non-empty', () => {
    const html = renderTldrCard({
      clos: {
        resolved: [
          { id: '1', name: 'Analyzing', statement: 's1' },
          { id: '3', name: 'Communicating', statement: 's3' },
        ],
        unknownIds: [],
      },
    });
    expect(html).toContain('Supports CLOs');
    expect(html).toContain('CLO 1');
    expect(html).toContain('Analyzing');
    expect(html).toContain('CLO 3');
    expect(html).toContain('Communicating');
  });

  it('omits the line when clos is absent', () => {
    const html = renderTldrCard({
      tiers: { sections: [{ heading: 'D', tier: 1, summary: 's' }] },
    });
    expect(html).not.toContain('Supports CLOs');
  });

  it('HTML-escapes CLO id and name', () => {
    const html = renderTldrCard({
      clos: { resolved: [{ id: '<x>', name: 'Name <em>', statement: 's' }], unknownIds: [] },
    });
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('Name &lt;em&gt;');
  });

  it('renders the card with ONLY the CLOs line when tier-1 sections absent', () => {
    const html = renderTldrCard({
      clos: { resolved: [{ id: '1', name: 'Analyzing', statement: 's' }], unknownIds: [] },
    });
    expect(html).toContain('Quick Reference');
    expect(html).toContain('Supports CLOs');
  });

  it('returns empty string when neither tier-1 sections nor CLOs', () => {
    const html = renderTldrCard({
      tiers: { sections: [{ heading: 'X', tier: 3, summary: 'rubric details' }] },
    });
    expect(html).toBe('');
  });
});
