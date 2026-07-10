import { loadTemplate, loadTheme, loadPromptSet } from './registry.js';
import { canvasSafeTransform } from './transform.js';
import { auditAccessibility } from '../tools/accessibility.js';
import { runPolicyConformanceCheck } from '../tools/a11y/policy.js';
import { markdownToHtml } from '../tools/course-templates.js';
import type { CourseConfig, PageContent, LlmClient } from '../course-types.js';
import type { ConformanceReport } from '@canvas-toolchain/shared-types';

export interface RenderEngineInput {
  templateId: string;
  templateVersion?: string;
  themeId: string;
  themeVersion?: string;
  promptSetId: string;
  promptSetVersion?: string;
  content: PageContent;
  llmClient: LlmClient;
  config: CourseConfig;
  options?: {
    imageAssets?: Record<string, string>;
  };
}

export interface RenderEngineResult {
  finalHtml: string;
  unresolvedImagePrompts: Record<string, string>;
  violations: { issue: string; suggestion: string }[];
  accessibility: any[];
  conformance: ConformanceReport;
}

export function resolveCssTokens(css: string, colors: Record<string, string>, config?: CourseConfig): string {
  let resolved = css;
  const allColors = { ...colors, ...(config?.colors || {}) };
  for (const [k, v] of Object.entries(allColors)) {
    resolved = resolved.replace(new RegExp(`\\{\\{\\s*colors\\.${k}\\s*\\}\\}`, 'g'), v as string);
    resolved = resolved.replace(new RegExp(`\\{\\{\\s*theme\\.colors\\.${k}\\s*\\}\\}`, 'g'), v as string);
  }
  return resolved;
}

export function resolvePlaceholders(
  prompt: string,
  slotName: string,
  content: PageContent,
  config: CourseConfig
): string {
  let resolved = prompt;
  const topic = String(content.frontMatter.title || content.frontMatter.topic || '');
  resolved = resolved.replace(/\{\{\s*topic\s*\}\}/g, topic);
  resolved = resolved.replace(/\{\{\s*frontMatter\.title\s*\}\}/g, topic);
  resolved = resolved.replace(/\{\{\s*slotName\s*\}\}/g, slotName);
  resolved = resolved.replace(/\{\{\s*semester\s*\}\}/g, config.semester || '');
  resolved = resolved.replace(/\{\{\s*courseNumber\s*\}\}/g, config.courseNumber || '');
  resolved = resolved.replace(/\{\{\s*professor\s*\}\}/g, config.professor || '');
  return resolved;
}

export function parseLlmResponse(response: string, schema?: any): any {
  const trimmed = response.trim();
  try {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      if (obj.content) return obj.content;
      return obj;
    }
  } catch (e) {
    // Fall back to plain text
  }
  return trimmed;
}

const sectionHeadingMap: Record<string, string> = {
  'x-introduction': 'Introduction',
  'x-activities': "This Week's Activities",
  'x-course-introduction': 'Course Introduction',
  'x-what-you-will-learn': "What You'll Learn",
  'x-how-this-course-works': 'How This Course Works',
  'x-instructor': 'Instructor',
  'x-slides': 'Slides',
  'x-videos': 'Videos',
  'x-readings': 'Readings',
  'x-other': 'Other',
  'x-slide-deck': 'Slide Deck',
  'x-about-these-slides': 'About These Slides',
  'x-key-topics': 'Key Topics',
  'x-what-to-watch-for': 'What to Watch For',
  'x-rubric': 'Rubric',
  'x-submission-details': 'Submission Details',
  'x-what-we-are-doing': "What We're Doing",
  'x-instructions': 'Instructions',
  'x-time-deliverable': 'Time &amp; Deliverable',
  'x-timeline': 'Project Timeline',
  'x-team': 'Team',
  'x-setup': 'Setup',
  'x-tasks': 'Tasks',
  'x-deliverable': 'Deliverable',
  'x-the-reading': 'The Reading',
  'x-why-this-reading': 'Why This Reading',
  'x-as-you-read': 'As You Read',
  'x-quiz-details': 'Quiz Details',
  'x-topics-covered': 'Topics Covered',
  'x-access': 'Access',
  'x-submission': 'Submission',
  'x-requirements': 'Requirements',
  'x-grading': 'Grading',
  'x-opportunity': 'Opportunity',
  'x-points-deadline': 'Points &amp; Deadline'
};

export async function renderPageDecoupled(input: RenderEngineInput): Promise<RenderEngineResult> {
  const {
    templateId,
    templateVersion,
    themeId,
    themeVersion,
    promptSetId,
    promptSetVersion,
    content,
    llmClient,
    config,
    options,
  } = input;

  // 1. Load resources
  const template = loadTemplate(templateId, templateVersion);
  const theme = loadTheme(themeId, themeVersion);
  const promptSet = loadPromptSet(promptSetId, promptSetVersion);

  const colors = theme.themeJson.colors || {};
  const slotMap: Record<string, string> = {};
  const unresolvedImagePrompts: Record<string, string> = {};

  // 2. Iterate through slots
  for (const slot of template.manifest.slots) {
    const slotStyle = theme.themeJson.slotStyles[slot];
    const resolvedCss = resolveCssTokens(slotStyle?.css || '', colors, config);

    // Handle Image / Hero Slot Logic
    if (slot === 'hero') {
      const heroImage = options?.imageAssets?.hero || theme.themeJson.imageAssets?.hero || content.frontMatter.heroImage;
      if (!heroImage && slotStyle?.imagePrompt) {
        unresolvedImagePrompts['hero'] = resolvePlaceholders(slotStyle.imagePrompt, slot, content, config);
      }

      // Fetch dynamic title/subtitle from LLM prompt or fallback
      let title = content.frontMatter.title || '';
      let subtitle = '';
      const promptConfig = promptSet.promptsJson['hero'];

      if (promptConfig && llmClient) {
        const promptText = resolvePlaceholders(promptConfig.prompt, slot, content, config);
        try {
          const response = await llmClient.complete(promptText);
          const parsed = parseLlmResponse(response, promptConfig.outputSchema);
          if (typeof parsed === 'object') {
            title = parsed.title || title;
            subtitle = parsed.subtitle || subtitle;
          } else {
            title = parsed || title;
          }
        } catch (e) {
          // Fall back gracefully
        }
      }

      if (!title) {
        title = config.courseName || 'Welcome';
      }

      const bgStyle = heroImage
        ? `background: ${colors.primary || config.colors.primary} url('${heroImage}') center/cover no-repeat;`
        : `background-color: ${colors.primary || config.colors.primary};`;

      const weekStr = content.frontMatter.week && content.pageType !== 'front-page'
        ? `${config.courseNumber} &middot; Week ${String(content.frontMatter.week).padStart(2, '0')} &middot; ${config.semester}`
        : `${config.courseNumber} &middot; ${config.semester}`;

      slotMap['hero'] = `<div style="${bgStyle} ${resolvedCss}">
  <div>
    <p style="color: white; font-family: Lato, sans-serif; font-size: 12px; font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1.5px;">${weekStr}</p>
    <h2 style="color: white; font-family: Lato, sans-serif; font-size: 26px; font-weight: 700; margin: 0; line-height: 1.2;">${title}</h2>
    ${subtitle ? `<p style="color: white; font-family: Lato, sans-serif; font-size: 14px; margin: 6px 0 0 0;">${subtitle}</p>` : ''}
  </div>
</div>`;
      continue;
    }

    if (slot === 'callout') {
      let slotContent = '';
      if (content.sections && content.sections['Brief']) {
        slotContent = markdownToHtml(content.sections['Brief']);
      } else if (content.sections && content.sections['Learning Objectives']) {
        slotContent = markdownToHtml(content.sections['Learning Objectives']);
      } else if (content.sections && content.sections['Prompt']) {
        slotContent = markdownToHtml(content.sections['Prompt']);
      } else if (promptSet.promptsJson['callout'] && llmClient) {
        const promptConfig = promptSet.promptsJson['callout'];
        const promptText = resolvePlaceholders(promptConfig.prompt, slot, content, config);
        try {
          const response = await llmClient.complete(promptText);
          slotContent = parseLlmResponse(response, promptConfig.outputSchema);
        } catch (e) {
          slotContent = 'Placeholder Callout Content';
        }
      }

      let calloutHeading = 'Brief';
      if (content.pageType === 'overview') calloutHeading = 'Learning Objectives';
      else if (content.pageType === 'lab') calloutHeading = 'Objectives';
      else if (content.pageType === 'discussion-board') calloutHeading = 'Discussion Prompt';

      const calloutTitleHtml = `<h2 style="color: ${colors.primary || config.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">${calloutHeading}</h2>`;

      slotMap['callout'] = `<div style="background: #DBE7FF; ${resolvedCss}">
  ${calloutTitleHtml}
  <div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">
    ${slotContent}
  </div>
</div>`;
      continue;
    }

    // Normal Slots (e.g., x-introduction, x-activities)
    let slotContent = '';
    const sectionKey = sectionHeadingMap[slot];
    if (sectionKey && content.sections && content.sections[sectionKey]) {
      slotContent = markdownToHtml(content.sections[sectionKey]);
    } else {
      const promptConfig = promptSet.promptsJson[slot] || promptSet.promptsJson['body'];
      if (promptConfig && llmClient) {
        const promptText = resolvePlaceholders(promptConfig.prompt, slot, content, config);
        try {
          const response = await llmClient.complete(promptText);
          slotContent = parseLlmResponse(response, promptConfig.outputSchema);
        } catch (e) {
          slotContent = `Placeholder ${sectionKey || slot} content`;
        }
      }
    }

    if (slotContent) {
      const titleText = sectionHeadingMap[slot] || slot;
      slotMap[slot] = `<div style="${resolvedCss}">
  <h2 style="font-family: Lato, sans-serif; font-size: 18px; font-weight: 700; color: #1A1A1A; margin: 0 0 14px;">${titleText}</h2>
  <div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${slotContent}</div>
</div>`;
    } else {
      slotMap[slot] = '';
    }
  }

  // 3. Stitch slots into template's structureHtml
  let stitchedHtml = template.structureHtml;
  for (const slot of template.manifest.slots) {
    const val = slotMap[slot] || '';
    stitchedHtml = stitchedHtml.replace(new RegExp(`\\{\\{\\s*slot:${slot}\\s*\\}\\}`, 'g'), val);
  }

  // 4. Pipe stitched HTML and global CSS through canvasSafeTransform
  const transformResult = canvasSafeTransform(stitchedHtml, theme.themeJson.globalCss || '');

  // 5. Run accessibility audits
  const a11yResult = auditAccessibility(transformResult.html);
  const conformance = await runPolicyConformanceCheck(transformResult.html);

  return {
    finalHtml: transformResult.html,
    unresolvedImagePrompts,
    violations: transformResult.violations,
    accessibility: a11yResult,
    conformance,
  };
}
