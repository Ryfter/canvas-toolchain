import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('canvas-design-mcp/dist/tools/generate-page.js', () => ({
  generatePage: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/accessibility.js', () => ({
  auditAccessibility: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/redesign.js', () => ({
  redesignCanvasPage: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/validate.js', () => ({
  validateCanvasHtml: vi.fn(),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, writeFileSync: vi.fn() };
});

import { generatePage } from 'canvas-design-mcp/dist/tools/generate-page.js';
import { auditAccessibility } from 'canvas-design-mcp/dist/tools/accessibility.js';
import { redesignCanvasPage } from 'canvas-design-mcp/dist/tools/redesign.js';
import { validateCanvasHtml } from 'canvas-design-mcp/dist/tools/validate.js';
import { writeFileSync } from 'node:fs';
import { renderPageWithA11y } from '../../src/lib/page-renderer.js';

const mockGeneratePage = vi.mocked(generatePage);
const mockAuditAccessibility = vi.mocked(auditAccessibility);
const mockRedesignCanvasPage = vi.mocked(redesignCanvasPage);
const mockValidateCanvasHtml = vi.mocked(validateCanvasHtml);
const mockWriteFileSync = vi.mocked(writeFileSync);

const SAMPLE_PAGE_RESULT = {
  html: '<p>Hello world</p>',
  filename: 'assignment.html',
  weekNumber: 1,
  pageType: 'assignment' as const,
  savedTo: '/tmp/assignment.html',
};

const RESOLVED = {
  templateId: 'assignment',
  templateVersion: '1.0.0',
  themeId: 'cds-default',
  themeVersion: '1.0.0',
  promptSetId: 'cds-default',
  promptSetVersion: '1.0.0',
};

beforeEach(() => {
  mockGeneratePage.mockReturnValue(SAMPLE_PAGE_RESULT);
  mockRedesignCanvasPage.mockReturnValue({ html: SAMPLE_PAGE_RESULT.html, appliedFixes: [], skippedFindings: [] });
  mockAuditAccessibility.mockReturnValue([]);
  mockValidateCanvasHtml.mockReturnValue({ valid: true, violations: [] });
  mockWriteFileSync.mockReset();
});

describe('renderPageWithA11y()', () => {
  it('returns clean status when no warnings and no violations', async () => {
    const page = await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'Assignment 1', verdict: 'KEEP', resolved: RESOLVED });
    expect(page.status).toBe('clean');
    expect(page.needsReviewReasons).toBeUndefined();
    expect(page.autofixApplied).toBeUndefined();
  });

  it('returns needs-review when accessibility warnings are present', async () => {
    mockAuditAccessibility.mockReturnValue([
      { check: 'empty-alt', message: 'Content image has alt=""', context: '<img>' },
    ]);
    const page = await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'Assignment 1', verdict: 'KEEP', resolved: RESOLVED });
    expect(page.status).toBe('needs-review');
    expect(page.needsReviewReasons).toHaveLength(1);
    expect(page.needsReviewReasons![0]).toContain('empty-alt');
  });

  it('returns needs-review when validation violations are present', async () => {
    mockValidateCanvasHtml.mockReturnValue({
      valid: false,
      violations: [{ rule: 'No <style> blocks', context: '<style>' }],
    });
    const page = await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'Assignment 1', verdict: 'UPDATE', resolved: RESOLVED });
    expect(page.status).toBe('needs-review');
    expect(page.needsReviewReasons!.some((r) => r.startsWith('validation:'))).toBe(true);
  });

  it('records autofixApplied when redesign applies fixes', async () => {
    mockRedesignCanvasPage.mockReturnValue({
      html: '<p>Fixed</p>',
      appliedFixes: ['Bumped all font sizes below 13px to 13px'],
      skippedFindings: [],
    });
    const page = await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'Assignment 1', verdict: 'KEEP', resolved: RESOLVED });
    expect(page.autofixApplied).toEqual(['Bumped all font sizes below 13px to 13px']);
  });

  it('writes fixed HTML back to disk when autofix applied', async () => {
    mockRedesignCanvasPage.mockReturnValue({
      html: '<p>Fixed</p>',
      appliedFixes: ['Bumped all font sizes below 13px to 13px'],
      skippedFindings: [],
    });
    await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'Assignment 1', verdict: 'KEEP', resolved: RESOLVED });
    expect(mockWriteFileSync).toHaveBeenCalledWith(SAMPLE_PAGE_RESULT.savedTo, '<p>Fixed</p>', 'utf-8');
  });

  it('does not write to disk when no autofix applied', async () => {
    await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'Assignment 1', verdict: 'KEEP', resolved: RESOLVED });
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('passes templateId/themeId/promptSetId from resolved to generatePage', async () => {
    await renderPageWithA11y({
      briefPath: '/brief.md',
      assignmentName: 'Assignment 1',
      verdict: 'KEEP',
      resolved: { templateId: 'my-tpl', templateVersion: '2.0.0', themeId: 'my-theme', themeVersion: '1.5.0', promptSetId: 'my-ps', promptSetVersion: '3.0.0' },
    });
    expect(mockGeneratePage).toHaveBeenCalledWith(expect.objectContaining({
      templateId: 'my-tpl',
      themeId: 'my-theme',
      promptSetId: 'my-ps',
    }));
  });

  it('populates templateUsed/themeUsed/promptSetUsed from resolved', async () => {
    const page = await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'Assignment 1', verdict: 'ADD', resolved: RESOLVED });
    expect(page.templateUsed).toEqual({ id: 'assignment', version: '1.0.0' });
    expect(page.themeUsed).toEqual({ id: 'cds-default', version: '1.0.0' });
    expect(page.promptSetUsed).toEqual({ id: 'cds-default', version: '1.0.0' });
  });

  it('includes both accessibility and validation issues in needsReviewReasons', async () => {
    mockAuditAccessibility.mockReturnValue([
      { check: 'vague-link', message: '"click here" is not descriptive', context: '<a>' },
    ]);
    mockValidateCanvasHtml.mockReturnValue({
      valid: false,
      violations: [{ rule: 'No <script> tags', context: '<script>' }],
    });
    const page = await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'A1', verdict: 'UPDATE', resolved: RESOLVED });
    expect(page.needsReviewReasons).toHaveLength(2);
    expect(page.needsReviewReasons![0]).toContain('vague-link');
    expect(page.needsReviewReasons![1]).toContain('validation:');
  });
});
