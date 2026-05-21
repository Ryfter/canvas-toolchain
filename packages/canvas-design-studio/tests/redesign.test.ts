import { describe, expect, it } from 'vitest';
import { redesignCanvasPage } from '../src/tools/redesign.js';
import type { CritiqueFinding } from '../src/tools/critique.js';

const fontFinding: CritiqueFinding = {
  area: 'typography',
  issue: 'Font size 11px found — below the 13px minimum for mobile readability.',
  suggestion: 'Use a minimum of 13px for all visible text.',
  priority: 'medium',
};

const heroFinding: CritiqueFinding = {
  area: 'completeness',
  issue: 'Hero image placeholder has not been replaced.',
  suggestion: 'Replace HERO_IMAGE_URL with the URL of your hosted 1200×400px banner image.',
  priority: 'high',
};

const wallFinding: CritiqueFinding = {
  area: 'content',
  issue: 'A paragraph exceeds 80 words — hard for students to scan quickly.',
  suggestion: 'Break long paragraphs into bullet points or split across multiple section cards.',
  priority: 'high',
};

describe('redesignCanvasPage', () => {
  it('fixes font-size below 13px to 13px', () => {
    const html = '<h2>Title</h2><p style="font-size:11px;">Text.</p>';
    const result = redesignCanvasPage({ html, findings: [fontFinding] });
    expect(result.html).toContain('font-size:13px');
    expect(result.html).not.toContain('font-size:11px');
    expect(result.appliedFixes.length).toBeGreaterThan(0);
  });

  it('adds hero URL comment before the HERO_IMAGE_URL img tag', () => {
    const html = '<img src="HERO_IMAGE_URL" alt="hero"><h2>Title</h2>';
    const result = redesignCanvasPage({ html, findings: [heroFinding] });
    expect(result.html).toContain('<!-- Replace HERO_IMAGE_URL');
    expect(result.appliedFixes.length).toBeGreaterThan(0);
  });

  it('puts non-mechanical findings in skippedFindings', () => {
    const html = '<h2>Title</h2><p>Content.</p>';
    const result = redesignCanvasPage({ html, findings: [wallFinding] });
    expect(result.skippedFindings).toContain(wallFinding.suggestion);
    expect(result.appliedFixes).toHaveLength(0);
  });

  it('puts typography finding in skippedFindings when no sub-13px font exists', () => {
    const html = '<h2>Title</h2><p style="font-size:14px;">Normal size text.</p>';
    const result = redesignCanvasPage({ html, findings: [fontFinding] });
    expect(result.skippedFindings).toContain(fontFinding.suggestion);
    expect(result.appliedFixes).toHaveLength(0);
  });

  it('runs accessibility check and populates accessibilityWarnings for low-contrast html', () => {
    const html = '<h2>Title</h2><div style="background:#cccccc;color:#ffffff;">Low contrast text.</div>';
    const result = redesignCanvasPage({ html, findings: [] });
    expect(result.accessibilityWarnings).toBeDefined();
    expect(result.accessibilityWarnings!.length).toBeGreaterThan(0);
  });

  it('returns kbContext in comprehensive mode', () => {
    const html = '<h2>Title</h2><p>Content.</p>';
    const result = redesignCanvasPage({ html, findings: [], mode: 'comprehensive' });
    expect(typeof result.kbContext).toBe('string');
    expect(result.kbContext!.length).toBeGreaterThan(0);
  });
});
