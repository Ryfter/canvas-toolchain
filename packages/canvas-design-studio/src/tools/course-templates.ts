import { readFileSync } from 'node:fs';
import type { CourseConfig, PageContent, PageFrontMatter, PageType } from '../course-types.js';
import { loadTemplate } from '../utils/registry.js';

export function markdownToHtml(md: string): string {
  const trimmed = md.trim();
  if (!trimmed) return '';

  const lines = trimmed.split('\n');
  const htmlLines: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith('- ')) {
      if (!inList) { htmlLines.push('<ul style="margin: 0; padding-left: 20px;">'); inList = true; }
      const inner = inlineMarkdown(line.slice(2));
      htmlLines.push(`  <li style="margin-bottom: 4px;">${inner}</li>`);
    } else {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      if (line === '') {
        htmlLines.push('');
      } else {
        htmlLines.push(`<p style="margin: 0 0 10px;">${inlineMarkdown(line)}</p>`);
      }
    }
  }
  if (inList) htmlLines.push('</ul>');
  return htmlLines.join('\n');
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" style="color: inherit;">$1</a>');
}

function parseFrontMatterSimple(yaml: string): PageFrontMatter {
  const result: PageFrontMatter = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^([a-z_]+):\s*"?([^"]*)"?\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === 'week')   { const p = parseInt(val, 10); result.week   = Number.isNaN(p) ? undefined : p; continue; }
    if (key === 'points') { const p = parseInt(val, 10); result.points = Number.isNaN(p) ? undefined : p; continue; }
    if (key === 'hero_image') { result.heroImage = val || undefined; continue; }
    if (key === 'assignment_number') { result.assignmentNumber = val || undefined; continue; }
    if (key === 'title')  { result.title = val || undefined; continue; }
    if (key === 'due')    { result.due = val || undefined; continue; }
    if (key === 'team')              { result.team = val === 'true'; continue; }
    if (key === 'timeline')          { result.timeline = val === 'true'; continue; }
    (result as Record<string, string | number | boolean | undefined>)[key] = val || undefined;
  }
  return result;
}

export function parsePageContent(filePath: string, pageType: PageType): PageContent {
  const raw = readFileSync(filePath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontMatter = fmMatch ? parseFrontMatterSimple(fmMatch[1]) : {};
  const body = fmMatch ? fmMatch[2] : raw;

  const sections: Record<string, string> = {};
  const sectionRegex = /^## (.+)$/gm;
  let lastKey = '';
  let lastIndex = 0;
  let match;

  while ((match = sectionRegex.exec(body)) !== null) {
    if (lastKey) {
      sections[lastKey] = body.slice(lastIndex, match.index).trim();
    }
    lastKey = match[1].trim();
    lastIndex = match.index + match[0].length + 1;
  }
  if (lastKey) sections[lastKey] = body.slice(lastIndex).trim();

  return { pageType, frontMatter, sections };
}

function heroHtml(
  config: CourseConfig,
  pageType: PageType,
  week: number | undefined,
  title: string,
  subtitle: string,
  perPageHeroImage?: string,
): string {
  const heroImage = perPageHeroImage?.trim() ||
    config.heroImages[pageType]?.trim() || '';
  const bg = heroImage
    ? `background: ${config.colors.primary} url('${heroImage}') center/cover no-repeat;`
    : `background-color: ${config.colors.primary};`;
  const weekLabel = week && pageType !== 'front-page'
    ? `${config.courseNumber} &middot; Week ${String(week).padStart(2, '0')} &middot; ${config.semester}`
    : `${config.courseNumber} &middot; ${config.semester}`;

  return `<div style="${bg} min-height: 180px; display: flex; align-items: flex-end; padding: 24px; border-radius: 10px; margin-bottom: 24px;">
    <div>
      <p style="color: white; font-family: Lato, sans-serif; font-size: 12px; font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1.5px;">${weekLabel}</p>
      <h2 style="color: white; font-family: Lato, sans-serif; font-size: 26px; font-weight: 700; margin: 0; line-height: 1.2;">${title}</h2>
      ${subtitle ? `<p style="color: white; font-family: Lato, sans-serif; font-size: 15px; margin: 8px 0 0;">${subtitle}</p>` : ''}
    </div>
  </div>`;
}

function card(content: string, style = ''): string {
  return `<div style="background: white; border: 1px solid #e0e0d8; border-radius: 8px; padding: 24px; margin-bottom: 20px;${style}">${content}</div>`;
}

function sectionHeading(text: string): string {
  return `<h2 style="font-family: Lato, sans-serif; font-size: 18px; font-weight: 700; color: #1A1A1A; margin: 0 0 14px;">${text}</h2>`;
}

function callout(content: string, config: CourseConfig): string {
  return `<div style="background: ${config.colors.primaryLight}; border-left: 4px solid ${config.colors.primary}; border-radius: 0 8px 8px 0; padding: 20px 24px; margin-bottom: 20px;">${content}</div>`;
}

function objectivesHeading(config: CourseConfig): string {
  return `<h2 style="color: ${config.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Learning Objectives</h2>`;
}

function renderOverview(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || `Week ${String(week ?? '').padStart(2, '0')} Overview`;
  return wrap([
    heroHtml(cfg, 'overview', week, title, '', c.frontMatter.heroImage),
    callout(
      objectivesHeading(cfg) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">
        ${markdownToHtml(c.sections['Learning Objectives'] ?? '')}
      </div>`,
      cfg,
    ),
    card(
      sectionHeading('Introduction') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Introduction'] ?? '')}</div>`
    ),
    card(
      sectionHeading("This Week's Activities") +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Activities'] ?? '')}</div>`
    ),
  ]);
}

function renderFrontPage(c: PageContent, cfg: CourseConfig): string {
  const title = c.frontMatter.title || cfg.courseName;
  return wrap([
    heroHtml(cfg, 'front-page', undefined, title, cfg.semester, c.frontMatter.heroImage),
    card(
      sectionHeading('Course Introduction') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Course Introduction'] ?? '')}</div>`
    ),
    card(
      sectionHeading("What You'll Learn") +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections["What You'll Learn"] ?? '')}</div>`
    ),
    card(
      sectionHeading('How This Course Works') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['How This Course Works'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Instructor') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Instructor'] ?? '')}</div>`
    ),
  ]);
}

function renderResources(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || `Week ${String(week ?? '').padStart(2, '0')} Resources`;
  return wrap([
    heroHtml(cfg, 'resources', week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('Slides') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Slides'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Videos') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Videos'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Readings') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Readings'] ?? '')}</div>`
    ),
    c.sections['Other'] ? card(
      sectionHeading('Other') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Other'])}</div>`
    ) : '',
  ]);
}

function renderSlides(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || `Week ${String(week ?? '').padStart(2, '0')} Slides`;
  return wrap([
    heroHtml(cfg, 'slides', week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('Slide Deck') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Slide Deck'] ?? '')}</div>`
    ),
    c.sections['About These Slides'] ? card(
      sectionHeading('About These Slides') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['About These Slides'])}</div>`
    ) : '',
    c.sections['Key Topics'] ? card(
      sectionHeading('Key Topics') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Key Topics'])}</div>`
    ) : '',
  ]);
}

function renderVideos(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || `Week ${String(week ?? '').padStart(2, '0')} Videos`;
  return wrap([
    heroHtml(cfg, 'videos', week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('Videos') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Videos'] ?? '')}</div>`
    ),
    c.sections['What to Watch For'] ? card(
      sectionHeading('What to Watch For') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['What to Watch For'])}</div>`
    ) : '',
  ]);
}

function renderAssignment(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const assignNum = c.frontMatter.assignmentNumber ?? '';
  const due = c.frontMatter.due ?? '';
  const points = c.frontMatter.points ?? '';
  const title = c.frontMatter.title || `Assignment ${assignNum}`;
  const meta = [due ? `Due: ${due}` : '', points ? `${points} points` : ''].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return wrap([
    heroHtml(cfg, 'assignment', week, title, meta, c.frontMatter.heroImage),
    callout(
      `<h2 style="color: ${cfg.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Brief</h2>` +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(c.sections['Brief'] ?? '')}</div>`,
      cfg,
    ),
    c.sections['Rubric'] ? card(
      sectionHeading('Rubric') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Rubric'])}</div>`
    ) : '',
    card(
      sectionHeading('Submission Details') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Submission Details'] ?? '')}</div>`
    ),
  ]);
}

function renderEngageAssignment(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Engage Assignment';
  return wrap([
    heroHtml(cfg, 'engage-assignment', week, title, 'In-Class Activity', c.frontMatter.heroImage),
    card(
      sectionHeading("What We're Doing") +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections["What We're Doing"] ?? '')}</div>`
    ),
    card(
      sectionHeading('Instructions') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Instructions'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Time') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Time'] ?? '')}</div>` +
      (c.sections['Deliverable'] ? '<br>' + sectionHeading('Deliverable') + `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Deliverable'])}</div>` : '')
    ),
  ]);
}

function renderProjAssignment(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const assignNum = c.frontMatter.assignmentNumber ?? '';
  const due = c.frontMatter.due ?? '';
  const points = c.frontMatter.points ?? '';
  const title = c.frontMatter.title || `Project ${assignNum}`;
  const isTeam = c.frontMatter.team === true;
  const hasTimeline = c.frontMatter.timeline === true;
  const meta = [
    isTeam ? 'Team Project' : 'Individual Project',
    due ? `Due: ${due}` : '',
    points ? `${points} points` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return wrap([
    heroHtml(cfg, 'proj-assignment', week, title, meta, c.frontMatter.heroImage),
    callout(
      `<h2 style="color: ${cfg.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Brief</h2>` +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(c.sections['Brief'] ?? '')}</div>`,
      cfg,
    ),
    hasTimeline ? card(
      sectionHeading('Project Timeline') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Timeline'] ?? c.sections['Project Timeline'] ?? '')}</div>`
    ) : '',
    isTeam ? card(
      sectionHeading('Team') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Team'] ?? '')}</div>`
    ) : '',
    c.sections['Rubric'] ? card(
      sectionHeading('Rubric') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Rubric'])}</div>`
    ) : '',
    card(
      sectionHeading('Submission Details') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Submission Details'] ?? '')}</div>`
    ),
  ]);
}

function renderTechAssignment(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const assignNum = c.frontMatter.assignmentNumber ?? '';
  const due = c.frontMatter.due ?? '';
  const points = c.frontMatter.points ?? '';
  const title = c.frontMatter.title || `Tech Assignment ${assignNum}`;
  const isTeam = c.frontMatter.team === true;
  const meta = [
    isTeam ? 'Team' : 'Individual',
    due ? `Due: ${due}` : '',
    points ? `${points} points` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return wrap([
    heroHtml(cfg, 'tech-assignment', week, title, meta, c.frontMatter.heroImage),
    callout(
      `<h2 style="color: ${cfg.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Brief</h2>` +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(c.sections['Brief'] ?? '')}</div>`,
      cfg,
    ),
    c.sections['Setup'] ? card(
      sectionHeading('Setup') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Setup'])}</div>`
    ) : '',
    card(
      sectionHeading('Tasks') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Tasks'] ?? '')}</div>`
    ),
    isTeam ? card(
      sectionHeading('Team') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Team'] ?? '')}</div>`
    ) : '',
    card(
      sectionHeading('Deliverable') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Deliverable'] ?? '')}</div>`
    ),
    c.sections['Rubric'] ? card(
      sectionHeading('Rubric') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Rubric'])}</div>`
    ) : '',
  ]);
}

function renderReading(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Reading';
  return wrap([
    heroHtml(cfg, 'reading', week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('The Reading') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['The Reading'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Why This Reading') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Why This Reading'] ?? '')}</div>`
    ),
    c.sections['As You Read'] ? card(
      sectionHeading('As You Read') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['As You Read'])}</div>`
    ) : '',
  ]);
}

function renderQuizPage(
  c: PageContent,
  cfg: CourseConfig,
  pageType: 'reading-quiz' | 'weekly-quiz',
  defaultTitle: string,
): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || defaultTitle;
  const coversKey = pageType === 'reading-quiz' ? 'What It Covers' : 'Topics Covered';
  return wrap([
    heroHtml(cfg, pageType, week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('Quiz Details') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Quiz Details'] ?? '')}</div>`
    ),
    card(
      sectionHeading(coversKey) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections[coversKey] ?? '')}</div>`
    ),
    card(
      sectionHeading('Access') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Access'] ?? '')}</div>`
    ),
  ]);
}

function renderLab(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Lab';
  return wrap([
    heroHtml(cfg, 'lab', week, title, '', c.frontMatter.heroImage),
    callout(
      objectivesHeading(cfg) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(c.sections['Objectives'] ?? '')}</div>`,
      cfg,
    ),
    c.sections['Setup'] ? card(
      sectionHeading('Setup') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Setup'])}</div>`
    ) : '',
    card(
      sectionHeading('Instructions') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Instructions'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Submission') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Submission'] ?? '')}</div>`
    ),
  ]);
}

function renderDiscussionBoard(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Discussion Board';
  return wrap([
    heroHtml(cfg, 'discussion-board', week, title, '', c.frontMatter.heroImage),
    callout(
      `<h2 style="color: ${cfg.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Discussion Prompt</h2>` +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Prompt'] ?? '')}</div>`,
      cfg,
    ),
    card(
      sectionHeading('Requirements') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Requirements'] ?? '')}</div>`
    ),
    c.sections['Grading'] ? card(
      sectionHeading('Grading') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Grading'])}</div>`
    ) : '',
  ]);
}

function renderExtraCredit(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Extra Credit';
  return wrap([
    heroHtml(cfg, 'extra-credit', week, title, 'Optional', c.frontMatter.heroImage),
    card(
      sectionHeading('Opportunity') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Opportunity'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Requirements') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Requirements'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Points &amp; Deadline') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml((c.sections['Points'] ?? '') + '\n' + (c.sections['Deadline'] ?? ''))}</div>`
    ),
  ]);
}

/** Parsed structure for a single rubric criterion. Pulled out of a section
 *  whose heading matches `Criterion N: Name — Y pts` (em-dash or `--`). The
 *  three blocks come from `**For students:**`, `**Worked example:**`, and
 *  `**Faculty rubric language:**` markers within the section body. */
interface RubricCriterion {
  number: string;
  name: string;
  points: number;
  studentFacing: string;
  workedExample: string;
  facultyFacing: string;
}

/** Parse a section body that contains the three bold-marker blocks. Each
 *  block runs until the next `**Block name:**` marker or end-of-section. */
function parseCriterionBody(body: string): { studentFacing: string; workedExample: string; facultyFacing: string } {
  const markers = ['**For students:**', '**Worked example:**', '**Faculty rubric language:**'];
  const result = { studentFacing: '', workedExample: '', facultyFacing: '' };
  const keys: Array<keyof typeof result> = ['studentFacing', 'workedExample', 'facultyFacing'];

  // Build an index of marker positions in the body
  const positions: Array<{ marker: string; index: number; key: keyof typeof result }> = [];
  for (let i = 0; i < markers.length; i += 1) {
    const idx = body.indexOf(markers[i]);
    if (idx !== -1) positions.push({ marker: markers[i], index: idx, key: keys[i] });
  }
  positions.sort((a, b) => a.index - b.index);

  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i].index + positions[i].marker.length;
    const end = i + 1 < positions.length ? positions[i + 1].index : body.length;
    result[positions[i].key] = body.slice(start, end).trim();
  }
  return result;
}

function parseRubricCriteria(sections: Record<string, string>): RubricCriterion[] {
  const out: RubricCriterion[] = [];
  // Match "Criterion 1: Name — 30 pts" with em-dash, en-dash, or "--"
  const headingRe = /^Criterion\s+(\d+(?:\.\d+)?)\s*:\s*(.+?)\s*(?:—|–|--)\s*(\d+)\s*pts?$/i;
  for (const [heading, body] of Object.entries(sections)) {
    const m = heading.match(headingRe);
    if (!m) continue;
    const parsed = parseCriterionBody(body);
    out.push({
      number: m[1],
      name: m[2].trim(),
      points: parseInt(m[3], 10),
      ...parsed,
    });
  }
  return out;
}

function renderRubric(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const totalPoints = typeof c.frontMatter.points === 'number' ? c.frontMatter.points : undefined;
  const assignNum = c.frontMatter.assignmentNumber ?? '';
  const title = c.frontMatter.title || `Rubric — Assignment ${assignNum}`.trim();
  const meta = [
    assignNum ? `Assignment ${assignNum}` : '',
    totalPoints !== undefined ? `${totalPoints} pts total` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const criteria = parseRubricCriteria(c.sections);

  // Intro callout — "use this rubric to self-check; download below for LLM-paste"
  const intro = callout(
    `<p style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A; margin: 0 0 8px;"><strong>How to use this rubric:</strong> read each criterion, look at the worked example, then compare your work to it before you submit. The worked examples are the clearest guide to what full credit looks like.</p>` +
    `<p style="font-family: Lato, sans-serif; font-size: 14px; color: #555550; margin: 8px 0 0;">Want personalized help? Download this rubric as a markdown file (saved next to this page as <code>rubric.md</code>) and paste it into an LLM along with your work. Use it to start a conversation, not to outsource the thinking.</p>`,
    cfg,
  );

  const criterionCards = criteria.map(cr => `
<div style="background: #ffffff; border: 1px solid #e0e0d8; border-radius: 8px; padding: 20px 24px; margin-bottom: 16px;">
  <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px;">
    <h3 style="font-family: Lato, sans-serif; font-size: 18px; font-weight: 700; color: #1A1A1A; margin: 0;">${escapeHtml(cr.number)}. ${escapeHtml(cr.name)}</h3>
    <span style="font-family: Lato, sans-serif; font-size: 14px; font-weight: 700; color: ${cfg.colors.primary};">${cr.points} pts</span>
  </div>

  <div style="background: ${cfg.colors.primaryLight}; border-left: 4px solid ${cfg.colors.primary}; border-radius: 0 6px 6px 0; padding: 12px 16px; margin-bottom: 12px;">
    <p style="font-family: Lato, sans-serif; font-size: 12px; font-weight: 700; color: ${cfg.colors.primary}; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1px;">For Students</p>
    <div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(cr.studentFacing || '_(no student-facing explanation yet)_')}</div>
  </div>

  <div style="background: #EAF3DE; border-left: 4px solid #3B6D11; border-radius: 0 6px 6px 0; padding: 12px 16px; margin-bottom: 12px;">
    <p style="font-family: Lato, sans-serif; font-size: 12px; font-weight: 700; color: #3B6D11; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1px;">Worked Example</p>
    <div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(cr.workedExample || '_(no worked example yet)_')}</div>
  </div>

  ${cr.facultyFacing ? `<details style="margin-top: 8px;"><summary style="font-family: Lato, sans-serif; font-size: 13px; color: #555550; cursor: pointer;">Faculty rubric language</summary><div style="font-family: Lato, sans-serif; font-size: 14px; line-height: 1.65; color: #555550; padding: 8px 12px 0;">${markdownToHtml(cr.facultyFacing)}</div></details>` : ''}
</div>
`.trim());

  const notes = c.sections['Notes for students'] ?? c.sections['Notes for Students'] ?? '';
  const notesCard = notes ? card(
    sectionHeading('Notes for students') +
    `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(notes)}</div>`
  ) : '';

  return wrap([
    heroHtml(cfg, 'rubric', week, title, meta, c.frontMatter.heroImage),
    intro,
    ...criterionCards,
    notesCard,
  ]);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCustom(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Custom Page';
  const sectionCards = Object.entries(c.sections).map(([heading, content]) =>
    card(
      sectionHeading(heading) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(content)}</div>`
    )
  );
  return wrap([
    heroHtml(cfg, 'custom', week, title, '', c.frontMatter.heroImage),
    ...sectionCards,
  ]);
}

function wrap(parts: string[]): string {
  return `<div style="font-family: Lato, sans-serif; max-width: 900px; margin: 0 auto; color: #1A1A1A;">\n${parts.filter(Boolean).join('\n')}\n</div>`;
}

export function renderPage(
  content: PageContent,
  config: CourseConfig,
  options?: { templateId?: string; themeId?: string; promptSetId?: string }
): string {
  // Rubric pages have a fundamentally different shape (criteria as repeating
  // cards with student-facing + worked-example + faculty-facing blocks)
  // that doesn't map onto the slot-based template registry. Render directly.
  if (content.pageType === 'rubric') {
    return renderRubric(content, config);
  }

  // Load the structured layout from the template registry
  const templateId = options?.templateId || content.pageType;
  const template = loadTemplate(templateId);
  
  // Construct all slot HTML values dynamically
  const slotMap: Record<string, string> = {};
  
  // 1. Render hero
  const week = content.frontMatter.week;
  let title = content.frontMatter.title || '';
  let meta = '';
  const heroImage = content.frontMatter.heroImage;
  
  switch (content.pageType) {
    case 'front-page':
      title = title || config.courseName;
      meta = config.semester;
      break;
    case 'overview':
      title = title || `Week ${String(week ?? '').padStart(2, '0')} Overview`;
      break;
    case 'resources':
      title = title || `Week ${String(week ?? '').padStart(2, '0')} Resources`;
      break;
    case 'slides':
      title = title || `Week ${String(week ?? '').padStart(2, '0')} Slides`;
      break;
    case 'videos':
      title = title || `Week ${String(week ?? '').padStart(2, '0')} Videos`;
      break;
    case 'assignment': {
      const assignNum = content.frontMatter.assignmentNumber ?? '';
      title = title || `Assignment ${assignNum}`;
      meta = [content.frontMatter.due ? `Due: ${content.frontMatter.due}` : '', content.frontMatter.points ? `${content.frontMatter.points} points` : ''].filter(Boolean).join(' &nbsp;·&nbsp; ');
      break;
    }
    case 'engage-assignment':
      title = title || 'Engage Assignment';
      meta = 'In-Class Activity';
      break;
    case 'proj-assignment': {
      const assignNum = content.frontMatter.assignmentNumber ?? '';
      title = title || `Project ${assignNum}`;
      const isTeam = content.frontMatter.team === true;
      meta = [
        isTeam ? 'Team Project' : 'Individual Project',
        content.frontMatter.due ? `Due: ${content.frontMatter.due}` : '',
        content.frontMatter.points ? `${content.frontMatter.points} points` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
      break;
    }
    case 'tech-assignment': {
      const assignNum = content.frontMatter.assignmentNumber ?? '';
      title = title || `Tech Assignment ${assignNum}`;
      const isTeam = content.frontMatter.team === true;
      meta = [
        isTeam ? 'Team' : 'Individual',
        content.frontMatter.due ? `Due: ${content.frontMatter.due}` : '',
        content.frontMatter.points ? `${content.frontMatter.points} points` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
      break;
    }
    case 'reading':
      title = title || 'Reading';
      break;
    case 'reading-quiz':
      title = title || 'Reading Quiz';
      break;
    case 'weekly-quiz':
      title = title || 'Weekly Quiz';
      break;
    case 'lab':
      title = title || 'Lab';
      break;
    case 'discussion-board':
      title = title || 'Discussion Board';
      break;
    case 'extra-credit':
      title = title || 'Extra Credit';
      meta = 'Optional';
      break;
    case 'custom':
      title = title || 'Custom Page';
      break;
  }
  
  slotMap['hero'] = heroHtml(config, content.pageType, week, title, meta, heroImage);
  
  // 2. Render callout (Brief, Objectives, discussion prompt, or learning objectives)
  switch (content.pageType) {
    case 'overview':
      slotMap['callout'] = callout(
        objectivesHeading(config) +
        `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">
          ${markdownToHtml(content.sections['Learning Objectives'] ?? '')}
        </div>`,
        config,
      );
      break;
    case 'assignment':
    case 'proj-assignment':
    case 'tech-assignment':
      slotMap['callout'] = callout(
        `<h2 style="color: ${config.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Brief</h2>` +
        `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(content.sections['Brief'] ?? '')}</div>`,
        config,
      );
      break;
    case 'lab':
      slotMap['callout'] = callout(
        objectivesHeading(config) +
        `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(content.sections['Objectives'] ?? '')}</div>`,
        config,
      );
      break;
    case 'discussion-board':
      slotMap['callout'] = callout(
        `<h2 style="color: ${config.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Discussion Prompt</h2>` +
        `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(content.sections['Prompt'] ?? '')}</div>`,
        config,
      );
      break;
  }
  
  // 3. Render all other custom slots dynamically
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
    'x-time-deliverable': 'Time',
    'x-timeline': 'Project Timeline',
    'x-team': 'Team',
    'x-setup': 'Setup',
    'x-tasks': 'Tasks',
    'x-deliverable': 'Deliverable',
    'x-the-reading': 'The Reading',
    'x-why-this-reading': 'Why This Reading',
    'x-as-you-read': 'As You Read',
    'x-quiz-details': 'Quiz Details',
    'x-topics-covered': content.pageType === 'reading-quiz' ? 'What It Covers' : 'Topics Covered',
    'x-access': 'Access',
    'x-submission': 'Submission',
    'x-requirements': 'Requirements',
    'x-grading': 'Grading',
    'x-opportunity': 'Opportunity',
    'x-points-deadline': 'Points &amp; Deadline'
  };

  for (const slot of template.manifest.slots) {
    if (slot === 'hero' || slot === 'callout') continue;

    if (slot === 'body' && content.pageType === 'custom') {
      slotMap[slot] = Object.entries(content.sections)
        .map(([heading, sectContent]) =>
          card(sectionHeading(heading) + `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(sectContent)}</div>`)
        )
        .join('\n');
      continue;
    }

    const sectionKey = sectionHeadingMap[slot];
    if (!sectionKey) continue;

    // Handle optional slot conditionals
    if (slot === 'x-other' && !content.sections['Other']) {
      slotMap[slot] = '';
      continue;
    }
    if (slot === 'x-about-these-slides' && !content.sections['About These Slides']) {
      slotMap[slot] = '';
      continue;
    }
    if (slot === 'x-key-topics' && !content.sections['Key Topics']) {
      slotMap[slot] = '';
      continue;
    }
    if (slot === 'x-what-to-watch-for' && !content.sections['What to Watch For']) {
      slotMap[slot] = '';
      continue;
    }
    if (slot === 'x-rubric' && !content.sections['Rubric']) {
      slotMap[slot] = '';
      continue;
    }
    if (slot === 'x-timeline' && content.frontMatter.timeline !== true) {
      slotMap[slot] = '';
      continue;
    }
    if (slot === 'x-team' && content.frontMatter.team !== true) {
      slotMap[slot] = '';
      continue;
    }
    if (slot === 'x-setup' && !content.sections['Setup']) {
      slotMap[slot] = '';
      continue;
    }
    if (slot === 'x-as-you-read' && !content.sections['As You Read']) {
      slotMap[slot] = '';
      continue;
    }
    if (slot === 'x-grading' && !content.sections['Grading']) {
      slotMap[slot] = '';
      continue;
    }

    // Standard card rendering
    let innerHtml = '';
    if (slot === 'x-time-deliverable') {
      innerHtml = markdownToHtml(content.sections['Time'] ?? '') +
        (content.sections['Deliverable']
          ? '<br>' + sectionHeading('Deliverable') + `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(content.sections['Deliverable'])}</div>`
          : '');
    } else if (slot === 'x-points-deadline') {
      innerHtml = markdownToHtml((content.sections['Points'] ?? '') + '\n' + (content.sections['Deadline'] ?? ''));
    } else if (slot === 'x-timeline') {
      innerHtml = markdownToHtml(content.sections['Timeline'] ?? content.sections['Project Timeline'] ?? '');
    } else {
      innerHtml = markdownToHtml(content.sections[sectionKey] ?? '');
    }

    slotMap[slot] = card(
      sectionHeading(sectionKey) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${innerHtml}</div>`
    );
  }

  // 4. Substitute slots into the structure HTML
  let outputHtml = template.structureHtml;
  for (const slot of template.manifest.slots) {
    const val = slotMap[slot] || '';
    outputHtml = outputHtml.replace(new RegExp(`\\{\\{\\s*slot:${slot}\\s*\\}\\}`, 'g'), val);
  }

  return outputHtml;
}
