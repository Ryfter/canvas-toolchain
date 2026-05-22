import { writeFileSync } from 'node:fs';
import { generatePage } from 'canvas-design-mcp/dist/tools/generate-page.js';
import { auditAccessibility } from 'canvas-design-mcp/dist/tools/accessibility.js';
import { redesignCanvasPage } from 'canvas-design-mcp/dist/tools/redesign.js';
import { validateCanvasHtml } from 'canvas-design-mcp/dist/tools/validate.js';
import type { UpdateCourseMaterialsPage, Verdict } from '@canvas-toolchain/shared-types';
import type { ResolvedResources } from './verdict-template-resolver.js';

export interface RenderPageInput {
  briefPath: string;
  assignmentName: string;
  verdict: Verdict;
  resolved: ResolvedResources;
  outputDir?: string;
  courseDir?: string;
}

/**
 * Renders one assignment brief to HTML, applies mechanical CSS fixes, audits
 * accessibility + Canvas validation, and returns a fully populated page record.
 *
 * Mechanical fixes (font floor, hero URL placeholder) are applied via
 * redesignCanvasPage. Remaining accessibility warnings and any Canvas
 * validation violations are surfaced as needsReviewReasons with status
 * 'needs-review'. A page with zero issues gets status 'clean'.
 */
export function renderPageWithA11y(input: RenderPageInput): UpdateCourseMaterialsPage {
  const { briefPath, assignmentName, verdict, resolved, outputDir, courseDir } = input;

  const pageResult = generatePage({
    mdPath: briefPath,
    courseDir,
    outputDir,
    templateId: resolved.templateId,
    themeId: resolved.themeId,
    promptSetId: resolved.promptSetId,
  });

  // Apply mechanical CSS fixes (font floor below 13px, hero URL placeholder comment)
  const redesignResult = redesignCanvasPage({ html: pageResult.html, findings: [], mode: 'quick' });
  const autofixApplied = redesignResult.appliedFixes;
  const html = redesignResult.html;

  if (autofixApplied.length > 0) {
    writeFileSync(pageResult.savedTo, html, 'utf-8');
  }

  // Audit fixed HTML for accessibility and Canvas constraints
  const warnings = auditAccessibility(html);
  const validationResult = validateCanvasHtml(html);

  const needsReviewReasons: string[] = [
    ...warnings.map((w) => `${w.check}: ${w.message}`),
    ...validationResult.violations.map((v) => `validation: ${v.rule}`),
  ];

  const status: UpdateCourseMaterialsPage['status'] = needsReviewReasons.length > 0 ? 'needs-review' : 'clean';

  return {
    assignmentName,
    verdict,
    templateUsed: { id: resolved.templateId, version: resolved.templateVersion },
    themeUsed: { id: resolved.themeId, version: resolved.themeVersion },
    promptSetUsed: { id: resolved.promptSetId, version: resolved.promptSetVersion },
    htmlPath: pageResult.savedTo,
    status,
    ...(needsReviewReasons.length > 0 && { needsReviewReasons }),
    ...(autofixApplied.length > 0 && { autofixApplied }),
  };
}
