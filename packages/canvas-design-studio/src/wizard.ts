import { confirm, input, password } from '@inquirer/prompts';
import Color from 'color';
import { saveConfig } from './config.js';
import type { InstitutionConfig } from './types.js';
import { wcagContrastRatio } from './tools/contrast.js';
import {
  getPhilosophyKb,
  savePhilosophyKb,
  updatePhilosophyKb,
  PHILOSOPHY_TEMPLATE,
} from './tools/philosophy.js';
import type { WizardDefaults } from './utils/worksheet.js';

function deriveColors(primary: string, secondary: string): InstitutionConfig['colors'] {
  const c = Color(primary);
  return {
    primary,
    primaryDark: c.darken(0.25).hex(),
    primaryLight: c.lightness(93).hex(),
    secondary,
  };
}

function printMcpConfig(): void {
  const config = {
    mcpServers: {
      'canvas-design': {
        command: 'npx',
        args: ['canvas-design-mcp'],
      },
    },
  };

  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│  Add this to your Claude Code MCP settings:             │');
  console.log('└─────────────────────────────────────────────────────────┘\n');
  console.log(JSON.stringify(config, null, 2));
  console.log('\nRestart Claude Code (or your MCP host) to activate.\n');
  console.log('Works in: Claude Code · VS Code · ChatGPT Codex · any MCP host\n');
}

export function formatWorksheetSummary(defaults: WizardDefaults): string {
  const lines: string[] = [
    '┌─────────────────────────────────────────────────────────┐',
    '│  Values from your setup worksheet:                       │',
    '└─────────────────────────────────────────────────────────┘',
    '',
  ];
  if (defaults.institution) lines.push(`  Institution:    ${defaults.institution}`);
  if (defaults.brandUrl) lines.push(`  Brand URL:      ${defaults.brandUrl}`);
  if (defaults.primaryColor) lines.push(`  Primary color:  ${defaults.primaryColor}`);
  if (defaults.secondaryColor) lines.push(`  Secondary:      ${defaults.secondaryColor}`);
  if (defaults.canvasUrl) lines.push(`  Canvas URL:     ${defaults.canvasUrl}`);
  if (defaults.apiToken) lines.push(`  API token:      ✓ (provided)`);
  if (defaults.professorEmail) lines.push(`  Email:          ${defaults.professorEmail}`);
  if (defaults.favoriteCourses) lines.push(`  Courses:        ${defaults.favoriteCourses}`);
  if (defaults.panoptoDomain) lines.push(`  Panopto:        ${defaults.panoptoDomain}`);
  if (defaults.panoptoClientId) lines.push(`  Panopto ID:     ${defaults.panoptoClientId}`);
  lines.push('');
  lines.push('  Press Enter to accept each value, or type to override.');
  return lines.join('\n');
}

export function formatSetupSummary(config: InstitutionConfig): string {
  const hasApiToken = !!config.apiToken?.trim();
  const hasPanopto = !!config.panopto?.domain;

  const tableRows = [
    `| Institution | ${config.institution} |`,
    `| Canvas URL | ${config.canvasUrl} |`,
    `| Primary color | ${config.colors.primary} |`,
    `| Secondary color | ${config.colors.secondary} |`,
    `| API token | ${hasApiToken ? '✓ configured' : 'not configured'} |`,
    config.professorEmail ? `| Professor email | ${config.professorEmail} |` : null,
    `| Panopto | ${hasPanopto ? config.panopto!.domain : 'not configured'} |`,
    config.brandUrl ? `| Brand URL | ${config.brandUrl} |` : null,
  ].filter(Boolean).join('\n');

  const capabilities = [
    '✓ Generate Canvas-safe HTML pages',
    '✓ Validate, critique, and redesign pages',
    '✓ Build and generate full course scaffolds',
    '✓ Import from Canvas backup archives',
    hasApiToken
      ? '✓ Publish directly to Canvas (API token active)'
      : '⚪ Publish directly to Canvas (add API token to enable)',
    hasPanopto
      ? '✓ Panopto video search, embed, and captions'
      : '⚪ Panopto video integration (run setup_institution to add)',
  ].join('\n');

  return [
    `## Your Canvas Design Studio Setup — ${config.institution}`,
    '',
    '| Setting | Value |',
    '|---|---|',
    tableRows,
    '',
    '## What you can do right now',
    capabilities,
    '',
    '## Next step',
    'Ask: "Read start_here.md and help me generate my first page"',
    'Or: "Run setup_course to start building out my course"',
    '',
    '> Tip: Save this summary as my-canvas-setup.md for future reference.',
  ].join('\n');
}

export async function runWizard(defaults?: WizardDefaults): Promise<InstitutionConfig> {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║          Canvas Design Studio — First Run Setup           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log('This wizard saves your institution config once.');
  console.log('All fields except Canvas URL and API token can be changed later.\n');
  // Only show the summary if the worksheet provided at least one field
  if (defaults && Object.values(defaults).some(v => v !== undefined)) {
    console.log('\n' + formatWorksheetSummary(defaults) + '\n');
  }

  const institution = await input({
    message: 'Institution name (your college or university, e.g. Example University):',
    default: defaults?.institution ?? 'Example University',
  });

  const brandUrl = await input({
    message: 'Brand standards URL (optional — e.g. https://www.example.edu/brand/ — your AI can fetch this to suggest your colors):',
    default: defaults?.brandUrl ?? '',
    validate: (v: string) => !v || v.startsWith('https://') || 'Brand URL must start with https://',
  });

  let primaryHex: string;
  while (true) {
    primaryHex = await input({
      message: 'Primary brand color (#hex):',
      default: defaults?.primaryColor ?? '#0033A0',
      validate: (v) => /^#[0-9A-Fa-f]{6}$/.test(v) || 'Enter a valid hex color (e.g. #0033A0)',
    });
    const primaryRatio = wcagContrastRatio(primaryHex, '#ffffff');
    if (primaryRatio >= 4.5) {
      console.log(`  Contrast on white: ${primaryRatio.toFixed(2)}:1 — passes WCAG AA`);
      break;
    }
    console.log(`  Contrast on white: ${primaryRatio.toFixed(2)}:1 — ${primaryRatio >= 3.0 ? 'marginal' : 'fails'} for body text (AA requires 4.5:1)`);
    console.log('  White text on this color may not be readable at small sizes. Consider darkening slightly.');
    const go = await confirm({ message: 'Proceed with this color?', default: true });
    if (go) break;
  }

  let secondaryHex: string;
  while (true) {
    secondaryHex = await input({
      message: 'Secondary / accent color (#hex):',
      default: defaults?.secondaryColor ?? '#D64309',
      validate: (v) => /^#[0-9A-Fa-f]{6}$/.test(v) || 'Enter a valid hex color (e.g. #D64309)',
    });
    const secondaryRatio = wcagContrastRatio(secondaryHex, '#ffffff');
    if (secondaryRatio >= 4.5) {
      console.log(`  Contrast on white: ${secondaryRatio.toFixed(2)}:1 — passes WCAG AA`);
      break;
    }
    console.log(`  Contrast on white: ${secondaryRatio.toFixed(2)}:1 — ${secondaryRatio >= 3.0 ? 'marginal' : 'fails'} for body text (AA requires 4.5:1)`);
    console.log('  White text on this color may not be readable at small sizes. Consider darkening slightly.');
    const go = await confirm({ message: 'Proceed with this color?', default: true });
    if (go) break;
  }

  const canvasUrl = await input({
    message: 'Canvas base URL (log into Canvas, copy the domain, e.g. https://example.instructure.com — no trailing slash):',
    default: defaults?.canvasUrl ?? 'https://example.instructure.com',
    validate: (v: string) => {
      if (!v.startsWith('https://')) return 'URL must start with https://';
      if (v.endsWith('/')) return 'Remove the trailing slash (e.g. https://example.instructure.com)';
      return true;
    },
  });

  if (defaults?.apiToken) {
    console.log('  ✓ API token from worksheet — leave blank to use it, or type a new token to override.');
  }
  const apiTokenInput = await password({
    message: 'Canvas API token — Canvas → Account → Settings → Approved Integrations → New Access Token (leave blank to generate HTML and paste manually):',
    mask: '*',
    validate: (v: string) => !v || v.length > 20 || 'Token looks too short — Canvas tokens are 70+ characters. Leave blank or paste the full token.',
  });
  // password() has no default: option — use worksheet value if user leaves blank
  const apiToken = apiTokenInput || defaults?.apiToken || '';

  const professorEmail = await input({
    message: 'Professor email for FERPA scan allowlist (optional — prevents your own address being flagged as PII, e.g. you@university.edu):',
    default: defaults?.professorEmail ?? '',
    validate: (v: string) => !v || (v.includes('@') && v.includes('.')) || 'Enter a valid email address or leave blank',
  });

  const favoriteCoursesRaw = await input({
    message: 'Favorite Canvas course IDs, comma-separated (optional — find IDs in the Canvas course URL, e.g. 12345, 67890):',
    default: defaults?.favoriteCourses ?? '',
    validate: (v) => {
      if (!v.trim()) return true;
      return v.split(',').every(id => /^\d+$/.test(id.trim())) || 'Use only numeric Canvas course IDs separated by commas.';
    },
  });

  const favoriteCourses = favoriteCoursesRaw
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .map(Number);

  const colors = deriveColors(primaryHex, secondaryHex);

  const config: InstitutionConfig = {
    institution,
    colors,
    canvasUrl,
    apiToken: apiToken || '',
    professorEmail: professorEmail.trim() || undefined,
    favoriteCourses: favoriteCourses.length > 0 ? favoriteCourses : undefined,
    kbTipShown: false,
    brandUrl: brandUrl.trim() || undefined,
  };

  saveConfig(config);

  // Optional Panopto section — always skippable
  const panoptoDomain = await input({
    message: 'Panopto domain (e.g. example.hosted.panopto.com, or leave blank to skip):',
    default: defaults?.panoptoDomain ?? '',
  });

  if (panoptoDomain.trim()) {
    const whitelistAnswer = await input({
      message: 'Is Panopto whitelisted for iframes in Canvas? (yes / no / unsure):',
      default: 'unsure',
      validate: (v) => ['yes', 'no', 'unsure'].includes(v.toLowerCase()) || 'Enter yes, no, or unsure',
    });

    const iframeWhitelisted: boolean | null =
      whitelistAnswer.toLowerCase() === 'yes' ? true :
      whitelistAnswer.toLowerCase() === 'no' ? false :
      null;

    const panoptoClientId = await input({
      message: 'Panopto API client ID (leave blank to skip — enables video search and caption download):',
      default: defaults?.panoptoClientId ?? '',
    });

    let panoptoClientSecret = '';
    if (panoptoClientId.trim()) {
      if (defaults?.panoptoClientSecret) {
        console.log('  ✓ Panopto client secret from worksheet — leave blank to use it, or type to override.');
      }
      const secretInput = await password({
        message: 'Panopto API client secret:',
        mask: '*',
      });
      // password() has no default: option — use worksheet value if user leaves blank
      panoptoClientSecret = secretInput || defaults?.panoptoClientSecret || '';
    }

    config.panopto = {
      domain: panoptoDomain.trim().replace(/^https?:\/\//i, ''),
      iframeWhitelisted,
      ...(panoptoClientId.trim() ? { clientId: panoptoClientId.trim(), clientSecret: panoptoClientSecret } : {}),
    };

    saveConfig(config);
    console.log(`✓ Panopto domain: ${panoptoDomain.trim()}`);
    console.log(`  iFrame whitelisted: ${iframeWhitelisted === null ? 'unsure' : String(iframeWhitelisted)}`);
    if (panoptoClientId.trim()) console.log('✓ Panopto API credentials saved');
  }

  // Philosophy KB phase — runs after Panopto, before final summary
  const kbResult = getPhilosophyKb();

  if (!kbResult.exists) {
    const buildKb = await confirm({
      message: 'Would you like to build your teaching philosophy KB now?\nClaude uses it to tailor every Canvas page to your style.\n(You can skip and build it in Claude later.)',
      default: true,
    });

    if (buildKb) {
      console.log('\nBuilding your teaching philosophy KB...\n');
      const philosophyQuestions = [
        "What's one thing you always tell students about this subject that you wish they'd really internalize?",
        "What does a student who truly gets it do differently from one who just completes the work?",
        "What's the biggest mistake students make on your assignments?",
        "What separates an A from a B in concrete terms?",
        "Are there teaching frameworks you consciously draw from? (Bloom's, UDL, constructivism, andragogy, etc.)",
        "Any quotes or sayings you use regularly in class?",
      ];
      const answers: string[] = [];
      for (let i = 0; i < philosophyQuestions.length; i++) {
        const answer = await input({
          message: philosophyQuestions[i],
          default: defaults?.philosophyAnswers?.[i] ?? '',
        });
        if (answer.trim()) answers.push(answer.trim());
      }
      const coreContent = answers.map(a => `- ${a}`).join('\n');
      const kbContent = PHILOSOPHY_TEMPLATE.replace(
        '## Core Teaching Philosophy\n',
        `## Core Teaching Philosophy\n\n${coreContent}\n`
      );
      savePhilosophyKb(kbContent);
      console.log('✓ Teaching philosophy KB saved');
    } else {
      savePhilosophyKb(PHILOSOPHY_TEMPLATE);
      console.log('✓ Philosophy KB template saved — build it in Claude anytime');
    }
  } else {
    const updateKb = await confirm({
      message: 'You already have a philosophy KB. Would you like to review or update it?',
      default: false,
    });

    if (updateKb) {
      console.log('\nYour current philosophy KB:\n');
      console.log(kbResult.content);
      console.log('');

      const addCourse = await confirm({
        message: 'Would you like to add course-specific focus for a course?',
        default: false,
      });

      if (addCourse) {
        const courseKey = await input({
          message: 'Course key (e.g. "ITM 370 — AI Augmented Projects"):',
          validate: (v) => v.trim().length > 0 || 'Course key is required',
        });
        const courseNote = await input({
          message: `What should Claude know specifically about ${courseKey.trim()}?`,
        });
        if (courseNote.trim()) {
          updatePhilosophyKb({ entry: courseNote.trim(), section: 'course', courseKey: courseKey.trim() });
          console.log(`✓ Course-specific focus added for ${courseKey.trim()}`);
        }
      }
    }
  }

  console.log('\n' + formatSetupSummary(config) + '\n');

  printMcpConfig();

  return config;
}
