import { describe, expect, it } from 'vitest';
import { auditAccessibility } from '../src/tools/accessibility.js';

describe('auditAccessibility', () => {
  describe('contrast-ratio', () => {
    it('flags same-element inline pair below 4.5:1 (background-color)', () => {
      const html = '<p style="color:#cccccc;background-color:#ffffff;">text</p>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'contrast-ratio')).toBe(true);
    });

    it('flags same-element inline pair below 4.5:1 (background: hex shorthand)', () => {
      const html = '<div style="background:#cccccc;color:#ffffff;">text</div>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'contrast-ratio')).toBe(true);
    });

    it('does not flag colors on separate elements', () => {
      const html = '<div style="background-color:#cccccc;"><p style="color:#000000;">text</p></div>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'contrast-ratio')).toBe(false);
    });

    it('does not flag non-hex color values (graceful skip)', () => {
      const html = '<p style="color:rgb(0,0,0);background-color:rgb(255,255,255);">text</p>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'contrast-ratio')).toBe(false);
    });

    it('applies 3.0:1 threshold for large text (font-size >= 24px)', () => {
      // #888888 on white = ~3.9:1 — passes large-text (3:1) but fails body-text (4.5:1)
      const html = '<p style="color:#888888;background-color:#ffffff;font-size:24px;">text</p>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'contrast-ratio')).toBe(false);
    });

    it('applies 3.0:1 threshold for bold text >= 18px', () => {
      const html = '<p style="color:#888888;background-color:#ffffff;font-size:18px;font-weight:700;">text</p>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'contrast-ratio')).toBe(false);
    });
  });

  describe('empty-alt', () => {
    it('flags content image with alt=""', () => {
      const html = '<img src="chart.png" alt="">';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'empty-alt')).toBe(true);
    });

    it('does not flag decorative image patterns', () => {
      const html = '<img src="spacer.gif" alt="">';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'empty-alt')).toBe(false);
    });

    it('does not flag images with descriptive alt', () => {
      const html = '<img src="chart.png" alt="Bar chart showing enrollment trends">';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'empty-alt')).toBe(false);
    });

    it('does not double-flag missing alt (RCE validator owns that check)', () => {
      const html = '<img src="chart.png">';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'empty-alt')).toBe(false);
    });
  });

  describe('heading-skip', () => {
    it('flags H2 to H4 skip', () => {
      const html = '<h2>Section</h2><h4>Subsection</h4>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'heading-skip')).toBe(true);
      expect(warnings.find(w => w.check === 'heading-skip')?.message).toContain('H2 to H4');
    });

    it('does not flag sequential levels', () => {
      const html = '<h2>Section</h2><h3>Sub</h3><h4>Subsub</h4>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'heading-skip')).toBe(false);
    });

    it('does not flag level reset (H4 to H2 is valid)', () => {
      const html = '<h2>A</h2><h3>B</h3><h4>C</h4><h2>D</h2>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'heading-skip')).toBe(false);
    });
  });

  describe('vague-link', () => {
    it('flags "click here"', () => {
      const html = '<a href="/page">click here</a>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'vague-link')).toBe(true);
    });

    it('does not flag descriptive link text', () => {
      const html = '<a href="/rubric">View the assignment rubric</a>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'vague-link')).toBe(false);
    });

    it('does not flag partial matches', () => {
      const html = '<a href="/page">learn more about this topic</a>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'vague-link')).toBe(false);
    });
  });

  describe('table-no-headers', () => {
    it('flags table with only <td>', () => {
      const html = '<table><tr><td>Cell</td></tr></table>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'table-no-headers')).toBe(true);
    });

    it('does not flag table with <th>', () => {
      const html = '<table><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>';
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'table-no-headers')).toBe(false);
    });
  });

  it('returns empty array for clean HTML', () => {
    const html = '<h2>Title</h2><p>Body text</p><a href="/rubric">View rubric</a>';
    expect(auditAccessibility(html)).toHaveLength(0);
  });

  describe('video-no-captions', () => {
    it('flags Panopto iframe without captions=true in src', () => {
      const html = `<iframe src="https://example.hosted.panopto.com/Panopto/Pages/Embed.aspx?id=abc123&autoplay=false" aria-label="Lecture"></iframe>`;
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'video-no-captions')).toBe(true);
    });

    it('does not flag Panopto iframe with captions=true in src', () => {
      const html = `<iframe src="https://example.hosted.panopto.com/Panopto/Pages/Embed.aspx?id=abc123&autoplay=false&captions=true" aria-label="Lecture"></iframe>`;
      const warnings = auditAccessibility(html);
      expect(warnings.some(w => w.check === 'video-no-captions')).toBe(false);
    });
  });
});
