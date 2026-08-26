import type { Operation } from './operation.js';
import type { PassthroughTool } from '../passthrough/ci_tools.js';
import { setupCc } from '../tools/setup_cc.js';
import { setupAnthropic } from '../tools/setup_anthropic.js';
import { setupCanvas } from '../tools/setup_canvas.js';
import { setupOllama } from '../tools/setup_ollama.js';
import { showCanvasCapabilities } from '../tools/showcase/show_canvas_capabilities.js';
import { previewCanvasPattern } from '../tools/showcase/preview_canvas_pattern.js';
import { setActiveLlmProvider } from '../tools/set_active_llm_provider.js';
import { setModuleEnabled } from '../tools/set_module_enabled.js';
import { listModules } from '../tools/list_modules.js';
import { browseModuleCatalog, installModuleTool, uninstallModuleTool } from '../tools/module_channel_tools.js';
import { discoverTools } from '../tools/discover_tools.js';
import { saveInstitutionProfile } from '../tools/save_institution_profile.js';
import { submitUsageFeedback } from '../tools/submit_usage_feedback.js';
import { setCourseAiasDefault } from '../tools/set_course_aias_default.js';
import { setCoursesRoot } from '../tools/set_courses_root.js';
import { openDashboard } from '../tools/open_dashboard.js';
import { getCcStatus } from '../tools/get_cc_status.js';
import { analyzeCourse } from '../tools/workflows/analyze_course.js';
import { planNextSemester } from '../tools/workflows/plan_next_semester.js';
import { updateCourseMaterials } from '../tools/workflows/update_course_materials.js';
import { fullPipeline } from '../tools/workflows/full_pipeline.js';
import { bulkFetchPanoptoTranscripts } from '../tools/workflows/bulk_fetch_panopto_transcripts.js';
import { enrichPanoptoTranscripts } from '../tools/workflows/enrich_panopto_transcripts.js';
import { setupTranscriptSource } from '../tools/setup_transcript_source.js';
import { compareTranscriptsWorkflow } from '../tools/workflows/compare_transcripts.js';
import { previewCoursePublish } from '../tools/workflows/preview_course_publish.js';
import { publishCourse } from '../tools/workflows/publish_course.js';
import { rollbackCoursePublish } from '../tools/workflows/rollback_course_publish.js';
import { listPublishSnapshots } from '../tools/workflows/list_publish_snapshots.js';
import { prunePublishSnapshots } from '../tools/workflows/prune_publish_snapshots.js';
import { setupLectureAnswers } from '../tools/workflows/setup_lecture_answers.js';
import { indexCourseForAnswers } from '../tools/workflows/index_course_for_answers.js';
import { askCourse } from '../tools/workflows/ask_course.js';
import { reembedCourseIndex } from '../tools/workflows/reembed_course_index.js';
import { snapshotCourse } from '../tools/workflows/snapshot_course.js';
import { draftStudentRubric } from '../tools/workflows/draft_student_rubric.js';
import { reviewCanvasRubric } from '../tools/workflows/review_canvas_rubric.js';
import { accessibilityReviewQueue } from '../tools/workflows/accessibility_review_queue.js';
import { auditCourseAccessibility } from '../tools/workflows/audit_course_accessibility.js';
import { reviewAccessibilityPolicy } from '../tools/review_accessibility_policy.js';
import { waveDeepCheckTool } from '../tools/wave_deep_check.js';
import { brainstormInteractive } from '../tools/workflows/brainstorm_interactive.js';
import { installResource } from '../registry/install_resource.js';
import { listInstalledResources, uninstallResource } from '../registry/local_registry.js';
import { searchRegistry } from '../registry/search_registry.js';
import { installResourcesFromLockfile } from '../registry/lockfile_install.js';
import { pasteLayout, saveLayoutAsTemplate } from '../tools/layout_adapter.js';
import { setupCourse } from '@canvas-toolchain/curriculum-intelligence/dist/tools/setup_course.js';
import { getCourseState } from '@canvas-toolchain/curriculum-intelligence/dist/tools/get_course_state.js';
import { ingestCanvasArchive } from '@canvas-toolchain/curriculum-intelligence/dist/tools/ingest_canvas_archive.js';
import { listAssignments } from '@canvas-toolchain/curriculum-intelligence/dist/tools/list_assignments.js';
import { listPages } from '@canvas-toolchain/curriculum-intelligence/dist/tools/list_pages.js';
import { listModules as listCanvasModules } from '@canvas-toolchain/curriculum-intelligence/dist/tools/list_modules.js';
import { listResources } from '@canvas-toolchain/curriculum-intelligence/dist/tools/list_resources.js';
import { diffSemesters } from '@canvas-toolchain/curriculum-intelligence/dist/tools/diff_semesters.js';
import { ingestTranscripts } from '@canvas-toolchain/curriculum-intelligence/dist/tools/ingest_transcripts.js';
import { mapTranscriptsToWeeks } from '@canvas-toolchain/curriculum-intelligence/dist/tools/map_transcripts_to_weeks.js';
import { extractLectureTopics } from '@canvas-toolchain/curriculum-intelligence/dist/tools/extract_lecture_topics.js';
import { findOffSyllabusTopics } from '@canvas-toolchain/curriculum-intelligence/dist/tools/find_off_syllabus_topics.js';
import { buildQuoteBank } from '@canvas-toolchain/curriculum-intelligence/dist/tools/build_quote_bank.js';
import { fetchNewsFeed } from '@canvas-toolchain/curriculum-intelligence/dist/tools/fetch_news_feed.js';
import { scanRecentDevelopments } from '@canvas-toolchain/curriculum-intelligence/dist/tools/scan_recent_developments.js';
import { suggestTopics } from '@canvas-toolchain/curriculum-intelligence/dist/tools/suggest_topics.js';
import { scoreTopicCurrency } from '@canvas-toolchain/curriculum-intelligence/dist/tools/score_topic_currency.js';
import { recommendForTopic } from '@canvas-toolchain/curriculum-intelligence/dist/tools/recommend_for_topic.js';
import { generateIdeasFile } from '@canvas-toolchain/curriculum-intelligence/dist/tools/generate_ideas_file.js';
import { importPreviousShell } from '@canvas-toolchain/curriculum-intelligence/dist/tools/import_previous_shell.js';
import { fetchAcademicCalendar } from '@canvas-toolchain/curriculum-intelligence/dist/tools/fetch_academic_calendar.js';
import { shiftDates } from '@canvas-toolchain/curriculum-intelligence/dist/tools/shift_dates.js';
import { generateRecommendedOutline } from '@canvas-toolchain/curriculum-intelligence/dist/tools/generate_recommended_outline.js';
import { draftAssignmentBrief } from '@canvas-toolchain/curriculum-intelligence/dist/tools/draft_assignment_brief.js';
import { CI_TOOLS } from '../passthrough/ci_tools.js';
import { exportCourseFolder } from '@canvas-toolchain/curriculum-intelligence/dist/tools/export_course_folder.js';

/**
 * Reuse a pass-through tool's existing handler by reference. Used for the few
 * pass-through handlers that are more than a bare delegation, so their logic is
 * never copied or reimplemented here.
 */
function passthroughHandler(tools: PassthroughTool[], name: string): PassthroughTool['handler'] {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`pass-through tool not found: ${name}`);
  return tool.handler;
}

/**
 * Every core operation the server can perform, with the exposure that decides
 * whether it surfaces as an intent-tool action, in the `ct_advanced` sidecar, or
 * only as a step inside another operation.
 *
 * Descriptions and input schemas are copied verbatim from the tool definitions in
 * `src/index.ts` and `src/passthrough/*.ts`; handlers re-address the existing
 * exported functions. Exposure, intent tool, and intent action come from the
 * disposition table in
 * `docs/superpowers/specs/2026-08-26-mcp-tool-consolidation-design.md`.
 */
export const CORE_OPERATIONS: Operation[] = [
  // ── Core: inline tools (src/index.ts) ──────────────────────────────────
  {
    id: 'setup_cc',
    section: 'admin',
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
    handler: (args) => setupCc(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'cc',
  },
  {
    id: 'setup_anthropic',
    section: 'admin',
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
    handler: (args) => setupAnthropic(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'anthropic',
  },
  {
    id: 'setup_canvas',
    section: 'admin',
    description: 'Configure the Canvas LMS host and API token used for direct page publishing. Validates the token against /api/v1/users/self before saving. Stored locally at ~/.command-and-control/canvas-config.json with 0o600 permissions.',
    inputSchema: {
      type: 'object' as const,
      required: ['host', 'token'],
      properties: {
        host: { type: 'string', description: 'Canvas hostname, e.g. "example.instructure.com". Leading https:// is stripped automatically.' },
        token: { type: 'string', description: 'Canvas API access token from Canvas → Account → Settings → New Access Token. Stored locally and never echoed back.' },
        test: { type: 'boolean', description: 'Validate the token with /api/v1/users/self before saving (default: true).' },
      },
    },
    handler: (args) => setupCanvas(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'canvas',
  },
  {
    id: 'setup_ollama',
    section: 'admin',
    description: 'Configure Ollama as the local generation LLM. Discovery mode (no model) returns the recommended-models markdown. Commit mode (with model) validates the model is pulled and writes ollama-config.json.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        baseUrl: { type: 'string', description: 'Ollama base URL. Default http://localhost:11434.' },
        model: { type: 'string', description: 'Ollama model ID. Omit for discovery mode.' },
      },
    },
    handler: (args) => setupOllama(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'ollama',
  },
  {
    id: 'show_canvas_capabilities',
    section: 'design',
    description:
      "Returns the catalog of Canvas-safe design patterns. Optionally filter by category " +
      "(layout, information, interactive, pedagogical, branded) or supportStatus " +
      "(supported, partial, aspirational). Use this to discover what patterns exist; " +
      "then call preview_canvas_pattern to see any specific pattern rendered.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Filter to one category id.' },
        supportStatus: {
          type: 'string',
          enum: ['supported', 'partial', 'aspirational'],
          description: 'Filter by supportStatus.',
        },
      },
    },
    handler: (args) => showCanvasCapabilities(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'preview_canvas_pattern',
    section: 'design',
    description:
      "Renders a specific Canvas capability pattern to a standalone HTML file " +
      "that can be opened in any browser. Use this after show_canvas_capabilities " +
      "to actually see a pattern in action.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        patternId: { type: 'string', description: 'Pattern ID from show_canvas_capabilities.' },
      },
      required: ['patternId'],
    },
    handler: (args) => previewCanvasPattern(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_build',
    intentAction: 'layout',
  },
  {
    id: 'set_active_llm_provider',
    section: 'admin',
    description: 'Set the active generation LLM provider. Must be anthropic or ollama. Refuses to set a provider whose config file is absent.',
    inputSchema: {
      type: 'object' as const,
      required: ['provider'],
      properties: {
        provider: { type: 'string', enum: ['anthropic', 'ollama'], description: 'anthropic or ollama' },
      },
    },
    handler: (args) => setActiveLlmProvider(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'set_module_enabled',
    section: 'modules',
    description:
      'Enable or disable a plug-in module (e.g. video) by writing modules.json. ' +
      'Always available so a disabled module can be re-enabled. Takes effect after the MCP client reconnects/restarts.',
    inputSchema: {
      type: 'object' as const,
      required: ['module', 'enabled'],
      properties: {
        module: { type: 'string', description: "Module id, e.g. 'video'. Use list_modules to see valid ids." },
        enabled: { type: 'boolean', description: 'true to enable, false to disable.' },
        activeProvider: { type: 'string', description: "Optional provider id for the module, e.g. 'panopto'." },
      },
    },
    handler: (args) => setModuleEnabled(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'list_modules',
    section: 'modules',
    description:
      'List all known plug-in modules with their id, name, enabled state, active provider, and the provider/tool types they handle.',
    inputSchema: { type: 'object' as const, properties: {} },
    handler: () => listModules(),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'browse_module_catalog',
    section: 'modules',
    description: 'List the module catalog: what exists, what is installed/enabled, which have updates, and any modules requested from the installer GUI. Read-only. Pass clearPending: true to discard stale installer requests. Also lists companion programs (e.g. Canvas Backup) that work alongside the toolchain and are installed separately.',
    inputSchema: {
      type: 'object' as const,
      properties: { clearPending: { type: 'boolean', description: 'Discard pending installer-GUI module requests.' } },
    },
    handler: (args) => browseModuleCatalog(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'install_module',
    section: 'modules',
    description: 'Install (or upgrade) a module from the catalog. Two-call gate: first call previews name/version/size/source/sha256 with NO side effects; call again with confirm: true to download, verify the pinned sha256, and install. Takes effect on the next reconnect.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        moduleId: { type: 'string', description: 'Catalog module id, e.g. "announcements".' },
        confirm: { type: 'boolean', description: 'Set true on the second call to actually install.' },
      },
      required: ['moduleId'],
    },
    handler: (args) => installModuleTool(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'uninstall_module',
    section: 'modules',
    description: 'Remove a channel-installed module (artifact + record) and disable it. Bundled modules cannot be uninstalled — disable those with set_module_enabled.',
    inputSchema: {
      type: 'object' as const,
      properties: { moduleId: { type: 'string', description: 'Installed module id.' } },
      required: ['moduleId'],
    },
    handler: (args) => uninstallModuleTool(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'discover_tools',
    section: 'modules',
    description:
      'Discover what tools the institution/professor uses: scans the Canvas instance (account → per-course → self-report cascade), matches findings against available modules, and returns detected tools, module-enable suggestions, unmatched tools, and a catalog pick-list. Read-only.',
    inputSchema: { type: 'object' as const, properties: {} },
    handler: (args) => discoverTools(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'save_institution_profile',
    section: 'admin',
    description:
      'Write/merge the institution profile (the master tool library) and optional per-class tool deltas. Accretive — new tools are added, existing preserved. The profile is the payload for usage feedback (#77).',
    inputSchema: {
      type: 'object' as const,
      required: ['tools'],
      properties: {
        tools: {
          type: 'array',
          description: 'Tools to record. Each: { id, name, source:"detected"|"self-reported", scope?, module? }.',
          items: {
            type: 'object' as const,
            required: ['id', 'name', 'source'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              source: { type: 'string', enum: ['detected', 'self-reported'] },
              scope: { type: 'string', enum: ['global', 'class'] },
              module: { type: 'string' },
            },
          },
        },
        identifiers: { type: 'object' as const, description: 'e.g. { canvas: "example.instructure.com" }.' },
        perClass: {
          type: 'array',
          description: 'Per-class deltas written into each course-config.md.',
          items: {
            type: 'object' as const,
            required: ['courseDir'],
            properties: {
              courseDir: { type: 'string' },
              uses: { type: 'array', items: { type: 'string' } },
              skips: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    handler: (args) => saveInstitutionProfile(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'submit_usage_feedback',
    section: 'admin',
    description:
      'Submit an anonymized inventory of your institution\'s tools as a GitHub issue, so the author can prioritize integrations. Opt-in. Two-call gate: call once to review the exact payload, then call again with confirm:true to submit via gh. named:true includes full identifiers (default is anonymized).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        named: { type: 'boolean', description: 'Include full institution identifiers (default false = anonymized).' },
        confirm: { type: 'boolean', description: 'false/omitted = review only; true = submit the GitHub issue.' },
      },
    },
    handler: (args) => submitUsageFeedback(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'set_course_aias_default',
    section: 'admin',
    description:
      "Set the course-wide AI Assessment Scale default for a CDS course folder. " +
      "Writes defaultAiasLevel (and optional defaultAiasNote) into course-config.md. " +
      "Per-page aiasLevel overrides this default at render time.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        courseDir: { type: 'string', description: 'Path to the CDS course folder.' },
        level: { type: 'number', enum: [1, 2, 3, 4, 5], description: 'AIAS level 1-5.' },
        note: { type: 'string', description: 'Optional override of canonical AIAS text.' },
      },
      required: ['courseDir', 'level'],
    },
    handler: (args) => setCourseAiasDefault(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'set_courses_root',
    section: 'admin',
    description:
      "Set the root directory for course discovery used by the local dashboard. " +
      "The dashboard scans this directory recursively for folders containing course-config.md.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        coursesRoot: { type: 'string', description: 'Absolute path to the courses root directory.' },
      },
      required: ['coursesRoot'],
    },
    handler: (args) => setCoursesRoot(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'courses_root',
  },
  {
    id: 'open_dashboard',
    section: 'admin',
    description:
      "Start the local Canvas Toolchain dashboard (read-only course health view). " +
      "Returns a localhost URL the professor can open in a browser. Requires set_courses_root first.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        port: { type: 'number', description: 'Optional fixed port. Default: auto-assigned.' },
      },
    },
    handler: (args) => openDashboard(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'status',
  },
  {
    id: 'get_cc_status',
    section: 'admin',
    description: 'Get a health snapshot: which domain packages are installed, whether Anthropic key and Ollama are available, active routing config, and last-run timestamps per workflow.',
    inputSchema: { type: 'object' as const, properties: {} },
    handler: () => getCcStatus(),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'status',
  },
  {
    id: 'analyze_course',
    section: 'research',
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
    handler: (args) => analyzeCourse(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_analyze',
    intentAction: 'course',
  },
  {
    id: 'plan_next_semester',
    section: 'admin',
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
    handler: (args) => planNextSemester(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_plan',
    intentAction: 'semester',
  },
  {
    id: 'update_course_materials',
    section: 'design',
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
    handler: (args) => updateCourseMaterials(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_build',
    intentAction: 'materials',
  },
  {
    id: 'full_pipeline',
    section: 'admin',
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
    handler: (args) => fullPipeline(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_build',
    intentAction: 'full_pipeline',
  },
  {
    id: 'bulk_fetch_panopto_transcripts',
    section: 'transcripts',
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
    handler: (args) => bulkFetchPanoptoTranscripts(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_import',
    intentAction: 'transcripts',
  },
  {
    id: 'enrich_panopto_transcripts',
    section: 'transcripts',
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
    handler: (args) => enrichPanoptoTranscripts(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'setup_transcript_source',
    section: 'transcripts',
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
    handler: (args) => setupTranscriptSource(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'transcripts',
  },
  {
    id: 'compare_transcripts',
    section: 'transcripts',
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
    handler: (args) => compareTranscriptsWorkflow(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'preview_course_publish',
    section: 'snapshots',
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
    handler: (args) => previewCoursePublish(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_publish',
    intentAction: 'preview',
  },
  {
    id: 'publish_course',
    section: 'snapshots',
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
        canvasBreadcrumbs: { type: 'boolean', description: 'Override the course default for this publish only. When omitted, uses setup_canvas\'s canvasBreadcrumbs setting (default enabled). Breadcrumbs create [ARCHIVED] page copies and /canvas-toolchain-archive/ widget file copies in Canvas, cleaned up at prune time.' },
        a11yAcknowledgments: {
          type: 'object' as const,
          description:
            'Per-file accessibility acknowledgments: { "<filename>": true } for borderline findings; { "<filename>": ["1.4.3"] } naming every clear-failure criterion. Recorded to the course project\'s .a11y/ audit trail.',
          additionalProperties: {
            oneOf: [
              { type: 'boolean' as const },
              { type: 'array' as const, items: { type: 'string' as const } },
            ],
          },
        },
      },
    },
    handler: (args) => publishCourse(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_publish',
    intentAction: 'publish',
  },
  {
    id: 'rollback_course_publish',
    section: 'snapshots',
    description: 'Restore every successfully-published entry from a snapshot to its prior Canvas state.',
    inputSchema: {
      type: 'object' as const,
      required: ['snapshotId'],
      properties: { snapshotId: { type: 'string' } },
    },
    handler: (args) => rollbackCoursePublish(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_publish',
    intentAction: 'rollback',
  },
  {
    id: 'list_publish_snapshots',
    section: 'snapshots',
    description: 'List all publish snapshots for a course in oldest-to-newest order, showing which is currently live in Canvas and which can be rolled back to / rolled forward to. Pipe the snapshotId from a row into rollback_course_publish to restore that version.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'courseDir'],
      properties: {
        courseId: { type: 'number', description: 'Canvas course numeric ID.' },
        courseDir: { type: 'string', description: 'Canvas Design Studio course folder (used to locate the project-local snapshots dir).' },
      },
    },
    handler: (args) => listPublishSnapshots(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_publish',
    intentAction: 'snapshots',
  },
  {
    id: 'prune_publish_snapshots',
    section: 'snapshots',
    description: 'Apply retention policy to a course\'s publish snapshots. Removes snapshots older than the configured retention window AND beyond the configured retention count (defaults: keep 3 most-recent, keep anything ≤ 30 days old). Never removes the currently-live snapshot. When dryRun is true, lists what would be pruned without taking action. Auto-pruning also runs after every successful publish_course.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'courseDir'],
      properties: {
        courseId: { type: 'number', description: 'Canvas course numeric ID.' },
        courseDir: { type: 'string', description: 'Canvas Design Studio course folder (used to locate the project-local snapshots dir).' },
        dryRun: { type: 'boolean', description: 'When true, shows what would be pruned without deleting. Default false.' },
      },
    },
    handler: (args) => prunePublishSnapshots(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'setup_lecture_answers',
    section: 'admin',
    description: 'First-run configuration for the lecture answers bot. Auto-detects Ollama on localhost:11434. When Ollama is absent, returns guidance to either install Ollama or re-call with provider="transformers-js" (in-process; requires installing @xenova/transformers in command-and-control first) or provider="voyage" (cloud, requires voyageApiKey). The bot is opt-in — until this tool succeeds, ask_course and index_course_for_answers report NO_CONFIG.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        provider: { enum: ['ollama', 'transformers-js', 'voyage'] as const, description: 'Explicit provider choice. When omitted, auto-detects Ollama.' },
        voyageApiKey: { type: 'string', description: 'Required when provider is "voyage".' },
        ollamaBaseUrl: { type: 'string', description: 'Override the default Ollama base URL (http://localhost:11434).' },
        model: { type: 'string', description: 'Override the default embedding model name for the chosen provider.' },
      },
    },
    handler: (args) => setupLectureAnswers(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_ask',
    intentAction: 'index',
  },
  {
    id: 'index_course_for_answers',
    section: 'admin',
    description: 'Build or incrementally update a per-course hybrid (FTS5 + vec) index over enriched lecture transcripts, CDS markdown, slide PDFs (under <courseDir>/slides/), and the canonical FAQ (<courseDir>/answers/canonical.md). Auto-incremental on subsequent calls based on file mtimes. Pass rebuild=true to wipe and re-embed everything (provider switch, suspected corruption).',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'courseDir'],
      properties: {
        courseId: { type: 'number' },
        courseDir: { type: 'string' },
        rebuild: { type: 'boolean', description: 'Wipe and re-embed everything. Default false.' },
        transcriptSources: { type: 'array', items: { type: 'string' }, description: 'Override the default transcript source directory list.' },
      },
    },
    handler: (args) => indexCourseForAnswers(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_ask',
    intentAction: 'index',
  },
  {
    id: 'ask_course',
    section: 'admin',
    description: 'Faculty-facing Q&A against the per-course hybrid index. Auto-incrementally re-indexes any changed source files before retrieving. Returns the LLM-generated answer plus citations (with deep-link URLs for transcript chunks where the source platform provided a deepLinkTemplate). Degrades to keyword-only retrieval when the embedding provider is unavailable.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'courseDir', 'question'],
      properties: {
        courseId: { type: 'number' },
        courseDir: { type: 'string' },
        question: { type: 'string' },
        k: { type: 'number', description: 'Top-K chunks to retrieve. Default 8.' },
        transcriptSources: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: (args) => askCourse(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_ask',
    intentAction: 'ask',
  },
  {
    id: 'reembed_course_index',
    section: 'admin',
    description: 'Switch embedding providers and rebuild the per-course index in one call. Convenience wrapper over setup_lecture_answers + index_course_for_answers --rebuild. Use when migrating from Ollama to Voyage (or vice versa), since vector dimensions are not interchangeable.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'courseDir'],
      properties: {
        courseId: { type: 'number' },
        courseDir: { type: 'string' },
        provider: { enum: ['ollama', 'transformers-js', 'voyage'] as const },
        voyageApiKey: { type: 'string' },
        ollamaBaseUrl: { type: 'string' },
        transcriptSources: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: (args) => reembedCourseIndex(args as never),
    taskCategory: 'none',
    exposure: 'internal',
  },
  {
    id: 'snapshot_course',
    section: 'snapshots',
    description: 'Write or update a course reference markdown doc capturing course identifiers, assignment groups, modules, and an append-only Update Log. Re-running against the same outputPath regenerates the auto-managed sections (delimited by AUTO:start/AUTO:end HTML comment markers) and preserves all hand-edited prose around them.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'outputPath'],
      properties: {
        courseId:   { type: 'number',  description: 'Canvas course numeric ID.' },
        outputPath: { type: 'string',  description: 'Absolute path to the markdown file. Created on first run, updated on re-runs.' },
      },
    },
    handler: (args) => snapshotCourse(args as never),
    taskCategory: 'none',
    exposure: 'internal',
  },
  {
    id: 'draft_student_rubric',
    section: 'design',
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
    handler: (args) => draftStudentRubric(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_build',
    intentAction: 'rubric',
  },
  {
    id: 'review_canvas_rubric',
    section: 'design',
    description: 'Pull a rubric from Canvas (the assignment\'s attached rubric first; falls back to the course rubric list), detect whether it changed since your last student rewrite, and run a smart triage (acceptable / needs-update / needs-review) with specific flagged criteria. Read-only — writes nothing. When the verdict is needs-update it proposes a revised faculty rubric for your approval; feed the approved rubric to draft_student_rubric. Run setup_canvas and setup_anthropic first.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId'],
      properties: {
        courseId:          { type: 'string', description: 'Canvas course id.' },
        assignmentId:      { type: 'string', description: 'Assignment id. When set, pulls the rubric attached to that assignment; if none is attached, falls back to the course rubric list.' },
        rubricId:          { type: 'string', description: 'Specific course rubric id — use after a list fallback to fetch the chosen rubric, instead of assignmentId.' },
        priorRenderedPath: { type: 'string', description: 'Absolute path to the previously rendered rubric .md; used to detect what changed since the last student-facing rewrite.' },
        assignmentBrief:   { type: 'string', description: 'Overrides the pulled assignment description as the triage\'s assignment signal.' },
      },
    },
    handler: (args) => reviewCanvasRubric(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_review',
    intentAction: 'rubric',
  },
  {
    id: 'accessibility_review_queue',
    section: 'accessibility',
    description:
      'The per-course "near the edge" accessibility worklist: pages with borderline findings, needs-human-review criteria, or acknowledged publishes. Lists open entries worst-margin first with live Canvas URLs for human-eyes verification; resolve marks a page reviewed. The professor is the final arbiter.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseDir'],
      properties: {
        courseDir: { type: 'string', description: 'Course project folder (contains .a11y/).' },
        action: { type: 'string', enum: ['list', 'resolve'], description: 'Default list.' },
        page: { type: 'string', description: 'Required for resolve — the page as listed.' },
        note: { type: 'string', description: 'Optional note recorded with the resolution.' },
      },
    },
    handler: (args) => accessibilityReviewQueue(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_review',
    intentAction: 'queue',
  },
  {
    id: 'audit_course_accessibility',
    section: 'accessibility',
    description:
      'Run the full WCAG 2.2 engine stack (in-house + axe-core) across every generated page of a course project, report per-page verdicts against the required level, and refresh the borderline review queue. The regular between-semesters check.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseDir'],
      properties: {
        courseDir: { type: 'string', description: 'Course project folder.' },
        outputDir: { type: 'string', description: 'Generated-HTML folder. Defaults to <courseDir>/output.' },
      },
    },
    handler: (args) => auditCourseAccessibility(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_review',
    intentAction: 'accessibility',
  },
  {
    id: 'review_accessibility_policy',
    section: 'accessibility',
    description:
      "The institution accessibility policy anchor (spec §7): shows the policy URLs, required conformance level, cadence, and last-verified date; confirm: true stamps today's date after the professor re-reads the policy. Also accepts updates to urls / requiredConformance / recheckWeeks / wcag3Advisory so nobody edits JSON by hand. Default level: WCAG 2.1 AA (ADA Title II baseline).",
    inputSchema: {
      type: 'object' as const,
      properties: {
        confirm: { type: 'boolean', description: 'The professor re-read the policy today — stamp lastVerifiedAt.' },
        urls: { type: 'array', items: { type: 'string' }, description: 'Institution policy / guidance URLs.' },
        requiredConformance: {
          type: 'object',
          properties: { version: { type: 'string', enum: ['2.0', '2.1', '2.2'] }, level: { type: 'string', enum: ['A', 'AA', 'AAA'] } },
          required: ['version', 'level'],
          description: 'Gate level. Default WCAG 2.1 AA.',
        },
        recheckWeeks: { type: 'number', description: 'Re-verification cadence in weeks (default 4).' },
        wcag3Advisory: { type: 'boolean', description: 'Toggle the WCAG 3 draft advisory section (never gates).' },
      },
    },
    handler: (args) => reviewAccessibilityPolicy(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_review',
    intentAction: 'policy',
  },
  {
    id: 'wave_deep_check',
    section: 'accessibility',
    description:
      'Deep accessibility check of a PUBLICLY-visible page via the paid WAVE API (WebAIM). Two-call spend gate: first call previews the cost (~2 credits) and runs nothing; re-call with confirm: true to spend. Auth-gated Canvas URLs are refused before any spend — use the free WAVE browser extension or MS Accessibility Insights for those. Optional apiKey is saved to the institution config on first use.',
    inputSchema: {
      type: 'object' as const,
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'Publicly reachable page URL.' },
        confirm: { type: 'boolean', description: 'Explicit approval to spend WAVE credits.' },
        apiKey: { type: 'string', description: 'WAVE API key (https://wave.webaim.org/api/); persisted on first use.' },
      },
    },
    handler: (args) => waveDeepCheckTool(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'brainstorm_interactive',
    section: 'research',
    description: 'Propose interactive Canvas widget concepts for a given topic + learning goal. Returns 2-3 distinct widget specs (kind, purpose, content schema, initial sample data, dimensions, accessibility notes) plus rationale and pedagogical fit. Returns SPECS only — a future render step compiles a chosen spec into a hostable HTML/JS bundle. Uses the Anthropic API via setup_anthropic.',
    inputSchema: {
      type: 'object' as const,
      required: ['topic', 'learningGoal'],
      properties: {
        topic:              { type: 'string', description: 'Topic the interactive should illuminate, e.g. "comparing VLOOKUP vs XLOOKUP".' },
        learningGoal:       { type: 'string', description: 'What students should be able to do after engaging with the widget.' },
        audienceTags:       { type: 'array', items: { type: 'string' }, description: 'Optional audience tags, e.g. ["undergraduate", "first-time-AI-user"].' },
        courseId:           { type: 'string', description: 'When provided, the kb-bridge auto-loads philosophy-kb.md and student-personas.md from the professor\'s CDS home and prefixes them to the prompt. Caller can still pass philosophyKb / studentPersonas to override, or set includePhilosophy / includePersonas to false to suppress.' },
        includePhilosophy:  { type: 'boolean', description: 'When true, the prompt is prefixed with `philosophyKb` text to bias concepts toward the professor\'s pedagogical style. Auto-enabled when courseId is provided.' },
        includePersonas:    { type: 'boolean', description: 'When true, the prompt is prefixed with `studentPersonas` text so concepts include per-persona considerations. Auto-enabled when courseId is provided.' },
        philosophyKb:       { type: 'string', description: 'Optional: professor philosophy KB text. Required when includePhilosophy is true AND courseId is absent.' },
        studentPersonas:    { type: 'string', description: 'Optional: student persona text. Required when includePersonas is true AND courseId is absent.' },
        count:              { type: 'number', description: 'How many concepts to generate. Default 3.' },
      },
    },
    handler: (args) => brainstormInteractive(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'install_resource',
    section: 'registry',
    description: 'Install a template, theme, prompt, or adapter-config resource from github://, ryfter://, or file:// into the local registry.',
    inputSchema: {
      type: 'object' as const,
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'Resource URL, e.g. github://canvas-toolchain/templates/comparison-layout-academic@1.2.0' },
      },
    },
    handler: (args) => installResource(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'list_installed_resources',
    section: 'registry',
    description: 'List resources installed in the local registry, optionally filtered by kind.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        kind: { type: 'string', enum: ['template', 'theme', 'prompt', 'adapter-config', 'bundle'] },
      },
    },
    handler: (args) => listInstalledResources(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'uninstall_resource',
    section: 'registry',
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
    handler: (args) => uninstallResource(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'search_registry',
    section: 'registry',
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
    handler: (args) => searchRegistry(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'install_resources_from_lockfile',
    section: 'registry',
    description: 'Install resources listed in a plain-text or JSON lockfile, preserving order and skipping already-installed versions.',
    inputSchema: {
      type: 'object' as const,
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Absolute path to a lockfile containing one URL per line or a JSON array of URLs.' },
      },
    },
    handler: (args) => installResourcesFromLockfile(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'paste_layout',
    section: 'design',
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
    handler: (args) => pasteLayout(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_build',
    intentAction: 'layout',
  },
  {
    id: 'save_layout_as_template',
    section: 'design',
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
    handler: (args) => saveLayoutAsTemplate(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  // ── Core: Curriculum Intelligence passthrough (src/passthrough/ci_tools.ts) ──
  {
    id: 'setup_course',
    section: 'admin',
    description: 'Register a new course in Curriculum Intelligence. Creates a course folder on disk and records its location in the app config so other tools can find it by id alone.',
    inputSchema: {
      type: 'object',
      required: ['id', 'title'],
      properties: {
        id: { type: 'string', description: 'Short id (letters, digits, dot, dash, underscore). Example: "ITM370".' },
        title: { type: 'string', description: 'Human-readable course title.' },
        courseRoot: { type: 'string', description: 'Optional. Absolute path to parent folder. Defaults to <appHome>/courses.' },
      },
    },
    handler: (args) => setupCourse(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'course',
  },
  {
    id: 'get_course_state',
    section: 'admin',
    description: 'List registered courses with their on-disk paths, semester history, and feed counts.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional. Course id to inspect. Omit to list all.' },
      },
    },
    handler: (args) => getCourseState(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_inspect',
    intentAction: 'state',
  },
  {
    id: 'ingest_canvas_archive',
    section: 'admin',
    description: 'Read a Canvas export folder for one semester and write a structured topic-map.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'archivePath'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        archivePath: { type: 'string', description: 'Absolute path to the Canvas export folder.' },
      },
    },
    handler: (args) => ingestCanvasArchive(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_import',
    intentAction: 'canvas_archive',
  },
  {
    id: 'list_assignments',
    section: 'admin',
    description: 'List assignments for a course/semester from its ingested topic map.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        publishedOnly: { type: 'boolean' },
      },
    },
    handler: (args) => listAssignments(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_inspect',
    intentAction: 'assignments',
  },
  {
    id: 'list_pages',
    section: 'admin',
    description: 'List pages for a course/semester from its ingested topic map.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        publishedOnly: { type: 'boolean' },
      },
    },
    handler: (args) => listPages(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_inspect',
    intentAction: 'pages',
  },
  {
    id: 'list_canvas_modules',
    section: 'admin',
    description: 'List modules for a course/semester. Pass expandItems=true to include item details.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        expandItems: { type: 'boolean' },
      },
    },
    handler: (args) => listCanvasModules(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_inspect',
    intentAction: 'canvas_modules',
  },
  {
    id: 'list_resources',
    section: 'admin',
    description: 'List external resource links referenced in pages, assignments, and discussions.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        sourceKind: { type: 'string', enum: ['page', 'assignment', 'discussion'] },
        externalOnly: { type: 'boolean', description: 'Defaults to true.' },
      },
    },
    handler: (args) => listResources(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_inspect',
    intentAction: 'resources',
  },
  {
    id: 'diff_semesters',
    section: 'admin',
    description: 'Compute a side-by-side diff between two ingested semesters.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'leftSemesterId', 'rightSemesterId'],
      properties: {
        courseId: { type: 'string' },
        leftSemesterId: { type: 'string' },
        rightSemesterId: { type: 'string' },
      },
    },
    handler: (args) => diffSemesters(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_analyze',
    intentAction: 'diff_semesters',
  },
  {
    id: 'ingest_transcripts',
    section: 'transcripts',
    description: 'Read .vtt/.srt/.md transcript files from a folder and write transcripts.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'transcriptsPath'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        transcriptsPath: { type: 'string' },
        source: { type: 'string', enum: ['panopto', 'whisper', 'unknown'] },
        copy: { type: 'boolean' },
      },
    },
    handler: (args) => ingestTranscripts(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_import',
    intentAction: 'transcripts',
  },
  {
    id: 'map_transcripts_to_weeks',
    section: 'transcripts',
    description: 'Match each ingested transcript to a course week. Writes week-map.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: (args) => mapTranscriptsToWeeks(args as never),
    taskCategory: 'none',
    exposure: 'internal',
  },
  {
    id: 'extract_lecture_topics',
    section: 'research',
    description: 'Return lecture chunks shaped for the model to reason over.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        week: { type: 'number' },
        transcriptId: { type: 'string' },
        maxTextChars: { type: 'number' },
      },
    },
    handler: (args) => extractLectureTopics(args as never),
    taskCategory: 'fast',
    exposure: 'intent',
    intentTool: 'ct_analyze',
    intentAction: 'topics',
  },
  {
    id: 'find_off_syllabus_topics',
    section: 'research',
    description: 'Compare lecture transcripts against module/page text and return novel tokens.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        topN: { type: 'number' },
        minTokenLength: { type: 'number' },
      },
    },
    handler: (args) => findOffSyllabusTopics(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_analyze',
    intentAction: 'off_syllabus',
  },
  {
    id: 'build_quote_bank',
    section: 'research',
    description: 'Scan lecture transcripts for notable lines. Writes quote-bank.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        minLength: { type: 'number' },
        maxPerLecture: { type: 'number' },
      },
    },
    handler: (args) => buildQuoteBank(args as never),
    taskCategory: 'fast',
    exposure: 'advanced',
  },
  {
    id: 'fetch_news_feed',
    section: 'research',
    description: 'Fetch RSS/Atom feeds and return recent items filtered by date.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'feedUrls'],
      properties: {
        courseId: { type: 'string' },
        feedUrls: { type: 'array', items: { type: 'string' } },
        since: { type: 'string' },
      },
    },
    handler: (args) => fetchNewsFeed(args as never),
    taskCategory: 'fast',
    exposure: 'advanced',
  },
  {
    id: 'scan_recent_developments',
    section: 'research',
    description: 'Ask the model what\'s new in a given topic area since a date.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'topicArea'],
      properties: {
        courseId: { type: 'string' },
        topicArea: { type: 'string' },
        since: { type: 'string' },
      },
    },
    handler: (args) => scanRecentDevelopments(args as never),
    taskCategory: 'judgment',
    exposure: 'advanced',
  },
  {
    id: 'suggest_topics',
    section: 'research',
    description: 'Merge RSS feed items and LLM scan developments into ranked topic candidates. Reads news-cache.json if no inline items are supplied.',
    inputSchema: {
      type: 'object',
      required: ['courseId'],
      properties: {
        courseId: { type: 'string' },
        feedItems: { type: 'array', description: 'Feed items from fetch_news_feed (optional).' },
        scanDevelopments: { type: 'array', description: 'Developments from scan_recent_developments (optional).' },
      },
    },
    handler: (args) => suggestTopics(args as never),
    taskCategory: 'judgment',
    exposure: 'intent',
    intentTool: 'ct_analyze',
    intentAction: 'topics',
  },
  {
    id: 'score_topic_currency',
    section: 'research',
    description: 'Classify a topic as evergreen / current / dated using news-hit count and how recently it was taught.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'topic', 'newsHits', 'lastTaughtSemesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        topic: { type: 'string' },
        newsHits: { type: 'number', description: 'Number of recent news/feed items mentioning this topic.' },
        lastTaughtSemesterId: { type: ['string', 'null'], description: 'Semester id when the topic was last taught, or null if never.' },
      },
    },
    handler: (args) => scoreTopicCurrency(args as never),
    taskCategory: 'fast',
    exposure: 'intent',
    intentTool: 'ct_analyze',
    intentAction: 'currency',
  },
  {
    id: 'recommend_for_topic',
    section: 'research',
    description: 'Return a KEEP / UPDATE / DROP / ADD verdict for a topic based on its currency class and teaching history.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'topic', 'currencyClass', 'lastTaughtSemesterId', 'newsHits'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        topic: { type: 'string' },
        currencyClass: { type: 'string', enum: ['evergreen', 'current', 'dated'] },
        lastTaughtSemesterId: { type: ['string', 'null'] },
        newsHits: { type: 'number' },
        includeDetails: { type: 'boolean', description: 'Return full signal details alongside the verdict.' },
      },
    },
    handler: (args) => recommendForTopic(args as never),
    taskCategory: 'judgment',
    exposure: 'advanced',
  },
  {
    id: 'generate_ideas_file',
    section: 'research',
    description: 'Write ideas.md with follow-on development ideas based on what the professor used.',
    inputSchema: {
      type: 'object',
      required: ['courseId'],
      properties: {
        courseId: { type: 'string' },
        context: { type: 'string' },
      },
    },
    handler: (args) => generateIdeasFile(args as never),
    taskCategory: 'judgment',
    exposure: 'advanced',
  },
  {
    id: 'import_previous_shell',
    section: 'admin',
    description: 'Copy last semester\'s content into next-plan/ with CI front matter.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'sourceSemesterId', 'newSemesterId'],
      properties: {
        courseId: { type: 'string' },
        sourceSemesterId: { type: 'string' },
        newSemesterId: { type: 'string' },
        source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
      },
    },
    handler: (args) => importPreviousShell(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_import',
    intentAction: 'previous_shell',
  },
  {
    id: 'fetch_academic_calendar',
    section: 'research',
    description: 'Parse registrar URL or accept manual dates into calendar.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        url: { type: 'string' },
        semesterPattern: { type: 'string' },
        manualDates: { type: 'object' },
      },
    },
    handler: (args) => fetchAcademicCalendar(args as never),
    taskCategory: 'none',
    exposure: 'advanced',
  },
  {
    id: 'shift_dates',
    section: 'admin',
    description: 'Apply target calendar to all due: fields in next-plan/ briefs.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'onBreakCollision'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        onBreakCollision: { type: 'string', enum: ['bump-before', 'bump-after', 'flag'] },
        sections: { type: 'array', items: { type: 'object' } },
      },
    },
    handler: (args) => shiftDates(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_plan',
    intentAction: 'shift_dates',
  },
  {
    id: 'generate_recommended_outline',
    section: 'admin',
    description: 'Generate a week-by-week outline from diff + optional currency-report.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: (args) => generateRecommendedOutline(args as never),
    taskCategory: 'judgment',
    exposure: 'intent',
    intentTool: 'ct_plan',
    intentAction: 'outline',
  },
  {
    id: 'draft_assignment_brief',
    section: 'design',
    description: 'LLM-draft an updated assignment brief. Sets replacement_recommended on DROP/stale.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'briefPath'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        briefPath: { type: 'string' },
      },
    },
    handler: (args) => draftAssignmentBrief(args as never),
    taskCategory: 'judgment',
    exposure: 'intent',
    intentTool: 'ct_plan',
    intentAction: 'assignment_brief',
  },
  {
    id: 'update_examples',
    section: 'design',
    description: 'Mechanical year/tool-name replacement pass + optional LLM proposed rewrites.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'briefPath'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        briefPath: { type: 'string' },
        llmPass: { type: 'boolean' },
      },
    },
    handler: passthroughHandler(CI_TOOLS, 'update_examples'),
    taskCategory: 'fast',
    exposure: 'intent',
    intentTool: 'ct_build',
    intentAction: 'examples',
  },
  {
    id: 'export_course_folder',
    section: 'admin',
    description: 'Strip CI fields and write CDS course/ format; one folder per section.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        outputPath: { type: 'string' },
        sections: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: (args) => exportCourseFolder(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_inspect',
    intentAction: 'export',
  },
];

export function buildRegistry(): Map<string, Operation> {
  const reg = new Map<string, Operation>();
  for (const op of CORE_OPERATIONS) {
    if (reg.has(op.id)) throw new Error(`duplicate operation id: ${op.id}`);
    reg.set(op.id, op);
  }
  return reg;
}
