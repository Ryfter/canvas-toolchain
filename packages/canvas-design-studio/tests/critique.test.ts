import { describe, expect, it } from 'vitest';
import { critiqueCanvasPage } from '../src/tools/critique.js';

const CLEAN_HTML = `
<div style="max-width:860px;font-family:Lato,sans-serif;">
  <h2 style="font-size:28px;color:#0033A0;">Assignment Overview</h2>
  <div class="grid-row">
    <div class="col-md-8" style="padding-right:12px;">
      <div style="background:#ffffff;border:1px solid #e0e0d8;border-radius:10px;padding:20px;">
        <p style="font-size:15px;color:#1A1A1A;line-height:1.65;">
          This assignment asks students to create a five-minute video presentation about their passion project.
          Students should include relevant visuals and a voiceover narration explaining their topic.
          The video must be uploaded to the course media library when complete.
          Submit your final video link through the Canvas assignment submission box before the due date.
          Late submissions will receive a ten percent deduction per day.
        </p>
      </div>
    </div>
    <div class="col-md-4">
      <div style="background:#ffffff;border:1px solid #e0e0d8;border-radius:10px;padding:16px;">
        <p style="font-size:14px;color:#555550;line-height:1.65;">
          Grading follows the rubric posted in Canvas. See the rubric for full details on scoring.
          Contact the professor at least 48 hours before the deadline with any questions.
        </p>
      </div>
    </div>
  </div>
</div>`;

describe('critiqueCanvasPage', () => {
  describe('check 1: unreplaced hero', () => {
    it('flags HERO_IMAGE_URL placeholder', () => {
      const html = '<img src="HERO_IMAGE_URL" alt="hero"><h2>Title</h2><p>Content with enough words to pass sparse check.</p>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'completeness' && f.priority === 'high')).toBe(true);
    });

    it('does not flag when hero URL is replaced', () => {
      const html = '<img src="https://example.com/hero.jpg" alt="hero"><h2>Title</h2>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'completeness' && f.issue.includes('placeholder'))).toBe(false);
    });
  });

  describe('check 2: wall of text', () => {
    it('flags paragraph over 80 words', () => {
      const longText = Array(85).fill('word').join(' ');
      const html = `<h2>Title</h2><p>${longText}</p>`;
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'content' && f.priority === 'high')).toBe(true);
    });

    it('does not flag paragraph at 80 words or fewer', () => {
      const text = Array(80).fill('word').join(' ');
      const html = `<h2>Title</h2><p>${text}</p>`;
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'content' && f.priority === 'high')).toBe(false);
    });
  });

  describe('check 3: no headings', () => {
    it('flags HTML with no H2 or H3', () => {
      const html = '<p>Some content without any heading elements.</p>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'hierarchy' && f.priority === 'high')).toBe(true);
    });

    it('does not flag HTML with H2', () => {
      const html = '<h2>Title</h2><p>Content.</p>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'hierarchy')).toBe(false);
    });

    it('does not flag HTML with H3', () => {
      const html = '<h3>Subtitle</h3><p>Content.</p>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'hierarchy')).toBe(false);
    });
  });

  describe('check 4: too sparse', () => {
    it('flags page with fewer than 100 words', () => {
      const html = '<h2>Hello</h2><p>Short page with just a few words.</p>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'content' && f.priority === 'medium')).toBe(true);
    });

    it('does not flag page at 100 words or more', () => {
      const text = Array(100).fill('word').join(' ');
      const html = `<h2>Title</h2><p>${text}</p>`;
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'content' && f.priority === 'medium')).toBe(false);
    });
  });

  describe('check 5: color chaos', () => {
    it('flags more than 7 distinct hex colors', () => {
      const colors = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888'];
      const html = colors.map(c => `<p style="color:${c};">text</p>`).join('') + '<h2>Title</h2>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'color')).toBe(true);
    });

    it('does not flag 7 or fewer distinct hex colors', () => {
      const colors = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'];
      const html = colors.map(c => `<p style="color:${c};">text</p>`).join('') + '<h2>Title</h2>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'color')).toBe(false);
    });
  });

  describe('check 6: font below floor', () => {
    it('flags font-size below 13px', () => {
      const html = '<h2>Title</h2><p style="font-size:11px;">Small text.</p>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'typography')).toBe(true);
    });

    it('does not flag font-size at 13px or above', () => {
      const html = '<h2>Title</h2><p style="font-size:13px;">Fine text.</p>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'typography')).toBe(false);
    });
  });

  describe('check 7: missing submission language', () => {
    it('flags assignment page with no submit/upload/due/deadline', () => {
      const text = Array(100).fill('word').join(' ');
      const html = `<h2>Assignment</h2><p>${text}</p>`;
      const result = critiqueCanvasPage({ html, pageType: 'assignment', primaryGoal: 'complete work' });
      expect(result.findings.some(f => f.area === 'completeness' && f.priority === 'medium')).toBe(true);
    });

    it('does not flag assignment page that contains "submit"', () => {
      const text = Array(100).fill('word').join(' ');
      const html = `<h2>Assignment</h2><p>${text}</p><p>Submit your work by Friday.</p>`;
      const result = critiqueCanvasPage({ html, pageType: 'assignment', primaryGoal: 'complete work' });
      expect(result.findings.some(f => f.area === 'completeness' && f.priority === 'medium')).toBe(false);
    });

    it('does not flag non-assignment page types', () => {
      const text = Array(100).fill('word').join(' ');
      const html = `<h2>Week Overview</h2><p>${text}</p>`;
      const result = critiqueCanvasPage({ html, pageType: 'week-overview', primaryGoal: 'learn' });
      expect(result.findings.some(f => f.area === 'completeness' && f.priority === 'medium')).toBe(false);
    });
  });

  describe('check 8: column imbalance', () => {
    it('flags two-column layout where wide column has 3x more words', () => {
      const manyWords = Array(120).fill('word').join(' ');
      const fewWords = Array(10).fill('word').join(' ');
      const html = `
        <h2>Title</h2>
        <div class="grid-row">
          <div class="col-md-8">${manyWords}</div>
          <div class="col-md-4">${fewWords}</div>
        </div>`;
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'layout')).toBe(true);
    });

    it('does not flag balanced two-column layout', () => {
      const html = `
        <h2>Title</h2>
        <div class="grid-row">
          <div class="col-md-8">Left column has the main instructions for the assignment and a few key details students need.</div>
          <div class="col-md-4">Right sidebar has grading notes rubric tips and office hours information for the class.</div>
        </div>`;
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'layout')).toBe(false);
    });

    it('does not flag HTML without two-column layout', () => {
      const html = '<h2>Title</h2><p>Single column page.</p>';
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      expect(result.findings.some(f => f.area === 'layout')).toBe(false);
    });
  });

  describe('score and strengths', () => {
    it('deducts 15 for high and 8 for medium findings → score 77', () => {
      // Triggers: checkNoHeadings (high, -15) + checkFontFloor (medium, -8)
      // Five paragraphs of 21 words each = 105 total (>= 100, so not sparse)
      // Each paragraph is 21 words (well under 80, so no wall-of-text)
      const para = Array(21).fill('word').join(' ');
      const html = `<p style="font-size:11px;">${para}</p>`.repeat(5);
      const result = critiqueCanvasPage({ html, pageType: 'other', primaryGoal: 'read' });
      const hasHigh = result.findings.some(f => f.priority === 'high');
      const hasMedium = result.findings.some(f => f.priority === 'medium');
      expect(hasHigh).toBe(true);
      expect(hasMedium).toBe(true);
      expect(result.score).toBe(100 - 15 - 8);
    });

    it('scores 85 or higher for clean HTML', () => {
      const result = critiqueCanvasPage({ html: CLEAN_HTML, pageType: 'assignment', primaryGoal: 'submit work' });
      expect(result.score).toBeGreaterThanOrEqual(85);
    });
  });

  describe('comprehensive mode', () => {
    it('returns kbContext string in comprehensive mode', () => {
      const result = critiqueCanvasPage({ html: CLEAN_HTML, pageType: 'assignment', primaryGoal: 'submit work', mode: 'comprehensive' });
      expect(typeof result.kbContext).toBe('string');
      expect(result.kbContext!.length).toBeGreaterThan(0);
    });

    it('does not return kbContext in quick mode', () => {
      const result = critiqueCanvasPage({ html: CLEAN_HTML, pageType: 'assignment', primaryGoal: 'submit work', mode: 'quick' });
      expect(result.kbContext).toBeUndefined();
    });
  });
});
