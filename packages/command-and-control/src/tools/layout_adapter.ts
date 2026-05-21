import * as cheerio from 'cheerio';
import { canvasSafeTransform, auditAccessibility } from 'canvas-design-mcp';
import { installResourceAtomically } from '../registry/local_registry.js';
import type { ResourceManifest } from '../registry/local_registry.js';

export interface AdaptedLayout {
  /** Canvas-safe HTML, fully inlined, validated. */
  canvasSafeHtml: string;
  /** Map from slot name to the HTML fragment that fills it. */
  slotMap: Record<string, string>;
  /** Anything the transform removed. */
  removed: { tag: string; reason: string }[];
  /** Violations the transform couldn't fix. */
  violations: { issue: string; suggestion: string }[];
  /** Accessibility audit findings. */
  accessibility: { warnings: string[]; errors: string[] };
}

export interface PasteLayoutInput {
  html: string;
  css?: string;
  sourceTool?: string;
  intent?: string;
  desiredSlots?: string[];
}

export interface SaveLayoutAsTemplateInput {
  layout: AdaptedLayout;
  templateId: string;
  templateVersion: string;
}

export function parseAndExtract(html: string): { slotMap: Record<string, string>; structureHtml: string } {
  const slotMap: Record<string, string> = {};
  const $ = cheerio.load(html, null, false);

  // Helper to replace an element with a slot placeholder and save it
  function saveSlot(slotName: string, element: cheerio.Cheerio<any>) {
    if (!slotMap[slotName]) {
      slotMap[slotName] = $(element).prop('outerHTML') || '';
      $(element).replaceWith(`{{slot:${slotName}}}`);
    }
  }

  // 1. Adapter-hint or explicit markup: [data-slot]
  $('[data-slot]').each((_, el) => {
    const name = $(el).attr('data-slot');
    if (name) {
      saveSlot(name, $(el));
    }
  });

  // Classes and IDs
  $('.hero, #hero, [class*="hero-"]').each((_, el) => {
    saveSlot('hero', $(el));
  });

  $('.callout, #callout, [class*="callout-"]').each((_, el) => {
    saveSlot('callout', $(el));
  });

  // 2. Identify Hero heuristically by styled visual properties or containers
  if (!slotMap['hero']) {
    let heroEl: cheerio.Cheerio<any> | null = null;

    $('div, header, section').each((_, el) => {
      if (heroEl) return;
      const style = $(el).attr('style') || '';
      const className = $(el).attr('class') || '';
      const hasBgUrl = /url\(/i.test(style);
      const hasHeroClass = /hero|banner/i.test(className);
      const hasBigFont = /font-size:\s*26px/i.test(style);
      const containsHeading = $(el).find('h1, h2, h3').length > 0;
      
      if ((hasBgUrl || hasHeroClass || hasBigFont) && containsHeading) {
        heroEl = $(el);
      }
    });

    if (!heroEl) {
      // Fallback to first heading
      $('h1, h2, h3').each((_, el) => {
        if (heroEl) return;
        const style = $(el).attr('style') || '';
        const isBigH2 = /font-size:\s*26px/i.test(style);
        const parent = $(el).parent();
        const parentStyle = parent.attr('style') || '';
        const parentClass = parent.attr('class') || '';
        const parentHasBg = /background/i.test(parentStyle);
        const parentHasHeroClass = /hero|banner/i.test(parentClass);
        
        // Exclude callouts and generic containers wrapping other headings
        const parentIsCallout = /callout/i.test(parentClass) || /#DBE7FF|rgb\(219,\s*231,\s*255\)/i.test(parentStyle);
        const siblingHeadings = parent.length ? parent.find('h1, h2, h3').filter((_, child) => child !== el) : [];
        const hasOtherHeadings = siblingHeadings.length > 0;

        if (parent.length && parent[0].tagName !== 'body' && !hasOtherHeadings && !parentIsCallout && (parentHasBg || parentHasHeroClass)) {
          heroEl = parent;
        } else if (isBigH2 || el.tagName.toLowerCase() === 'h1') {
          heroEl = $(el);
        }
      });
    }

    if (heroEl) {
      saveSlot('hero', heroEl);
    }
  }

  // 3. Identify Callout boxes
  $('div, aside, section').each((_, el) => {
    if (slotMap['callout']) return;
    // Skip if inside an already replaced slot
    const outer = $(el).prop('outerHTML') || '';
    if (outer.includes('{{slot:')) return;

    const style = $(el).attr('style') || '';
    const className = $(el).attr('class') || '';
    const hasCalloutColor = /#DBE7FF|rgb\(219,\s*231,\s*255\)/i.test(style);
    const hasCalloutClass = /callout/i.test(className);
    const hasBorder = /border/i.test(style);
    
    if (hasCalloutColor || hasCalloutClass || hasBorder) {
      saveSlot('callout', $(el));
    }
  });

  // 4. Identify Standard Sections (headings-based heuristics)
  const sectionHeadingMap: Record<string, string> = {
    'introduction': 'x-introduction',
    'activities': 'x-activities',
    'course introduction': 'x-course-introduction',
    'what you will learn': 'x-what-you-will-learn',
    'learning objectives': 'x-what-you-will-learn',
    'how this course works': 'x-how-this-course-works',
    'instructor': 'x-instructor',
    'slides': 'x-slides',
    'videos': 'x-videos',
    'readings': 'x-readings',
    'other': 'x-other',
    'slide deck': 'x-slide-deck',
    'about these slides': 'x-about-these-slides',
    'key topics': 'x-key-topics',
    'what to watch for': 'x-what-to-watch-for',
    'rubric': 'x-rubric',
    'submission details': 'x-submission-details',
    'what we are doing': 'x-what-we-are-doing',
    'instructions': 'x-instructions',
    'time & deliverable': 'x-time-deliverable',
    'time and deliverable': 'x-time-deliverable',
    'project timeline': 'x-timeline',
    'timeline': 'x-timeline',
    'team': 'x-team',
    'setup': 'x-setup',
    'tasks': 'x-tasks',
    'deliverable': 'x-deliverable',
    'the reading': 'x-the-reading',
    'why this reading': 'x-why-this-reading',
    'as you read': 'x-as-you-read',
    'quiz details': 'x-quiz-details',
    'topics covered': 'x-topics-covered',
    'access': 'x-access',
    'submission': 'x-submission',
    'requirements': 'x-requirements',
    'grading': 'x-grading',
    'opportunity': 'x-opportunity',
    'points & deadline': 'x-points-deadline',
    'points and deadline': 'x-points-deadline',
  };

  $('h2, h3').each((_, headingEl) => {
    const outer = $(headingEl).prop('outerHTML') || '';
    if (outer.includes('{{slot:')) return;

    const headingText = $(headingEl).text().trim();
    if (!headingText) return;

    const lowerText = headingText.toLowerCase();
    let slotKey: string | null = null;

    for (const [key, value] of Object.entries(sectionHeadingMap)) {
      if (lowerText === key || lowerText.includes(key)) {
        slotKey = value;
        break;
      }
    }

    if (!slotKey) {
      const slug = headingText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      if (slug) {
        slotKey = slug.startsWith('x-') ? slug : `x-${slug}`;
      }
    }

    if (slotKey && !slotMap[slotKey]) {
      const collected: any[] = [];
      let sibling = $(headingEl).next();
      while (sibling.length > 0) {
        const tagName = (sibling[0].tagName || '').toLowerCase();
        if (tagName === 'h1' || tagName === 'h2' || (tagName === 'h3' && headingEl.tagName.toLowerCase() === 'h3')) {
          break;
        }
        collected.push(sibling);
        sibling = sibling.next();
      }

      const headingHtml = $(headingEl).prop('outerHTML') || '';
      const siblingsHtml = collected.map(s => $(s).prop('outerHTML') || '').join('\n');
      
      const slotContent = `${headingHtml}\n${siblingsHtml}`.trim();
      slotMap[slotKey] = slotContent;

      $(headingEl).replaceWith(`{{slot:${slotKey}}}`);
      for (const s of collected) {
        $(s).remove();
      }
    }
  });

  // 5. Leftover content goes to "body" if substantial
  const bodyHtml = $.html().trim();
  if (bodyHtml) {
    const cleanBodyHtml = bodyHtml.replace(/\{\{\s*slot:.*?\s*\}\}/g, '').trim();
    if (cleanBodyHtml) {
      const $test = cheerio.load(cleanBodyHtml, null, false);
      const remainingText = $test.text().trim();
      const hasVisualElements = $test('img, iframe, video, audio, table, canvas, hr').length > 0;
      
      if (remainingText.length > 0 || hasVisualElements) {
        slotMap['body'] = bodyHtml;
        $.root().empty().append('{{slot:body}}');
      }
    }
  }

  return {
    slotMap,
    structureHtml: $.html().trim(),
  };
}

export function extractSlotsHeuristically(html: string): Record<string, string> {
  return parseAndExtract(html).slotMap;
}

export async function pasteLayout(input: PasteLayoutInput): Promise<AdaptedLayout> {
  const transformResult = canvasSafeTransform(input.html, input.css);

  const { slotMap } = parseAndExtract(transformResult.html);

  const a11yWarnings = auditAccessibility(transformResult.html);
  const warnings = [
    ...a11yWarnings.map(w => w.context ? `${w.message} [Context: ${w.context}]` : w.message),
    ...transformResult.violations.map(v => `${v.issue}: ${v.suggestion}`)
  ];

  return {
    canvasSafeHtml: transformResult.html,
    slotMap,
    removed: transformResult.removed,
    violations: transformResult.violations,
    accessibility: {
      warnings,
      errors: [],
    },
  };
}

export async function saveLayoutAsTemplate(input: SaveLayoutAsTemplateInput): Promise<{ installedPath: string }> {
  const { layout, templateId, templateVersion } = input;

  if (!templateId || !templateVersion) {
    throw new Error('templateId and templateVersion are required to save layout as a template.');
  }

  const { structureHtml } = parseAndExtract(layout.canvasSafeHtml);

  // 2. Prepare manifest
  const manifest: ResourceManifest = {
    schemaVersion: 1,
    kind: 'template',
    id: templateId,
    version: templateVersion,
    tier: 'free',
    tags: ['custom', 'adapted'],
    files: ['structure.html', 'slots.json'],
    dependencies: [],
  };

  // 3. Prepare slots structure
  const slotsObj: Record<string, { required: boolean }> = {};
  for (const slotName of Object.keys(layout.slotMap)) {
    slotsObj[slotName] = { required: true };
  }

  // 4. Install resource atomically
  const result = installResourceAtomically({
    manifest,
    source: 'stitch-paste',
    files: [
      { path: 'structure.html', contents: structureHtml },
      { path: 'slots.json', contents: JSON.stringify(slotsObj, null, 2) + '\n' }
    ]
  });

  return {
    installedPath: result.entry.path,
  };
}
