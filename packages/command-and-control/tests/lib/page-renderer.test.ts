import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@canvas-toolchain/canvas-design-studio/dist/tools/generate-page.js', () => ({
  generatePage: vi.fn(),
}));
vi.mock('@canvas-toolchain/canvas-design-studio/dist/tools/redesign.js', () => ({
  redesignCanvasPage: vi.fn(),
}));
vi.mock('@canvas-toolchain/canvas-design-studio/dist/tools/validate.js', () => ({
  validateCanvasHtml: vi.fn(),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, writeFileSync: vi.fn() };
});

import { generatePage } from '@canvas-toolchain/canvas-design-studio/dist/tools/generate-page.js';
import type { AccessibilityFinding, ConformanceReport } from '@canvas-toolchain/shared-types';
import { redesignCanvasPage } from '@canvas-toolchain/canvas-design-studio/dist/tools/redesign.js';
import { validateCanvasHtml } from '@canvas-toolchain/canvas-design-studio/dist/tools/validate.js';
import { writeFileSync } from 'node:fs';
import { renderPageWithA11y } from '../../src/lib/page-renderer.js';

const mockGeneratePage = vi.mocked(generatePage);

function report(findings: AccessibilityFinding[] = []): ConformanceReport {
  return {
    requiredLevel: { version: '2.1', level: 'AA' },
    verdict: findings.length > 0 ? 'fail' : 'pass',
    findings,
    advisories: [],
    criteria: [],
  };
}

function finding(sc: string, scName: string, message: string): AccessibilityFinding {
  return { sc, scName, scVersion: '2.0', level: 'A', severity: 'error', engine: 'in-house', message };
}
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
  mockRedesignCanvasPage.mockResolvedValue({ html: SAMPLE_PAGE_RESULT.html, appliedFixes: [], skippedFindings: [], conformance: report() });
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
    mockRedesignCanvasPage.mockResolvedValue({
      html: SAMPLE_PAGE_RESULT.html, appliedFixes: [], skippedFindings: [],
      conformance: report([finding('1.1.1', 'Non-text Content', 'Content image has alt=""')]),
    });
    const page = await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'Assignment 1', verdict: 'KEEP', resolved: RESOLVED });
    expect(page.status).toBe('needs-review');
    expect(page.needsReviewReasons).toHaveLength(1);
    expect(page.needsReviewReasons![0]).toContain('1.1.1');
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
    mockRedesignCanvasPage.mockResolvedValue({
      html: '<p>Fixed</p>',
      appliedFixes: ['Bumped all font sizes below 13px to 13px'],
      skippedFindings: [],
      conformance: report(),
    });
    const page = await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'Assignment 1', verdict: 'KEEP', resolved: RESOLVED });
    expect(page.autofixApplied).toEqual(['Bumped all font sizes below 13px to 13px']);
  });

  it('writes fixed HTML back to disk when autofix applied', async () => {
    mockRedesignCanvasPage.mockResolvedValue({
      html: '<p>Fixed</p>',
      appliedFixes: ['Bumped all font sizes below 13px to 13px'],
      skippedFindings: [],
      conformance: report(),
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
    mockRedesignCanvasPage.mockResolvedValue({
      html: SAMPLE_PAGE_RESULT.html, appliedFixes: [], skippedFindings: [],
      conformance: report([finding('2.4.4', 'Link Purpose (In Context)', '"click here" is not descriptive')]),
    });
    mockValidateCanvasHtml.mockReturnValue({
      valid: false,
      violations: [{ rule: 'No <script> tags', context: '<script>' }],
    });
    const page = await renderPageWithA11y({ briefPath: '/brief.md', assignmentName: 'A1', verdict: 'UPDATE', resolved: RESOLVED });
    expect(page.needsReviewReasons).toHaveLength(2);
    expect(page.needsReviewReasons![0]).toContain('2.4.4');
    expect(page.needsReviewReasons![1]).toContain('validation:');
  });
});
