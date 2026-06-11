#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { CanvasApiClient } from './canvas-api.js';
import { configExists, loadConfig, saveConfig } from './config.js';
import { runWizard, formatSetupSummary } from './wizard.js';
import { formatError } from './utils/errors.js';
import { getStarted } from './tools/get-started.js';
import { validateCanvasHtml } from './tools/validate.js';
import { generateCanvasPage } from './tools/generate.js';
import type { GenerateInput } from './tools/generate.js';
import { updateCanvasKb } from './tools/update-kb.js';
import { listCanvasCourses } from './tools/list-courses.js';
import type { ListCanvasCoursesInput } from './tools/list-courses.js';
import { publishToCanvas } from './tools/publish.js';
import type { PublishToCanvasInput } from './tools/publish.js';
import { auditAccessibility } from './tools/accessibility.js';
import { critiqueCanvasPage } from './tools/critique.js';
import type { CritiqueInput } from './tools/critique.js';
import { redesignCanvasPage } from './tools/redesign.js';
import type { RedesignInput } from './tools/redesign.js';
import { ingestAssignmentFolder } from './tools/ingest.js';
import type { IngestAssignmentFolderInput } from './tools/ingest.js';
import { getPhilosophyKb, updatePhilosophyKb } from './tools/philosophy.js';
import type { UpdatePhilosophyKbInput } from './tools/philosophy.js';
import { generateStudentPersonas, getStudentPersonas } from './tools/personas.js';
import type { GenerateStudentPersonasInput } from './tools/personas.js';
import { loadCanvasPage, saveCanvasPage } from './tools/page-io.js';
import type { LoadCanvasPageInput, SaveCanvasPageInput } from './tools/page-io.js';
import { generatePage } from './tools/generate-page.js';
import type { GeneratePageInput } from './course-types.js';
import { generateWeek } from './tools/generate-week.js';
import type { GenerateWeekInput } from './course-types.js';
import { generateCourse } from './tools/generate-course.js';
import type { GenerateCourseInput } from './course-types.js';
import { runCourseWizard } from './tools/setup-course.js';
import { importCourse } from './tools/import-course.js';
import type { ImportCourseInput } from './tools/import-course.js';
import { getSetupWorksheet } from './tools/get-setup-worksheet.js';
import { parseWorksheet, validateWorksheet } from './utils/worksheet.js';
import { validateWorksheetTool, formatWorksheetErrors } from './tools/validate-worksheet.js';
import { fetchBrandColors } from './tools/fetch-brand-colors.js';
import { renderWidget } from './tools/render-widget.js';
import { publishWidget } from './tools/publish-widget.js';

async function main() {
  if (!configExists()) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        'Error: No institution config found.\n' +
        'Run the setup wizard on your host machine first:\n\n' +
        '  npx canvas-design-mcp\n\n' +
        'Then mount the config when running Docker:\n\n' +
        '  docker run -i --rm \\\n' +
        '    -v ~/.canvas-design-mcp:/root/.canvas-design-mcp \\\n' +
        '    ghcr.io/ryfter/canvas-design-studio:latest\n'
      );
      process.exit(1);
    }
    await runWizard();
  }

  const server = new Server(
    { name: 'canvas-design-studio', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'get_started',
        description: 'Get a tailored orientation based on your current config — what tools are active, what setup unlocks, quick-start prompts, and a Context7 hint for the latest docs. Call this at the start of any session.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_setup_worksheet',
        description: 'Get the blank setup worksheet template. Save it as setup-worksheet.md, ask the professor to fill it out, then pass the contents to setup_institution via worksheetContent. Faster than answering the wizard interactively.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'setup_institution',
        description: 'Re-run the setup wizard to update institution config (brand colors, Canvas URL, API token). Run this to change institutions or rotate credentials. Optionally pass worksheetContent from a filled setup-worksheet.md to pre-fill all answers.',
        inputSchema: {
          type: 'object',
          properties: {
            worksheetContent: {
              type: 'string',
              description: 'Full contents of a completed setup-worksheet.md. Pre-fills wizard prompts — professor confirms or overrides each value interactively.',
            },
          },
        },
      },
      {
        name: 'generate_canvas_page',
        description: 'Generate a beautiful, Canvas-safe HTML assignment page from a brief. Returns HTML ready to paste into Canvas, a hero image prompt for ChatGPT, and the suggested filename. If the professor philosophy KB is in context, apply the professor\'s tone, framing, and pedagogical emphasis preferences when generating content.',
        inputSchema: {
          type: 'object' as const,
          required: ['assignmentBrief', 'courseName', 'courseNumber', 'assignmentNumber', 'professorName', 'semester'],
          properties: {
            assignmentBrief: { type: 'string', description: 'Raw assignment instructions — paste from Word, email, or notes. Claude will rewrite into polished student-friendly copy.' },
            courseName: { type: 'string', description: 'e.g. AI Augmented Projects' },
            courseNumber: { type: 'string', description: 'e.g. ITM 370' },
            assignmentNumber: { type: 'string', description: 'e.g. 16.06' },
            professorName: { type: 'string', description: 'e.g. Dr. Smith' },
            semester: { type: 'string', description: 'e.g. Fall 2026' },
            styleNotes: { type: 'string', description: 'Optional layout or tone preferences. e.g. "two-column, energetic tone, include a resources sidebar"' },
          },
        },
      },
      {
        name: 'validate_canvas_html',
        description: 'Check any HTML string against Canvas RCE compliance rules. Returns a list of violations with the offending snippets. Use before pasting into Canvas.',
        inputSchema: {
          type: 'object' as const,
          required: ['html'],
          properties: {
            html: { type: 'string', description: 'HTML string to validate' },
          },
        },
      },
      {
        name: 'update_canvas_kb',
        description: 'Refresh the Canvas knowledge base from live Instructure documentation via Context7. Run periodically to keep validation rules and component references current.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            force: { type: 'boolean', description: 'Force update even if KB was recently refreshed' },
          },
        },
      },
      {
        name: 'list_canvas_courses',
        description: 'List Canvas courses available to the configured professor, with semester filtering, favorite pinning, and course metadata to help choose the right course.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            semester: {
              type: 'string',
              enum: ['current', 'future', 'past', 'all'],
              description: 'Course filter: current active courses, future invited/pending courses, past completed courses, or all courses.',
            },
            includeFavorites: {
              type: 'boolean',
              description: 'Pin configured favorite course IDs to the top. Defaults to true.',
            },
          },
        },
      },
      {
        name: 'publish_to_canvas',
        description: 'Validate and publish Canvas-safe HTML to a Canvas course page. Detects FERPA risks, validation issues, and similar existing page titles before writing.',
        inputSchema: {
          type: 'object' as const,
          required: ['courseId', 'html', 'pageTitle'],
          properties: {
            courseId: { type: 'number', description: 'Canvas course ID from list_canvas_courses.' },
            html: { type: 'string', description: 'Canvas-safe HTML to publish.' },
            pageTitle: { type: 'string', description: 'Canvas page title.' },
            forcePublish: { type: 'boolean', description: 'Skip Canvas HTML validation gate. Defaults to false.' },
            skipFerpaCheck: { type: 'boolean', description: 'Skip FERPA/PII scan. Defaults to false.' },
            collisionAction: {
              type: 'string',
              enum: ['update', 'create', 'related', 'cancel'],
              description: 'Use only after a TITLE_COLLISION response to choose how to proceed.',
            },
            relatedPageTitle: {
              type: 'string',
              description: 'Required when collisionAction is related.',
            },
          },
        },
      },
      {
        name: 'critique_canvas_page',
        description: 'Evaluate a Canvas HTML page for visual design quality. Returns a score, strengths, and prioritized findings. Use quick mode for a fast structural check; comprehensive mode for a full design review with KB context for Claude to reason about. If the professor philosophy KB is in context, evaluate the page against the professor\'s stated standards and teaching philosophy. If student personas are in context, factor their backgrounds into the findings where relevant.',
        inputSchema: {
          type: 'object' as const,
          required: ['html', 'pageType', 'primaryGoal'],
          properties: {
            html: { type: 'string', description: 'Canvas HTML to evaluate.' },
            pageType: {
              type: 'string',
              enum: ['assignment', 'week-overview', 'course-home', 'syllabus', 'other'],
              description: 'Type of Canvas page — informs which checks apply.',
            },
            primaryGoal: { type: 'string', description: 'What a student should do or understand from this page. e.g. "Submit the video project" or "Know what to read this week."' },
            audience: { type: 'string', description: 'Optional. e.g. "first-year undergrads" or "graduate students".' },
            mode: {
              type: 'string',
              enum: ['quick', 'comprehensive'],
              description: 'quick: fast code-based checks only. comprehensive: adds KB design principles to the response for deeper Claude analysis. Defaults to quick.',
            },
          },
        },
      },
      {
        name: 'redesign_canvas_page',
        description: 'Apply design fixes to Canvas HTML based on critique findings. Applies mechanical fixes automatically; returns remaining findings and KB context for Claude to address. Runs WCAG 2.1 AA accessibility check on output. If the professor philosophy KB is in context, redesign toward the professor\'s aesthetic and pedagogical preferences.',
        inputSchema: {
          type: 'object' as const,
          required: ['html', 'findings'],
          properties: {
            html: { type: 'string', description: 'Original Canvas HTML to fix.' },
            findings: { type: 'array', description: 'findings array from critique_canvas_page output.' },
            mode: {
              type: 'string',
              enum: ['quick', 'comprehensive'],
              description: 'quick: mechanical fixes only. comprehensive: mechanical fixes + KB context for Claude to complete the redesign. Defaults to quick.',
            },
            pageType: { type: 'string', description: 'Optional. Helps Claude in comprehensive mode.' },
            primaryGoal: { type: 'string', description: 'Optional. Helps Claude in comprehensive mode.' },
          },
        },
      },
      {
        name: 'ingest_assignment_folder',
        description: 'Read assignment materials from a folder and generate a Canvas-safe HTML page. ' +
          'Supports simple mode (ingest/ folder with up to 5 files) and advanced mode ' +
          '(assignments/{id}/ subfolders with shared rubric and shell inheritance for assignment groups). ' +
          'Returns the generated HTML alongside the raw brief, rubric, and shell content so Claude can ' +
          'review brief clarity, rubric alignment, and shell completeness. ' +
          'Brief and style-notes are per-assignment; rubric and shell are inherited from parent folders if not present locally. ' +
          'If the professor philosophy KB is in context, apply it when generating the page and note any alignment between the assignment materials and the professor\'s philosophy. ' +
          'If student personas are in context, consider their backgrounds when noting alignment gaps between assignment materials and student needs.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            folderPath: {
              type: 'string',
              description: 'Path to the assignment folder, relative to the project root. ' +
                'Defaults to "ingest/" if omitted. ' +
                'For advanced mode, point at a specific assignment subfolder ' +
                '(e.g., "assignments/ai-challenge/week-01").',
            },
          },
        },
      },
      {
        name: 'get_philosophy_kb',
        description: 'Load the professor\'s teaching philosophy KB into context. Returns the full KB content, whether it exists, and which sections have been populated. Call once at the start of a session when working on Canvas pages. If the KB does not exist yet, returns an empty template with interview questions embedded so you can build it through conversation.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'update_philosophy_kb',
        description: 'Append a new entry to the professor\'s philosophy KB. Use after a professor shares a quote, teaching insight, or course-specific note. Also used to save Panopto-sourced statements after professor approval. Never overwrites existing content — always appends.',
        inputSchema: {
          type: 'object' as const,
          required: ['entry', 'section'],
          properties: {
            entry: { type: 'string', description: 'Content to add to the specified section.' },
            section: {
              type: 'string',
              enum: ['core', 'course', 'quotes', 'lectures'],
              description: 'core: Core Teaching Philosophy (applies to all courses). course: Course-Specific Focus (requires courseKey). quotes: Quotes & Aphorisms. lectures: From Lecture Captures.',
            },
            courseKey: {
              type: 'string',
              description: 'Required when section is "course". The course identifier, e.g. "ITM 370 — AI Augmented Projects".',
            },
          },
        },
      },
      {
        name: 'get_student_personas',
        description: 'Load saved student personas into context. If personas have been generated previously, returns them and asks whether to reuse or generate a new set. If none exist, returns an empty template and instructs you to call generate_student_personas. Call this at the start of any persona review session before asking the professor what to do.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'generate_student_personas',
        description: 'Generate statistically grounded student personas using real demographic distributions for race/ethnicity and learning disabilities/challenges, with randomized values across 21 other dimensions (age, work/study balance, financial situation, motivation, confidence, etc.). Saves to ~/.canvas-design-mcp/student-personas.md and returns the full content. Always overwrites any existing saved personas — this is a fresh start.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            count: {
              type: 'number',
              description: 'Number of personas to generate. Default 3. Min 1, max 20.',
            },
          },
        },
      },
      {
        name: 'load_canvas_page',
        description: 'Load the most recently generated Canvas HTML page from output/ back into context. Use after critique_canvas_page or get_student_personas to retrieve the HTML you want to improve. Returns the HTML content and filename — pass the filename unchanged to save_canvas_page when done editing.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            filename: { type: 'string', description: 'Specific file to load from output/. If omitted, loads the most recently modified .html file.' },
          },
        },
      },
      {
        name: 'save_canvas_page',
        description: 'Save improved Canvas HTML back to output/, automatically creating a .bak backup of the previous version. Call this after editing the HTML loaded with load_canvas_page. The filename returned by load_canvas_page should be passed here unchanged.',
        inputSchema: {
          type: 'object' as const,
          required: ['html', 'filename'],
          properties: {
            html: { type: 'string', description: 'The full improved HTML to write to disk.' },
            filename: { type: 'string', description: 'Filename within output/ — use the filename returned by load_canvas_page.' },
          },
        },
      },
      {
        name: 'setup_course',
        description: 'Run the course setup wizard to create a full course folder scaffold — course-config.md, all week folders, and pre-filled template .md files for each active page type. Run once per course. Supports color overrides and a checkbox page-type selector with recommendations.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            courseDir: { type: 'string', description: 'Directory to create the course scaffold in. Defaults to "course/" in the current project.' },
          },
        },
      },
      {
        name: 'generate_page',
        description: 'Generate one Canvas HTML page from a single .md content file. Finds course-config.md automatically by walking up from the file. Saves to output/week-NN/filename.html. Use for one-off pages and per-page tweaks.',
        inputSchema: {
          type: 'object' as const,
          required: ['mdPath'],
          properties: {
            mdPath: { type: 'string', description: 'Path to the .md content file (e.g. "course/week-03/assignment.md" or "course/front-page.md").' },
            courseDir: { type: 'string', description: 'Directory containing course-config.md. Inferred from mdPath if omitted.' },
            outputDir: { type: 'string', description: 'Output directory. Defaults to "output/" inside the course directory.' },
          },
        },
      },
      {
        name: 'generate_week',
        description: 'Generate all Canvas HTML pages for one week. Reads course-config.md for active page types and colors, then generates HTML for each .md file found in the week folder. Skips missing files with a warning.',
        inputSchema: {
          type: 'object' as const,
          required: ['weekNumber'],
          properties: {
            weekNumber: { type: 'number', description: 'Week number to generate (e.g. 3 for week-03).' },
            courseDir: { type: 'string', description: 'Directory containing course-config.md. Defaults to "course/".' },
            outputDir: { type: 'string', description: 'Output directory. Defaults to "output/" inside the course directory.' },
          },
        },
      },
      {
        name: 'generate_course',
        description: 'Batch generate all Canvas HTML pages for the entire course — front page plus all weeks. Reads course-config.md for the week count and active page types. Reports total pages generated and any warnings about missing .md files.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            courseDir: { type: 'string', description: 'Directory containing course-config.md. Defaults to "course/".' },
            outputDir: { type: 'string', description: 'Output directory. Defaults to "output/" inside the course directory.' },
          },
        },
      },
      {
        name: 'import_course',
        description: 'Import a previous semester\'s course from a canvas-backup archive folder. Reads modules, pages, assignments, quizzes, and discussions and scaffolds a pre-filled course/ folder ready to update and regenerate. Works at three granularities: full course (omit weekNumber and assignmentName), one week (provide weekNumber), or one assignment (provide assignmentName). Content that cannot be cleanly extracted — quiz questions, LTI links, external tools — is written as [NEEDS REVIEW] placeholders.',
        inputSchema: {
          type: 'object' as const,
          required: ['archivePath'],
          properties: {
            archivePath: {
              type: 'string',
              description: 'Path to the canvas-backup archive folder for the course (e.g. "D:/CanvasArchive/2026/Spring/ITM370").',
            },
            outputDir: {
              type: 'string',
              description: 'Directory to write the imported course folder into. Defaults to "course/" in the current project.',
            },
            weekNumber: {
              type: 'number',
              description: 'Import only this week (1-based). Omit to import all weeks.',
            },
            assignmentName: {
              type: 'string',
              description: 'Import only this specific assignment by name. Omit to import all content.',
            },
          },
        },
      },
      {
        name: 'fetch_brand_colors',
        description: 'Fetch a brand standards URL and extract color candidates. Returns a suggested primary and secondary color with reasoning, plus the full ranked color list. Pass the URL from the professor\'s brand page.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            url: {
              type: 'string',
              description: 'The brand standards page URL (must start with https://)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'render_widget',
        description: 'Render an InteractiveSpec to a self-contained Canvas-embeddable HTML widget file. Writes <spec-id>.html next to the spec. For a kind not in the catalog, pass allowExperimental: true to use the LLM-generated path (when available — currently stubbed).',
        inputSchema: {
          type: 'object' as const,
          properties: {
            specPath: { type: 'string', description: 'Absolute path to the .spec.json file.' },
            allowExperimental: { type: 'boolean', description: 'If true, kinds not in the catalog are rendered via the LLM-generated path. Default false.' },
          },
          required: ['specPath'],
        },
      },
      {
        name: 'publish_widget',
        description: 'Upload a rendered widget HTML file to Canvas Files and return the iframe embed code. Faculty typically does not call this directly; publish_course invokes it for every widget reference in a published course folder.',
        inputSchema: {
          type: 'object',
          properties: {
            htmlPath: { type: 'string', description: 'Absolute path to the rendered <id>.html file.' },
            courseId: { type: 'number', description: 'Canvas course id where the widget should be uploaded.' },
            canvasConfig: {
              type: 'object',
              properties: { host: { type: 'string' }, token: { type: 'string' } },
              required: ['host', 'token'],
            },
            widgetSpec: { type: 'object', description: 'The InteractiveSpec the HTML was rendered from. Used for the iframe title, dimensions, and SR fallback.' },
          },
          required: ['htmlPath', 'courseId', 'canvasConfig', 'widgetSpec'],
        },
      },
      {
        name: 'validate_worksheet',
        description: 'Check a filled setup-worksheet.md for format errors before running setup_institution. Returns a list of problems (bad hex colors, malformed URLs) or confirms the worksheet is ready.',
        inputSchema: {
          type: 'object' as const,
          required: ['worksheetContent'],
          properties: {
            worksheetContent: {
              type: 'string',
              description: 'Full contents of a filled setup-worksheet.md.',
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'get_started') {
        return { content: [{ type: 'text', text: getStarted() }] };
      }

      if (name === 'get_setup_worksheet') {
        return { content: [{ type: 'text', text: getSetupWorksheet() }] };
      }

      if (name === 'setup_institution') {
        const { worksheetContent } = (args ?? {}) as { worksheetContent?: string };
        const defaults = worksheetContent ? parseWorksheet(worksheetContent) : undefined;
        if (defaults) {
          const worksheetErrors = validateWorksheet(defaults);
          if (worksheetErrors.length > 0) {
            return {
              content: [{ type: 'text', text: formatWorksheetErrors(worksheetErrors) }],
              isError: true,
            };
          }
        }
        const config = await runWizard(defaults);
        return {
          content: [{ type: 'text', text: formatSetupSummary(config) }],
        };
      }

      if (name === 'validate_canvas_html') {
        const { html } = args as { html: string };
        const rce = validateCanvasHtml(html);
        const a11y = auditAccessibility(html);

        const rceSummary = rce.valid
          ? '✓ Canvas RCE: HTML is Canvas-compliant. No violations found.'
          : `✗ Canvas RCE: ${rce.violations.length} violation(s) found:\n\n` +
            rce.violations.map((v, i) => `${i + 1}. ${v.rule}\n   Context: ${v.context}`).join('\n\n');

        const a11ySummary = a11y.length === 0
          ? '✓ Accessibility (WCAG 2.1 AA): No issues found.'
          : `⚠ Accessibility (WCAG 2.1 AA — advisory): ${a11y.length} issue(s) found:\n\n` +
            a11y.map((w, i) => `${i + 1}. ${w.check}: ${w.message}${w.context ? `\n   Context: ${w.context}` : ''}`).join('\n\n');

        return {
          content: [{ type: 'text', text: `${rceSummary}\n\n${a11ySummary}` }],
          isError: !rce.valid,
        };
      }

      if (name === 'generate_canvas_page') {
        if (!configExists()) {
          return {
            content: [{
              type: 'text',
              text: formatError({
                title: 'Setup Required',
                message: 'Canvas Design Studio needs institution config before generating pages.',
                cause: 'No institution.json found at ~/.canvas-design-mcp/institution.json.',
                fix: [
                  'Run setup_institution to save your institution colors, Canvas URL, and optional API token',
                  'The wizard takes about 2 minutes and only needs to run once',
                ],
                context: 'generate_canvas_page called with no institution config',
              }),
            }],
            isError: true,
          };
        }
        const config = loadConfig();
        const result = generateCanvasPage(args as unknown as GenerateInput, config);
        const response = [
          `✓ Page generated: ${result.filename}`,
          result.warnings.length > 0
            ? `\n⚠ Warnings:\n${result.warnings.map(w => `  • ${w}`).join('\n')}`
            : '',
          `\n📸 Hero image prompt (1200×400px):\n${result.heroImagePrompt}`,
          `\n\`\`\`html\n${result.html}\n\`\`\``,
        ].join('');
        return { content: [{ type: 'text', text: response }] };
      }

      if (name === 'update_canvas_kb') {
        const { force } = (args ?? {}) as { force?: boolean };
        const result = await updateCanvasKb(force ?? false);
        const lines: string[] = [];
        if (!result.updated && result.changes.length === 0) {
          lines.push(`✓ KB is current (last checked: ${result.lastChecked})`);
          lines.push(`  ${result.cssPropsCount} CSS properties · ${result.htmlTagsCount} HTML tags tracked`);
        } else if (result.parseWarning) {
          lines.push(`⚠ ${result.parseWarning}`);
        } else {
          lines.push(`✓ KB updated from Canvas LMS source (${result.lastChecked})`);
          lines.push(`  ${result.cssPropsCount} CSS properties · ${result.htmlTagsCount} HTML tags`);
          if (result.changes.length > 0) {
            lines.push(`\nChanges:\n${result.changes.map(c => `  ${c}`).join('\n')}`);
          } else {
            lines.push('  No changes detected — allowlist is unchanged.');
          }
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      if (name === 'list_canvas_courses') {
        const config = loadConfig();
        const api = new CanvasApiClient(config);
        const result = await listCanvasCourses((args ?? {}) as ListCanvasCoursesInput, config, api, saveConfig);
        return { content: [{ type: 'text', text: result.text }] };
      }

      if (name === 'publish_to_canvas') {
        const config = loadConfig();
        const api = new CanvasApiClient(config);
        const result = await publishToCanvas(args as unknown as PublishToCanvasInput, config, api);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: 'error' in result,
        };
      }

      if (name === 'critique_canvas_page') {
        const input = args as unknown as CritiqueInput;
        const result = critiqueCanvasPage(input);

        const lines: string[] = [];
        lines.push(`Design Score: ${result.score}/100 (${result.mode} mode${input.pageType ? ` — ${input.pageType}` : ''})`);

        if (result.strengths.length > 0) {
          lines.push(`\n\nStrengths:\n${result.strengths.map(s => `  ✓ ${s}`).join('\n')}`);
        }

        if (result.findings.length === 0) {
          lines.push('\n\n✓ No design issues found.');
        } else {
          for (const p of ['high', 'medium', 'low'] as const) {
            const group = result.findings.filter(f => f.priority === p);
            if (group.length === 0) continue;
            lines.push(`\n\n${p.toUpperCase()} priority:\n` +
              group.map(f => `  [${f.area}] ${f.issue}\n  → ${f.suggestion}`).join('\n'));
          }
        }

        if (result.kbContext) {
          lines.push(`\n\n---\nDesign KB (comprehensive mode):\n${result.kbContext}`);
        }

        return { content: [{ type: 'text', text: lines.join('') }] };
      }

      if (name === 'redesign_canvas_page') {
        const input = args as unknown as RedesignInput;
        const result = redesignCanvasPage(input);

        const lines: string[] = [];

        if (result.appliedFixes.length > 0) {
          lines.push(`✓ Applied ${result.appliedFixes.length} fix(es):\n${result.appliedFixes.map(f => `  • ${f}`).join('\n')}`);
        } else {
          lines.push('No mechanical fixes were applicable.');
        }

        if (result.skippedFindings.length > 0) {
          lines.push(`\n\n⚠ ${result.skippedFindings.length} finding(s) need manual attention:\n` +
            result.skippedFindings.map(s => `  • ${s}`).join('\n'));
        }

        if (result.accessibilityWarnings?.length) {
          lines.push(`\n\nAccessibility (WCAG 2.1 AA — advisory):\n` +
            result.accessibilityWarnings.map(w => `  ⚠ ${w.check}: ${w.message}`).join('\n'));
        }

        if (result.kbContext) {
          lines.push(`\n\n---\nDesign KB (use this to complete remaining fixes):\n${result.kbContext}`);
        }

        lines.push(`\n\n\`\`\`html\n${result.html}\n\`\`\``);

        return { content: [{ type: 'text', text: lines.join('') }] };
      }

      if (name === 'ingest_assignment_folder') {
        if (!configExists()) {
          return {
            content: [{
              type: 'text',
              text: formatError({
                title: 'Setup Required',
                message: 'Canvas Design Studio needs institution config before generating pages.',
                cause: 'No institution.json found at ~/.canvas-design-mcp/institution.json.',
                fix: [
                  'Run setup_institution to save your institution colors, Canvas URL, and optional API token',
                  'The wizard takes about 2 minutes and only needs to run once',
                ],
                context: 'ingest_assignment_folder called with no institution config',
              }),
            }],
            isError: true,
          };
        }
        const config = loadConfig();
        const { folderPath } = (args ?? {}) as IngestAssignmentFolderInput;
        const result = ingestAssignmentFolder({ folderPath }, config);

        const lines: string[] = [
          `✓ Generated: ${result.filename}`,
          `  Course: ${result.courseInfo.courseName} (${result.courseInfo.courseNumber})`,
          `  Assignment: ${result.courseInfo.assignmentNumber} — ${result.courseInfo.semester}`,
          `  Brief: ${result.sources.sourceMap.brief}`,
        ];
        if (result.sources.rubric) lines.push(`  Rubric: ${result.sources.sourceMap.rubric}`);
        if (result.sources.shell) lines.push(`  Shell: ${result.sources.sourceMap.shell}`);
        if (result.sources.styleNotes) lines.push(`  Style Notes: ${result.sources.sourceMap.styleNotes}`);
        if (result.warnings.length > 0) {
          lines.push(`\n⚠ Warnings:\n${result.warnings.map(w => `  • ${w}`).join('\n')}`);
        }
        if (result.heroImagePrompt) {
          lines.push(`\n📸 Hero image prompt (1200×400px):\n${result.heroImagePrompt}`);
        }

        // Return raw sources so Claude can review brief/rubric/shell alignment
        lines.push(`\n---\n**Source content for review:**`);
        lines.push(`\n**Brief:**\n${result.sources.brief}`);
        if (result.sources.rubric) lines.push(`\n**Rubric:**\n${result.sources.rubric}`);
        if (result.sources.shell) lines.push(`\n**Shell:**\n${result.sources.shell}`);
        if (result.sources.styleNotes) lines.push(`\n**Style Notes:**\n${result.sources.styleNotes}`);

        lines.push(`\n\`\`\`html\n${result.html}\n\`\`\``);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      if (name === 'get_philosophy_kb') {
        const result = getPhilosophyKb();
        const lines: string[] = [];
        if (!result.exists) {
          lines.push('> No philosophy KB found. Returning template with interview questions.');
          lines.push('> To build the KB: run setup_institution or ask the professor the interview questions and call update_philosophy_kb for each answer.');
        }
        lines.push('> Apply this philosophy when generating, critiquing, or redesigning Canvas pages for this professor.');
        lines.push('');
        lines.push(`Sections populated — Core: ${result.sections.hasCore}, Course-specific: ${result.sections.hasCourseSpecific}, Quotes: ${result.sections.hasQuotes}, Lecture captures: ${result.sections.hasLectureCaptures}`);
        lines.push('');
        lines.push(result.content);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      if (name === 'update_philosophy_kb') {
        const input = args as unknown as UpdatePhilosophyKbInput;
        const result = updatePhilosophyKb(input);
        return { content: [{ type: 'text', text: result }] };
      }

      if (name === 'get_student_personas') {
        const result = getStudentPersonas();
        const lines: string[] = [];
        if (result.exists) {
          lines.push('> Saved personas found. Ask the professor whether to reuse these or generate a new set before reviewing.');
        } else {
          lines.push('> No personas saved yet. Ask the professor how many to generate, then call generate_student_personas.');
        }
        lines.push('');
        lines.push(result.content);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      if (name === 'generate_student_personas') {
        const input = (args ?? {}) as GenerateStudentPersonasInput;
        const result = generateStudentPersonas(input);
        return { content: [{ type: 'text', text: result }] };
      }

      if (name === 'load_canvas_page') {
        const { filename } = (args ?? {}) as LoadCanvasPageInput;
        const result = loadCanvasPage({ filename });
        return {
          content: [{
            type: 'text',
            text: `Loaded: ${result.filename}\n\n\`\`\`html\n${result.html}\n\`\`\``,
          }],
        };
      }

      if (name === 'save_canvas_page') {
        const { html, filename } = args as unknown as SaveCanvasPageInput;
        const result = saveCanvasPage({ html, filename });
        const lines = [`✓ Saved to ${result.saved}`];
        if (result.backup) lines.push(`  Backup created: ${result.backup}`);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      if (name === 'setup_course') {
        const { courseDir } = (args ?? {}) as { courseDir?: string };
        const created = await runCourseWizard(courseDir);
        return {
          content: [{ type: 'text', text: `✓ Course scaffold created.\n${created.length} files written:\n${created.map(f => `  • ${f}`).join('\n')}` }],
        };
      }

      if (name === 'generate_page') {
        const input = args as unknown as GeneratePageInput;
        const result = generatePage(input);
        return {
          content: [{ type: 'text', text: `✓ Generated ${result.pageType} page\n  Week: ${result.weekNumber || 'N/A'}\n  Saved: ${result.savedTo}` }],
        };
      }

      if (name === 'generate_week') {
        const input = args as unknown as GenerateWeekInput;
        const result = generateWeek(input);
        const lines = [`✓ Week ${result.weekNumber}: ${result.pages.length} page(s) generated`];
        for (const p of result.pages) lines.push(`  • ${p.pageType} → ${p.savedTo}`);
        if (result.warnings.length > 0) lines.push(`\n⚠ Warnings:\n${result.warnings.map(w => `  • ${w}`).join('\n')}`);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      if (name === 'generate_course') {
        const input = (args ?? {}) as GenerateCourseInput;
        const result = generateCourse(input);
        const lines = [
          `✓ Course generated: ${result.totalPages} page(s) across ${result.weekResults.length} week(s)`,
          `  Output: ${result.outputDir}`,
        ];
        if (result.warnings.length > 0) lines.push(`\n⚠ Warnings (${result.warnings.length}):\n${result.warnings.map(w => `  • ${w}`).join('\n')}`);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      if (name === 'import_course') {
        const { archivePath, outputDir, weekNumber, assignmentName } = (args ?? {}) as unknown as ImportCourseInput & { outputDir?: string };
        const result = importCourse({
          archivePath,
          outputDir: outputDir ?? 'course',
          weekNumber,
          assignmentName,
        });
        const lines = [
          `✓ Import complete`,
          `  Weeks imported: ${result.weeksImported}`,
          `  Files created: ${result.filesCreated}`,
        ];
        if (result.warnings.length > 0) {
          lines.push(`\n⚠ Warnings (${result.warnings.length}):`);
          lines.push(...result.warnings.map(w => `  • ${w}`));
        }
        lines.push('\nNext steps:');
        lines.push('  1. Open course-config.md — update semester, professor name, and week topics');
        lines.push('  2. Search for [NEEDS REVIEW] in .md files and fill in missing content');
        lines.push('  3. Tell Claude: "Generate the course from the course/ folder"');
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      if (name === 'fetch_brand_colors') {
        const { url } = args as { url: string };
        return { content: [{ type: 'text', text: await fetchBrandColors(url) }] };
      }

      if (name === 'render_widget') {
        const result = await renderWidget(args as { specPath: string; allowExperimental?: boolean });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      if (name === 'publish_widget') {
        const result = await publishWidget(args as unknown as Parameters<typeof publishWidget>[0]);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      if (name === 'validate_worksheet') {
        const { worksheetContent } = args as { worksheetContent: string };
        return { content: [{ type: 'text', text: validateWorksheetTool(worksheetContent) }] };
      }

      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

export { canvasSafeTransform } from './utils/transform.js';
export type { TransformResult } from './utils/transform.js';
export { renderPageDecoupled } from './utils/render-engine.js';
export type { RenderEngineInput, RenderEngineResult } from './utils/render-engine.js';
export { auditAccessibility } from './tools/accessibility.js';
export type { AccessibilityWarning } from './tools/accessibility.js';

