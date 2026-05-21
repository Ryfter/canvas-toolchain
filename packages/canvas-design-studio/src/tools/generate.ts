import { resolveTokens } from '../design-engine.js';
import { validateCanvasHtml } from './validate.js';
import { auditAccessibility } from './accessibility.js';
import type { InstitutionConfig } from '../types.js';

export interface GenerateInput {
  assignmentBrief: string;
  courseName: string;
  courseNumber: string;
  assignmentNumber: string;
  professorName: string;
  semester: string;
  styleNotes?: string;
}

export interface GenerateOutput {
  html: string;
  heroImagePrompt: string;
  filename: string;
  warnings: string[];
}

function buildStatBadge(value: string, label: string): string {
  return (
    `<div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 16px;` +
    `margin-right:10px;margin-bottom:8px;text-align:center;color:#ffffff;">` +
    `<div style="font-size:22px;font-weight:700;font-family:Lato,sans-serif;">${value}</div>` +
    `<div style="font-size:11px;color:rgba(255,255,255,0.85);font-family:Lato,sans-serif;">${label}</div>` +
    `</div>`
  );
}

function buildSectionCard(label: string, content: string, accentColor: string): string {
  return (
    `<div style="background:#ffffff;border-radius:10px;border:1px solid #e0e0d8;padding:20px 24px;margin-bottom:14px;">` +
    `<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;` +
    `color:${accentColor};margin-bottom:8px;font-family:Lato,sans-serif;">${label}</div>` +
    content +
    `</div>`
  );
}

function buildSidebarCard(title: string, content: string, bgColor: string, textColor: string): string {
  return (
    `<div style="background:${bgColor};border-radius:10px;padding:16px 20px;margin-bottom:12px;border:1px solid #e0e0d8;">` +
    `<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;` +
    `color:${textColor};margin-bottom:8px;font-family:Lato,sans-serif;">${title}</div>` +
    content +
    `</div>`
  );
}

export function generateCanvasPage(input: GenerateInput, config: InstitutionConfig): GenerateOutput {
  const { courseNumber, assignmentNumber, courseName, assignmentBrief, professorName, semester } = input;

  const lines = assignmentBrief.split('\n').filter(l => l.trim());
  const overview = lines.slice(0, 3).join(' ').trim();
  const details = lines.slice(3);

  const overviewContent = `<p style="font-size:15px;color:#1A1A1A;line-height:1.65;margin:0;font-family:Lato,sans-serif;">${overview}</p>`;

  const detailItems = details
    .map(line =>
      `<div style="display:flex;align-items:flex-start;margin-bottom:10px;">` +
      `<span style="color:${config.colors.secondary};font-weight:700;font-size:16px;margin-right:10px;line-height:1.4;">&rarr;</span>` +
      `<p style="font-size:14px;color:#1A1A1A;margin:0;line-height:1.65;font-family:Lato,sans-serif;">${line.replace(/^[-*]\s*/, '')}</p>` +
      `</div>`
    )
    .join('\n');

  const leftContent =
    buildSectionCard('Overview', overviewContent, config.colors.primary) +
    (detailItems ? buildSectionCard('Details', detailItems, config.colors.primary) : '');

  const gradingContent =
    `<div style="border-left:3px solid ${config.colors.secondary};padding-left:12px;">` +
    `<p style="font-size:14px;color:#1A1A1A;line-height:1.65;margin:0;font-family:Lato,sans-serif;">See rubric in Canvas for grading criteria.</p>` +
    `</div>`;

  const rightContent =
    `<div style="background:${config.colors.primary};border-radius:10px;padding:20px;margin-bottom:12px;">` +
    `<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;` +
    `color:rgba(255,255,255,0.7);margin-bottom:12px;font-family:Lato,sans-serif;">What to Submit</div>` +
    `<p style="color:rgba(255,255,255,0.85);font-size:13px;font-family:Lato,sans-serif;">Submit via Canvas. Check the assignment for specific requirements.</p>` +
    `</div>` +
    buildSidebarCard('Grading', gradingContent, '#ffffff', '#555550');

  const statBadges =
    buildStatBadge(professorName, 'Professor') +
    buildStatBadge(semester, 'Semester');

  const html = buildFullPage({
    courseNumber,
    assignmentNumber,
    courseName,
    subtitle: `${courseNumber} &middot; ${semester}`,
    heroAlt: `${courseName} assignment hero image`,
    statBadges,
    leftContent,
    rightContent,
  }, config);

  const validation = validateCanvasHtml(html);
  const a11y = auditAccessibility(html);
  const warnings = [
    ...validation.violations.map(v => v.rule),
    ...a11y.map(w => `a11y: ${w.check} — ${w.message}`),
  ];

  const heroImagePrompt =
    `A cinematic wide-format banner image for a university course assignment about ${courseName}. ` +
    `Show a dynamic, professional academic workspace. Color palette dominated by ${config.colors.primary} ` +
    `with accent highlights in ${config.colors.secondary}. ` +
    `Clean, professional, slightly cinematic mood. No text. No people. Horizontal format, 3:1 aspect ratio, high resolution.`;

  const filename = `${courseNumber.toLowerCase().replace(/\s+/g, '-')}-${assignmentNumber}-page.html`;

  return { html, heroImagePrompt, filename, warnings };
}

interface PageTokens {
  courseNumber: string;
  assignmentNumber: string;
  courseName: string;
  subtitle: string;
  heroAlt: string;
  statBadges: string;
  leftContent: string;
  rightContent: string;
}

function buildFullPage(tokens: PageTokens, config: InstitutionConfig): string {
  const resolved = resolveTokens(
    '{{colors.primaryDark}}|{{colors.primary}}|{{colors.secondary}}',
    config
  ).split('|');
  const [primaryDark, primary, secondary] = resolved;

  return `<!-- Canvas Design Studio — Generated Page -->
<!-- Canvas-safe: inline styles only, no scripts, no gap, no box-shadow -->
<div style="max-width:860px;margin:0 auto;font-family:Lato,sans-serif;background:#F4F3EF;padding:16px;">

  <!-- HERO BANNER -->
  <div style="background:linear-gradient(135deg,${primaryDark} 0%,${primary} 60%,#1A5BCC 100%);border-radius:14px;overflow:hidden;margin-bottom:20px;">
    <img src="HERO_IMAGE_URL" alt="${tokens.heroAlt}" style="width:100%;height:200px;object-fit:cover;display:block;border-radius:14px 14px 0 0;">
    <div style="padding:28px 32px;">
      <div style="display:inline-block;background:${secondary};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:3px 12px;border-radius:20px;margin-bottom:10px;">${tokens.courseNumber} &middot; ${tokens.assignmentNumber}</div>
      <h2 style="color:#ffffff;font-size:28px;font-weight:700;line-height:1.2;margin:0 0 6px 0;font-family:Lato,sans-serif;">${tokens.courseName}</h2>
      <p style="color:rgba(255,255,255,0.85);font-size:15px;font-weight:400;margin:0 0 20px 0;font-family:Lato,sans-serif;">${tokens.subtitle}</p>
      <div style="display:flex;flex-wrap:wrap;">${tokens.statBadges}</div>
    </div>
  </div>

  <!-- TWO-COLUMN BODY -->
  <div class="content-box">
    <div class="grid-row">
      <div class="col-xs-12 col-md-8" style="padding-right:12px;">${tokens.leftContent}</div>
      <div class="col-xs-12 col-md-4">${tokens.rightContent}</div>
    </div>
  </div>

</div>`;
}
