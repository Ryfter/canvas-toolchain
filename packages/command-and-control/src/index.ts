#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { CI_TOOLS } from './passthrough/ci_tools.js';
import { DOWNLOADER_TOOLS, downloadCanvasArchive, type DownloadCanvasArchiveInput } from './passthrough/downloader_tools.js';
import { DESIGN_TOOLS } from './passthrough/design_tools.js';
import { setupCc } from './tools/setup_cc.js';
import { getCcStatus } from './tools/get_cc_status.js';
import { analyzeCourse } from './tools/workflows/analyze_course.js';
import { planNextSemester } from './tools/workflows/plan_next_semester.js';
import { updateCourseMaterials } from './tools/workflows/update_course_materials.js';
import { fullPipeline } from './tools/workflows/full_pipeline.js';
import { installResource } from './registry/install_resource.js';
import { listInstalledResources, uninstallResource } from './registry/local_registry.js';
import { searchRegistry } from './registry/search_registry.js';
import { installResourcesFromLockfile } from './registry/lockfile_install.js';
import { pasteLayout, saveLayoutAsTemplate } from './tools/layout_adapter.js';
import { setupPanopto } from './tools/setup_panopto.js';
import { setupAnthropic } from './tools/setup_anthropic.js';
import { setupCanvas } from './tools/setup_canvas.js';
import { checkForUpdates, getUpdateNotice } from './update/check.js';
import {
  bulkFetchPanoptoTranscripts,
  type BulkFetchPanoptoTranscriptsInput,
  type ProgressCallback,
} from './tools/workflows/bulk_fetch_panopto_transcripts.js';
import { setupPanoptoVocab } from './tools/setup_panopto_vocab.js';
import {
  enrichPanoptoTranscripts,
  type EnrichPanoptoTranscriptsInput,
} from './tools/workflows/enrich_panopto_transcripts.js';
import {
  setupTranscriptSource,
  type SetupTranscriptSourceInput,
} from './tools/setup_transcript_source.js';
import {
  compareTranscriptsWorkflow,
  type CompareTranscriptsInput,
} from './tools/workflows/compare_transcripts.js';
import {
  previewCoursePublish,
  type PreviewCoursePublishInput,
} from './tools/workflows/preview_course_publish.js';
import {
  publishCourse,
  type PublishCourseInput,
} from './tools/workflows/publish_course.js';
import {
  rollbackCoursePublish,
  type RollbackCoursePublishInput,
} from './tools/workflows/rollback_course_publish.js';
import { draftStudentRubric } from './tools/workflows/draft_student_rubric.js';
import type { DraftStudentRubricInput } from './tools/rubric/types.js';

const ALL_PASSTHROUGH = [...CI_TOOLS, ...DOWNLOADER_TOOLS, ...DESIGN_TOOLS];

const server = new Server(
  { name: 'command-and-control', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Fire-and-forget background check — never blocks startup.
void checkForUpdates();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Observability & config ──────────────────────────────────────────────
    {
      name: 'setup_cc',
      description: 'Configure Command & Control: set mode (easy/advanced), Anthropic model, Ollama base URL and model, and routing preferences. Run this first.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          mode: { type: 'string', enum: ['easy', 'advanced'] },
          anthropicModel: { type: 'string', description: 'Anthropic model name, e.g. "claude-sonnet-4-6".' },
          ollamaBaseUrl: { type: 'string', description: 'Ollama server URL, e.g. "http://localhost:11434".' },
          ollamaModel: { type: 'string', description: 'Ollama model name, e.g. "llama3.2".' },
          routingFast: { type: 'string', enum: ['anthropic', 'ollama'] },
          routingJudgment: { type: 'string', enum: ['anthropic', 'ollama'] },
          downloaderPath: { type: 'string', description: 'Absolute path to the canvas-backup executable (or canvas-backup.exe). Persisted in config — professors set this once instead of managing env vars.' },
          registryToken: { type: 'string', description: 'Premium registry token for ryfter:// resources. Stored locally and never echoed back.' },
          premiumRegistryBaseUrl: { type: 'string', description: 'Optional premium registry API base URL override.' },
          registryGithubOrg: { type: 'string', description: 'Optional GitHub org override for the free registry. Defaults to canvas-toolchain.' },
        },
      },
    },
    {
      name: 'setup_anthropic',
      description: 'Configure the Anthropic API key used by all AI-powered tools. Validates the key against the Anthropic API before saving. Stored locally at ~/.command-and-control/anthropic-config.json with 0o600 permissions.',
      inputSchema: {
        type: 'object' as const,
        required: ['apiKey'],
        properties: {
          apiKey: { type: 'string', description: 'Anthropic API key starting with sk-ant-. Stored locally and never echoed back.' },
          model: { type: 'string', description: 'Anthropic model name for validation calls, e.g. "claude-haiku-4-5-20251001" (default).' },
          test: { type: 'boolean', description: 'Validate the key with a 1-token API call before saving (default: true).' },
        },
      },
    },
    {
      name: 'setup_canvas',
      description: 'Configure the Canvas LMS host and API token used for direct page publishing. Validates the token against /api/v1/users/self before saving. Stored locally at ~/.command-and-control/canvas-config.json with 0o600 permissions.',
      inputSchema: {
        type: 'object' as const,
        required: ['host', 'token'],
        properties: {
          host: { type: 'string', description: 'Canvas hostname, e.g. "bsu.instructure.com". Leading https:// is stripped automatically.' },
          token: { type: 'string', description: 'Canvas API access token from Canvas → Account → Settings → New Access Token. Stored locally and never echoed back.' },
          test: { type: 'boolean', description: 'Validate the token with /api/v1/users/self before saving (default: true).' },
        },
      },
    },
    {
      name: 'get_cc_status',
      description: 'Get a health snapshot: which domain packages are installed, whether Anthropic key and Ollama are available, active routing config, and last-run timestamps per workflow.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    // ── High-level workflows ────────────────────────────────────────────────
    {
      name: 'analyze_course',
      description: 'Answer "how stale is my course?" — ingests the Canvas archive, scores topic currency, and generates KEEP/UPDATE/DROP/ADD verdicts in one step.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'archivePath'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          archivePath: { type: 'string', description: 'Absolute path to the Canvas export folder.' },
        },
      },
    },
    {
      name: 'plan_next_semester',
      description: 'Answer "get me ready to plan next semester" — imports previous shell, fetches the academic calendar, shifts all due dates, and generates a recommended outline.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'sourceSemesterId', 'newSemesterId'],
        properties: {
          courseId: { type: 'string' },
          sourceSemesterId: { type: 'string' },
          newSemesterId: { type: 'string' },
          source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
          semesterPattern: { type: 'string', description: 'Semester ID used for calendar inference, e.g. "Fall2026".' },
          calendarUrl: { type: 'string' },
          manualDates: { type: 'object' },
          onBreakCollision: { type: 'string', enum: ['flag', 'bump-before', 'bump-after'] },
          sections: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'update_course_materials',
      description: 'Answer "update my materials and export" — drafts updated briefs for every assignment in next-plan/, runs the examples update pass, and exports to CDS format.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          outputPath: { type: 'string' },
          sections: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'full_pipeline',
      description: 'Run analyze_course → plan_next_semester → update_course_materials end-to-end. Returns results from all three phases.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'sourceSemesterId', 'newSemesterId', 'archivePath'],
        properties: {
          courseId: { type: 'string' },
          sourceSemesterId: { type: 'string' },
          newSemesterId: { type: 'string' },
          archivePath: { type: 'string' },
          source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
          semesterPattern: { type: 'string' },
          calendarUrl: { type: 'string' },
          manualDates: { type: 'object' },
          onBreakCollision: { type: 'string', enum: ['flag', 'bump-before', 'bump-after'] },
          sections: { type: 'array', items: { type: 'string' } },
          outputPath: { type: 'string' },
        },
      },
    },
    // ── Panopto transcripts ─────────────────────────────────────────────────
    {
      name: 'setup_panopto',
      description: 'Configure Panopto integration: set domain, clientId, and clientSecret. Validates credentials before saving. Run this once per institution setup.',
      inputSchema: {
        type: 'object' as const,
        required: ['domain', 'clientId', 'clientSecret'],
        properties: {
          domain: { type: 'string', description: 'Panopto hostname, e.g. "bsu.hosted.panopto.com".' },
          clientId: { type: 'string', description: 'OAuth2 client ID from the Panopto admin panel.' },
          clientSecret: { type: 'string', description: 'OAuth2 client secret. Stored locally, never echoed back.' },
          iframeWhitelisted: { type: 'boolean', description: 'Whether your Canvas instance allows Panopto iframes. Null = unknown.', nullable: true },
          test: { type: 'boolean', description: 'Validate credentials before saving (default: true). Set false for scripted setup.' },
        },
      },
    },
    {
      name: 'bulk_fetch_panopto_transcripts',
      description: 'Download all Panopto transcripts for a folder as VTT files. Optionally auto-ingests into Curriculum Intelligence. Requires setup_panopto to be run first.',
      inputSchema: {
        type: 'object' as const,
        required: ['folderId', 'outputPath'],
        properties: {
          folderId: { type: 'string', description: 'Panopto folder ID (visible in the folder URL).' },
          outputPath: { type: 'string', description: 'Absolute path where VTT files will be saved.' },
          courseId: { type: 'string', description: 'If provided with semesterId, auto-ingests into Curriculum Intelligence.' },
          semesterId: { type: 'string', description: 'If provided with courseId, auto-ingests into Curriculum Intelligence.' },
          copy: { type: 'boolean', description: 'Copy VTT files into the CI semester folder during ingest (default: false).' },
        },
      },
    },
    {
      name: 'setup_panopto_vocab',
      description: 'Manage professor vocabulary corrections and filler words for transcript enrichment. Add or remove vocab entries used by enrich_panopto_transcripts.',
      inputSchema: {
        type: 'object' as const,
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['add-correction', 'add-filler', 'remove-correction', 'list'],
            description: 'list: show current vocab. add-correction: add a find/replace pair. add-filler: add a word to the filler list. remove-correction: remove a correction by its from value.',
          },
          from: { type: 'string', description: 'Required for add-correction and remove-correction. The source word/phrase to find.' },
          to: { type: 'string', description: 'Required for add-correction. The replacement word/phrase.' },
          word: { type: 'string', description: 'Required for add-filler. The filler word to add.' },
        },
      },
    },
    {
      name: 'enrich_panopto_transcripts',
      description: 'Generate enriched markdown from downloaded Panopto VTT files. Adds Week/Date headers, deep links every 5 minutes, strips filler words, applies vocab corrections, and highlights key statements as blockquotes. Requires bulk_fetch_panopto_transcripts to have been run first.',
      inputSchema: {
        type: 'object' as const,
        required: ['transcriptsPath'],
        properties: {
          transcriptsPath: {
            type: 'string',
            description: 'Absolute path to the folder where bulk_fetch_panopto_transcripts wrote VTT files and _sessions.json.',
          },
        },
      },
    },
    {
      name: 'setup_transcript_source',
      description: 'Configure which transcript source enrichment uses (panopto default, or whisper) plus the Whisper engine, model, and audioMode. action=get reads current config; action=set updates provided fields.',
      inputSchema: {
        type: 'object' as const,
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['get', 'set'], description: 'get: show current config. set: update provided fields.' },
          source: { type: 'string', enum: ['panopto', 'whisper'], description: 'Which transcript enrichment reads. Default panopto (Whisper off).' },
          engine: { type: 'string', description: 'Transcription engine name. Default faster-whisper.' },
          model: { type: 'string', description: 'Whisper model size: tiny | base | small | medium | large-v3. Default medium.' },
          audioMode: { type: 'string', enum: ['auto', 'manual'], description: 'auto: try API audio download then guided web-download fallback. manual: skip API, go straight to guided web-download.' },
        },
      },
    },
    {
      name: 'compare_transcripts',
      description: 'Opt-in: transcribe Panopto lecture audio locally with Whisper and compare it against the Panopto VTT. Writes a .comparison.md per session ranking disagreements, and returns suggested vocab corrections for you to approve (nothing is written to panopto-vocab.json automatically). Needs audio — auto-fetched when available, otherwise follow the returned guided web-download instructions. Requires bulk_fetch_panopto_transcripts first.',
      inputSchema: {
        type: 'object' as const,
        required: ['transcriptsPath'],
        properties: {
          transcriptsPath: { type: 'string', description: 'Absolute path to the folder bulk_fetch_panopto_transcripts wrote to.' },
          sessionIds: { type: 'array', items: { type: 'string' }, description: 'Optional subset of session IDs to compare. Default: all sessions in the manifest.' },
          model: { type: 'string', description: 'Optional one-run Whisper model override (otherwise uses transcript-config model).' },
          keepAudio: { type: 'boolean', description: 'Keep auto-fetched audio after transcription. Default false (deletes it; manually-supplied audio is always kept).' },
        },
      },
    },
    // ── Course publish ─────────────────────────────────────────────────────
    {
      name: 'preview_course_publish',
      description: 'Generate a publish preview: per-page diffs, warnings, and a manifest. No Canvas writes occur.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseDir', 'courseId'],
        properties: {
          courseDir: { type: 'string', description: 'Canvas Design Studio course folder.' },
          courseId:  { type: 'number', description: 'Canvas course numeric ID.' },
          outputDir: { type: 'string', description: 'Override for generate_course\'s output folder.' },
          fullDiffFor: { type: 'array', items: { type: 'string' }, description: 'Filenames to surface the full unified diff for.' },
        },
      },
    },
    {
      name: 'publish_course',
      description: 'Publish the previewed manifest to Canvas with explicit per-entry approvals. Stops on first failure.',
      inputSchema: {
        type: 'object' as const,
        required: ['snapshotId', 'approvals'],
        properties: {
          snapshotId: { type: 'string' },
          approvals:  {
            type: 'object',
            description: 'Map of manifest entry filename → \'approve\' or \'skip\'. Every non-skipped manifest entry must appear.',
            additionalProperties: { enum: ['approve', 'skip'] as const },
          },
          resume:     { type: 'boolean', description: 'Continue a prior partial publish from its failure point.' },
          gitCommit:  { type: 'boolean', description: 'Commit + tag in courseDir. Defaults to true when courseDir is a git repo.' },
          pushTag:    { type: 'boolean', description: 'If a git remote is configured, push the success tag.' },
        },
      },
    },
    {
      name: 'rollback_course_publish',
      description: 'Restore every successfully-published entry from a snapshot to its prior Canvas state.',
      inputSchema: {
        type: 'object' as const,
        required: ['snapshotId'],
        properties: { snapshotId: { type: 'string' } },
      },
    },
    {
      name: 'draft_student_rubric',
      description: 'Take a faculty-facing rubric and use the Anthropic API to produce a student-facing rewrite plus worked examples per criterion. Writes a markdown file matching the CDS rubric page-type schema so generate_course can render it as a Canvas page + downloadable .md for students to paste into an LLM. Run setup_anthropic first if not configured.',
      inputSchema: {
        type: 'object' as const,
        required: ['facultyRubricText', 'outputPath'],
        properties: {
          facultyRubricText:  { type: 'string', description: 'Raw faculty-facing rubric text. Can be markdown, plain text, or pasted from Canvas/Word.' },
          assignmentBrief:    { type: 'string', description: 'Optional: what the assignment actually asks students to do. Used to ground worked examples in concrete task language.' },
          courseContext:      { type: 'string', description: 'Optional: course title, level, modality, anything for tailoring student-facing tone.' },
          outputPath:         { type: 'string', description: 'Absolute path to write the generated markdown file.' },
          week:               { type: 'number', description: 'Front matter: week number for the page.' },
          title:              { type: 'string', description: 'Front matter: page title. Defaults to "Rubric — Assignment {assignmentNumber}".' },
          totalPoints:        { type: 'number', description: 'Front matter: total points for the assignment.' },
          assignmentNumber:   { type: 'string', description: 'Front matter: assignment number, e.g. "7.3".' },
        },
      },
    },
    // ── Resource registry ──────────────────────────────────────────────────
    {
      name: 'install_resource',
      description: 'Install a template, theme, prompt, or adapter-config resource from github://, ryfter://, or file:// into the local registry.',
      inputSchema: {
        type: 'object' as const,
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Resource URL, e.g. github://canvas-toolchain/templates/comparison-layout-academic@1.2.0' },
        },
      },
    },
    {
      name: 'list_installed_resources',
      description: 'List resources installed in the local registry, optionally filtered by kind.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          kind: { type: 'string', enum: ['template', 'theme', 'prompt', 'adapter-config', 'bundle'] },
        },
      },
    },
    {
      name: 'uninstall_resource',
      description: 'Remove a resource from the local registry by kind and id. Bundle entries also remove their included resources.',
      inputSchema: {
        type: 'object' as const,
        required: ['kind', 'id'],
        properties: {
          kind: { type: 'string', enum: ['template', 'theme', 'prompt', 'adapter-config', 'bundle'] },
          id: { type: 'string' },
          version: { type: 'string', description: 'Optional version. When omitted, all installed versions for the kind/id are removed.' },
        },
      },
    },
    {
      name: 'search_registry',
      description: 'Search available registry resources from the free GitHub registry or configured premium registry.',
      inputSchema: {
        type: 'object' as const,
        required: ['query'],
        properties: {
          query: { type: 'string' },
          kind: { type: 'string', enum: ['template', 'theme', 'prompt', 'adapter-config', 'bundle'] },
          tier: { type: 'string', enum: ['free', 'premium'] },
        },
      },
    },
    {
      name: 'install_resources_from_lockfile',
      description: 'Install resources listed in a plain-text or JSON lockfile, preserving order and skipping already-installed versions.',
      inputSchema: {
        type: 'object' as const,
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Absolute path to a lockfile containing one URL per line or a JSON array of URLs.' },
        },
      },
    },
    {
      name: 'paste_layout',
      description: 'Paste raw HTML and CSS (e.g. from Stitch or Figma) to adapt it into a Canvas-safe slot layout and audit accessibility.',
      inputSchema: {
        type: 'object' as const,
        required: ['html'],
        properties: {
          html: { type: 'string', description: 'Raw HTML structure.' },
          css: { type: 'string', description: 'Optional raw CSS stylesheet to inline.' },
          sourceTool: { type: 'string', description: 'Optional identifier of the origin tool (e.g. "stitch").' },
          intent: { type: 'string', description: 'Optional semantic explanation of what the layout represents.' },
          desiredSlots: { type: 'array', items: { type: 'string' }, description: 'Optional list of desired slot names.' },
        },
      },
    },
    {
      name: 'save_layout_as_template',
      description: 'Formulate and save a successfully adapted layout as a reusable template in the local registry.',
      inputSchema: {
        type: 'object' as const,
        required: ['layout', 'templateId', 'templateVersion'],
        properties: {
          layout: {
            type: 'object',
            description: 'The AdaptedLayout result returned by paste_layout.',
            required: ['canvasSafeHtml', 'slotMap', 'removed', 'violations', 'accessibility'],
            properties: {
              canvasSafeHtml: { type: 'string' },
              slotMap: { type: 'object' },
              removed: { type: 'array', items: { type: 'object' } },
              violations: { type: 'array', items: { type: 'object' } },
              accessibility: { type: 'object' },
            },
          },
          templateId: { type: 'string', description: 'The custom template ID, e.g. "timeline-layout".' },
          templateVersion: { type: 'string', description: 'The semantic version, e.g. "1.0.0".' },
        },
      },
    },
    // ── Pass-through tools ──────────────────────────────────────────────────
    ...ALL_PASSTHROUGH.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    })),
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'setup_cc':
        result = setupCc(args as Parameters<typeof setupCc>[0]);
        break;
      case 'setup_anthropic':
        result = await setupAnthropic(args as unknown as Parameters<typeof setupAnthropic>[0]);
        break;
      case 'setup_canvas':
        result = await setupCanvas(args as unknown as Parameters<typeof setupCanvas>[0]);
        break;
      case 'get_cc_status':
        result = await getCcStatus();
        break;
      case 'analyze_course':
        result = await analyzeCourse(args as unknown as Parameters<typeof analyzeCourse>[0]);
        break;
      case 'plan_next_semester':
        result = await planNextSemester(args as unknown as Parameters<typeof planNextSemester>[0]);
        break;
      case 'update_course_materials':
        result = await updateCourseMaterials(args as unknown as Parameters<typeof updateCourseMaterials>[0]);
        break;
      case 'setup_panopto':
        result = await setupPanopto(args as unknown as Parameters<typeof setupPanopto>[0]);
        break;
      case 'bulk_fetch_panopto_transcripts': {
        const progressToken = extra._meta?.progressToken;
        let progressCount = 0;
        const onProgress: ProgressCallback | undefined = progressToken != null
          ? (event) => {
              progressCount++;
              const icon =
                event.type === 'session-complete' ? '✓'
                : event.type === 'session-failed' ? '✗'
                : '→';
              const message = `[${event.index + 1}/${event.total}] ${icon} ${event.title}${
                event.reason ? ` — ${event.reason}` : ''
              }`;
              void extra.sendNotification({
                method: 'notifications/progress',
                params: { progressToken, progress: progressCount, message },
              });
            }
          : undefined;
        result = await bulkFetchPanoptoTranscripts(
          args as unknown as BulkFetchPanoptoTranscriptsInput,
          onProgress,
        );
        break;
      }
      case 'setup_panopto_vocab':
        result = setupPanoptoVocab(args as unknown as Parameters<typeof setupPanoptoVocab>[0]);
        break;
      case 'enrich_panopto_transcripts':
        result = await enrichPanoptoTranscripts(args as unknown as EnrichPanoptoTranscriptsInput);
        break;
      case 'setup_transcript_source':
        result = await setupTranscriptSource(args as unknown as SetupTranscriptSourceInput);
        break;
      case 'compare_transcripts':
        result = await compareTranscriptsWorkflow(args as unknown as CompareTranscriptsInput);
        break;
      case 'preview_course_publish':
        result = await previewCoursePublish(args as unknown as PreviewCoursePublishInput);
        break;
      case 'publish_course':
        result = await publishCourse(args as unknown as PublishCourseInput);
        break;
      case 'rollback_course_publish':
        result = await rollbackCoursePublish(args as unknown as RollbackCoursePublishInput);
        break;
      case 'draft_student_rubric':
        result = await draftStudentRubric(args as unknown as DraftStudentRubricInput);
        break;
      case 'full_pipeline':
        result = await fullPipeline(args as unknown as Parameters<typeof fullPipeline>[0]);
        break;
      case 'install_resource':
        result = await installResource(args as unknown as Parameters<typeof installResource>[0]);
        break;
      case 'list_installed_resources':
        result = listInstalledResources(args as unknown as Parameters<typeof listInstalledResources>[0]);
        break;
      case 'uninstall_resource':
        result = uninstallResource(args as unknown as Parameters<typeof uninstallResource>[0]);
        break;
      case 'search_registry':
        result = await searchRegistry(args as unknown as Parameters<typeof searchRegistry>[0]);
        break;
      case 'install_resources_from_lockfile':
        result = await installResourcesFromLockfile(args as unknown as Parameters<typeof installResourcesFromLockfile>[0]);
        break;
      case 'paste_layout':
        result = await pasteLayout(args as unknown as Parameters<typeof pasteLayout>[0]);
        break;
      case 'save_layout_as_template':
        result = await saveLayoutAsTemplate(args as unknown as Parameters<typeof saveLayoutAsTemplate>[0]);
        break;
      case 'download_canvas_archive': {
        // Special-cased so we can forward Canvas Backup's per-download progress events
        // to the MCP client via notifications/progress when a progressToken is provided.
        const progressToken = extra._meta?.progressToken;
        let progressCount = 0;
        const onProgress = progressToken != null
          ? (message: string) => {
              progressCount++;
              void extra.sendNotification({
                method: 'notifications/progress',
                params: { progressToken, progress: progressCount, message },
              });
            }
          : undefined;
        result = await downloadCanvasArchive(args as unknown as DownloadCanvasArchiveInput, onProgress);
        break;
      }
      default: {
        const tool = ALL_PASSTHROUGH.find((t) => t.name === name);
        if (!tool) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }], isError: true };
        }
        result = await Promise.resolve(tool.handler(args));
      }
    }

    const notice = getUpdateNotice();
    const text = JSON.stringify(result, null, 2) + (notice ?? '');
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
