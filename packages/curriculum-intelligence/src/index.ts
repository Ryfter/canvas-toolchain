#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { setupCourse } from './tools/setup_course.js';
import { getCourseState } from './tools/get_course_state.js';
import { ingestCanvasArchive } from './tools/ingest_canvas_archive.js';
import { listAssignments } from './tools/list_assignments.js';
import { listPages } from './tools/list_pages.js';
import { listModules } from './tools/list_modules.js';
import { listResources } from './tools/list_resources.js';
import { diffSemesters } from './tools/diff_semesters.js';
import { ingestTranscripts } from './tools/ingest_transcripts.js';
import { mapTranscriptsToWeeks } from './tools/map_transcripts_to_weeks.js';
import { extractLectureTopics } from './tools/extract_lecture_topics.js';
import { findOffSyllabusTopics } from './tools/find_off_syllabus_topics.js';
import { buildQuoteBank } from './tools/build_quote_bank.js';
import { fetchNewsFeed } from './tools/fetch_news_feed.js';
import { scanRecentDevelopments } from './tools/scan_recent_developments.js';
import { suggestTopics } from './tools/suggest_topics.js';
import { scoreTopicCurrency } from './tools/score_topic_currency.js';
import { recommendForTopic } from './tools/recommend_for_topic.js';
import { generateIdeasFile } from './tools/generate_ideas_file.js';
import { importPreviousShell } from './tools/import_previous_shell.js';
import { fetchAcademicCalendar } from './tools/fetch_academic_calendar.js';
import { shiftDates } from './tools/shift_dates.js';
import { generateRecommendedOutline } from './tools/generate_recommended_outline.js';
import { draftAssignmentBrief } from './tools/draft_assignment_brief.js';
import { updateExamples } from './tools/update_examples.js';
import { exportCourseFolder } from './tools/export_course_folder.js';
import { analyzeCourse as ciAnalyzeCourseFull } from './tools/analyze_course.js';
import { getCourseTrajectory } from './tools/get_course_trajectory.js';
import { AnthropicAdapter } from './llm/anthropic_adapter.js';
import { OllamaAdapter } from './llm/ollama_adapter.js';
import type { LlmClient } from './llm/client.js';
import { BraveSearchAdapter } from './search/brave_search_adapter.js';
import type { SearchClient } from './search/search_client.js';
import { formatError } from './utils/errors.js';

const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

function getLlmClient(): LlmClient {
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  const ollamaModel = process.env.OLLAMA_MODEL;
  if (ollamaUrl && ollamaModel) return new OllamaAdapter(ollamaUrl, ollamaModel);
  return new AnthropicAdapter();
}

/** Returns a BraveSearchAdapter when BRAVE_SEARCH_API_KEY is set, otherwise undefined (offline mode). */
function getSearchClient(): SearchClient | undefined {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  return key ? new BraveSearchAdapter(key) : undefined;
}

const server = new Server(
  { name: 'curriculum-intelligence', version: pkg.version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'setup_course',
      description:
        'Register a new course in Curriculum Intelligence. Creates a course folder ' +
        'on disk and records its location in the app config so other tools can find ' +
        'it by id alone.',
      inputSchema: {
        type: 'object' as const,
        required: ['id', 'title'],
        properties: {
          id: {
            type: 'string',
            description: 'Short id (letters, digits, dot, dash, underscore). Example: "ITM370".',
          },
          title: {
            type: 'string',
            description: 'Human-readable course title. Example: "AI-Augmented Projects".',
          },
          courseRoot: {
            type: 'string',
            description:
              'Optional. Absolute path to the parent folder where the course directory ' +
              'will be created. Defaults to <appHome>/courses.',
          },
        },
      },
    },
    {
      name: 'get_course_state',
      description:
        'List registered courses with their on-disk paths, semester history, and ' +
        'feed counts. Pass an `id` to get details for a single course; omit to list all.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: {
            type: 'string',
            description: 'Optional. Course id to inspect. Omit to list every registered course.',
          },
        },
      },
    },
    {
      name: 'ingest_canvas_archive',
      description:
        'Read a Canvas export folder for one semester of a registered course and write ' +
        'a structured topic-map.json under the course\'s semester directory. Idempotent: ' +
        're-running overwrites the topic map and updates lastIngestedAt.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'archivePath'],
        properties: {
          courseId: { type: 'string', description: 'Registered course id, e.g. "ITM370".' },
          semesterId: { type: 'string', description: 'Semester id, e.g. "Spring2025".' },
          archivePath: {
            type: 'string',
            description: 'Absolute path to the Canvas export folder (must contain a manifests/ subfolder).',
          },
        },
      },
    },
    {
      name: 'list_assignments',
      description: 'List assignments for a course/semester from its ingested topic map.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          publishedOnly: { type: 'boolean', description: 'If true, exclude unpublished assignments.' },
        },
      },
    },
    {
      name: 'list_pages',
      description: 'List pages for a course/semester from its ingested topic map.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          publishedOnly: { type: 'boolean' },
        },
      },
    },
    {
      name: 'list_modules',
      description: 'List modules for a course/semester. Pass expandItems=true to include item details.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          expandItems: { type: 'boolean' },
        },
      },
    },
    {
      name: 'list_resources',
      description:
        'List external resource links referenced in pages, assignments, and discussions. ' +
        'By default excludes Canvas-internal URLs.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          sourceKind: { type: 'string', enum: ['page', 'assignment', 'discussion'] },
          externalOnly: { type: 'boolean', description: 'Defaults to true.' },
        },
      },
    },
    {
      name: 'diff_semesters',
      description:
        'Compute a side-by-side diff between two ingested semesters of the same course. ' +
        'Reports modules / assignments / pages / external resource links added, removed, ' +
        'reused verbatim, or rewritten. Writes diff-vs-<right>.json under the left semester ' +
        'folder.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'leftSemesterId', 'rightSemesterId'],
        properties: {
          courseId: { type: 'string' },
          leftSemesterId: { type: 'string', description: 'Older semester id (the "from" side).' },
          rightSemesterId: { type: 'string', description: 'Newer semester id (the "to" side).' },
        },
      },
    },
    {
      name: 'ingest_transcripts',
      description:
        'Read .vtt / .srt / .md transcript files from a folder and write transcripts.json ' +
        'under the course semester directory. Tags each transcript\'s source (panopto / ' +
        'whisper / unknown) and extracts week-number and date hints from filenames.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'transcriptsPath'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          transcriptsPath: { type: 'string', description: 'Absolute path to folder containing transcript files.' },
          source: {
            type: 'string',
            enum: ['panopto', 'whisper', 'unknown'],
            description: 'Optional. Overrides per-file filename detection.',
          },
          copy: {
            type: 'boolean',
            description: 'If true, also copy the source files into the semester\'s transcripts/ folder.',
          },
        },
      },
    },
    {
      name: 'map_transcripts_to_weeks',
      description:
        'Match each ingested transcript to a course week using filename hints and term-start ' +
        'date math. Writes week-map.json under the semester folder. Reports unmatched ' +
        'transcripts so you can re-name files.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
        },
      },
    },
    {
      name: 'extract_lecture_topics',
      description:
        'Return lecture chunks shaped for the model to reason over. Each chunk has the ' +
        'transcript id, week (if mapped), source, duration, and fullText. Filter by week ' +
        'or transcriptId to scope down. Server does no LLM call — it just shapes the data.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          week: { type: 'number' },
          transcriptId: { type: 'string' },
          maxTextChars: { type: 'number', description: 'Truncate fullText if it exceeds this length. Default 50000.' },
        },
      },
    },
    {
      name: 'find_off_syllabus_topics',
      description:
        'Compare each lecture transcript against its mapped week\'s module/page text. ' +
        'Returns novel tokens — words the lecture uses that don\'t appear in the syllabus ' +
        'pages for that week — plus sample cue excerpts. Writes off-syllabus.json under ' +
        'the semester folder.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          topN: { type: 'number', description: 'Top novel tokens per lecture (default 20).' },
          minTokenLength: { type: 'number', description: 'Skip tokens shorter than this (default 4).' },
        },
      },
    },
    {
      name: 'build_quote_bank',
      description:
        'Scan lecture transcripts for notable lines — sentences that match deliberate-point ' +
        'trigger phrases (key idea, takeaway, always/never, etc.). Writes quote-bank.json ' +
        'under the semester folder. Useful for pulling pull-quotes into course materials.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          minLength: { type: 'number', description: 'Minimum quote length in chars (default 60).' },
          maxPerLecture: { type: 'number', description: 'Cap on quotes per transcript (default 10).' },
        },
      },
    },
    {
      name: 'fetch_news_feed',
      description:
        'Fetch one or more RSS/Atom feeds and return recent items filtered by date. ' +
        'Caches results to news-cache.json under the course folder. Use this to pull in ' +
        'external signals (blog posts, papers, news) before calling suggest_topics.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'feedUrls'],
        properties: {
          courseId: { type: 'string' },
          feedUrls: {
            type: 'array',
            items: { type: 'string' },
            description: 'One or more RSS/Atom feed URLs to fetch.',
          },
          since: {
            type: 'string',
            description: 'ISO date string. Only return items published on or after this date.',
          },
        },
      },
    },
    {
      name: 'scan_recent_developments',
      description:
        'Ask the model (with web search) what\'s new in a given topic area since a date. ' +
        'Returns structured developments and candidate topic phrases for the professor to review. ' +
        'Requires ANTHROPIC_API_KEY in the environment.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'topicArea'],
        properties: {
          courseId: { type: 'string' },
          topicArea: {
            type: 'string',
            description: 'Topic area to scan, e.g. "Prompt engineering and LLM agents".',
          },
          since: {
            type: 'string',
            description: 'ISO date string. Scan for developments since this date.',
          },
        },
      },
    },
    {
      name: 'suggest_topics',
      description:
        'Merge RSS feed items and LLM scan developments into ranked topic candidates. ' +
        'Reads news-cache.json if no inline items are supplied. Returns candidates sorted ' +
        'by relevance and mention frequency — ready for score_topic_currency.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId'],
        properties: {
          courseId: { type: 'string' },
          feedItems: {
            type: 'array',
            description: 'Feed items from fetch_news_feed (optional — falls back to news-cache.json).',
          },
          scanDevelopments: {
            type: 'array',
            description: 'Developments from scan_recent_developments (optional).',
          },
        },
      },
    },
    {
      name: 'score_topic_currency',
      description:
        'Classify a topic as evergreen / current / dated using news-hit count and ' +
        'how recently it was taught. Returns the classification plus the raw signals so ' +
        'recommend_for_topic can produce a verdict.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'topic', 'newsHits', 'lastTaughtSemesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          topic: { type: 'string' },
          newsHits: {
            oneOf: [
              { type: 'number' },
              {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['date', 'title'],
                  properties: {
                    source: { type: 'string' },
                    date: { type: 'string' },
                    title: { type: 'string' },
                  },
                },
              },
            ],
            description: 'Number of recent news/feed items, or headline objects for optional semantic verification.',
          },
          lastTaughtSemesterId: {
            type: ['string', 'null'],
            description: 'Semester id when the topic was last taught, or null if never.',
          },
          semanticVerify: {
            type: 'boolean',
            description: 'Optionally ask the configured LLM whether headline hits are semantically relevant.',
          },
        },
      },
    },
    {
      name: 'recommend_for_topic',
      description:
        'Return a KEEP / UPDATE / DROP / ADD verdict for a topic based on its currency ' +
        'class and teaching history. Default output is concise (topic + verdict + rationale). ' +
        'Pass includeDetails=true for full signal breakdown.',
      inputSchema: {
        type: 'object' as const,
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
    },
    {
      name: 'generate_ideas_file',
      description:
        'Write ideas.md under the course folder after a v0.5/0.6 run. Lists deferred v1 ' +
        'scope (outline generator, date shifting, shell update), architecture follow-ons, ' +
        'and suggested next prompts for the model. Optionally records usage notes from this run.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId'],
        properties: {
          courseId: { type: 'string' },
          usageNotes: {
            type: 'string',
            description: 'Optional. Notes on what worked or what to improve, captured in the file.',
          },
        },
      },
    },
    {
      name: 'import_previous_shell',
      description: "Read last semester's Canvas archive or CDS course/ folder and create a next-plan/ skeleton for the new semester. Writes CI front matter to each brief file and a plan-config.json.",
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'sourceSemesterId', 'newSemesterId', 'source'],
        properties: {
          courseId: { type: 'string' },
          sourceSemesterId: { type: 'string' },
          newSemesterId: { type: 'string' },
          source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
          cdsPath: { type: 'string', description: 'Absolute path to existing CDS course/ folder. Required when source is "cds".' },
        },
      },
    },
    {
      name: 'fetch_academic_calendar',
      description: "Parse an institution's academic calendar page or accept manual dates. Saves calendar.json to the plan. Pass url to scrape, startDate/endDate for manual input, or semesterPattern (e.g. \"Fall2026\") for US convention defaults.",
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          url: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          breaks: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }, required: ['name', 'start', 'end'] } },
          semesterPattern: { type: 'string' },
        },
      },
    },
    {
      name: 'shift_dates',
      description: "Apply the target semester's calendar to all due: fields in next-plan/. Handles multi-section per-section offsets. Requires calendar.json (run fetch_academic_calendar first).",
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'onBreakCollision'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          onBreakCollision: { type: 'string', enum: ['bump-before', 'bump-after', 'flag'] },
          sections: { type: 'array', items: { type: 'object' } },
        },
      },
    },
    {
      name: 'generate_recommended_outline',
      description: 'Produce a week-by-week module outline for the new semester informed by diff and verdict data. Writes plan-outline.md to next-plan/.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
        },
      },
    },
    {
      name: 'draft_assignment_brief',
      description: 'Use the LLM to draft an updated assignment brief. Sets replacement_recommended if verdict is DROP or semestersSince >= 6.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'briefPath'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          briefPath: { type: 'string', description: 'Absolute path to the brief .md file in next-plan/.' },
          includeDetails: { type: 'boolean' },
        },
      },
    },
    {
      name: 'update_examples',
      description: 'Two-pass refresh of stale references in a brief. Pass 1 (always): replace outdated year refs and tool names. Pass 2 (optional, llmPass:true): LLM identifies deeper staleness and returns proposed rewrites for professor review.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'briefPath'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          briefPath: { type: 'string' },
          llmPass: { type: 'boolean' },
        },
      },
    },
    {
      name: 'export_course_folder',
      description: 'Translate the approved next-plan/ into a CDS-compatible course/ folder. Strips CI front matter fields. Multi-section: produces one course/ folder per section.',
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
      name: 'analyze_course',
      description:
        'Run the full CI analysis pipeline: ingest the archive, diff against same-season and most-recent prior semesters, score currency per assignment, generate verdicts (KEEP/UPDATE/DROP/ADD), and append an entry to the course trajectory log. Returns a structured report including the trajectory snapshot. Set extractConcepts: true to additionally derive LLM-extracted concepts spanning multiple assignments.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'archivePath'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          archivePath: { type: 'string', description: 'Absolute path to the Canvas export folder.' },
          semanticVerify: { type: 'boolean', description: 'Run the optional LLM verification pass on currency scoring.' },
          extractConcepts: { type: 'boolean', description: 'When true and an LLM client is configured (ANTHROPIC_API_KEY env var), additionally derive LLM-extracted concepts spanning multiple assignments.' },
        },
      },
    },
    {
      name: 'get_course_trajectory',
      description:
        'Read the course trajectory log and return analysis: churn rate across semesters, currently unstable topics (verdict flipping), true evergreens (KEEP for 4+ consecutive runs), and per-topic verdict timelines.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId'],
        properties: {
          courseId: { type: 'string' },
          granularity: { type: 'string', enum: ['summary', 'standard', 'granular'], description: 'Defaults to "standard".' },
          lookback: { type: 'number', description: 'Number of most-recent entries to consider.' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === 'setup_course') {
      const result = setupCourse(args as unknown as Parameters<typeof setupCourse>[0]);
      return {
        content: [
          {
            type: 'text',
            text:
              `Registered course **${result.id}** — "${result.title}".\n\n` +
              `Course path: ${result.coursePath}\n` +
              `Course root: ${result.courseRoot}`,
          },
        ],
      };
    }
    if (name === 'get_course_state') {
      const result = getCourseState(
        (args as unknown as Parameters<typeof getCourseState>[0]) ?? {}
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    if (name === 'ingest_canvas_archive') {
      const result = ingestCanvasArchive(
        args as unknown as Parameters<typeof ingestCanvasArchive>[0]
      );
      return {
        content: [
          {
            type: 'text',
            text:
              `Ingested **${result.courseId}** / ${result.semesterId}.\n\n` +
              `- Modules: ${result.moduleCount}\n` +
              `- Assignments: ${result.assignmentCount}\n` +
              `- Pages: ${result.pageCount}\n` +
              `- Resource links: ${result.resourceLinkCount}\n\n` +
              `Wrote: ${result.topicMapPath}`,
          },
        ],
      };
    }
    if (name === 'list_assignments') {
      const result = listAssignments(args as unknown as Parameters<typeof listAssignments>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'list_pages') {
      const result = listPages(args as unknown as Parameters<typeof listPages>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'list_modules') {
      const result = listModules(args as unknown as Parameters<typeof listModules>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'list_resources') {
      const result = listResources(args as unknown as Parameters<typeof listResources>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'diff_semesters') {
      const result = diffSemesters(args as unknown as Parameters<typeof diffSemesters>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'ingest_transcripts') {
      const result = ingestTranscripts(
        args as unknown as Parameters<typeof ingestTranscripts>[0]
      );
      return {
        content: [
          {
            type: 'text',
            text:
              `Ingested ${result.transcriptCount} transcripts for **${result.courseId}** / ${result.semesterId}.\n\n` +
              `Wrote: ${result.transcriptsJsonPath}` +
              (result.copiedTo ? `\nCopied source files to: ${result.copiedTo}` : ''),
          },
        ],
      };
    }
    if (name === 'map_transcripts_to_weeks') {
      const result = mapTranscriptsToWeeks(
        args as unknown as Parameters<typeof mapTranscriptsToWeeks>[0]
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'extract_lecture_topics') {
      const result = extractLectureTopics(
        args as unknown as Parameters<typeof extractLectureTopics>[0]
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'find_off_syllabus_topics') {
      const result = findOffSyllabusTopics(
        args as unknown as Parameters<typeof findOffSyllabusTopics>[0]
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'build_quote_bank') {
      const result = buildQuoteBank(
        args as unknown as Parameters<typeof buildQuoteBank>[0]
      );
      return {
        content: [
          {
            type: 'text',
            text:
              `Built quote bank for **${result.courseId}** / ${result.semesterId}.\n\n` +
              `Extracted ${result.quoteCount} notable quotes.\n\n` +
              `Wrote: ${result.quoteBankPath}`,
          },
        ],
      };
    }
    if (name === 'fetch_news_feed') {
      const raw = args as Record<string, unknown>;
      const since = typeof raw.since === 'string' ? new Date(raw.since) : undefined;
      const result = await fetchNewsFeed({
        courseId: raw.courseId as string,
        feedUrls: raw.feedUrls as string[],
        since,
      });
      const errorNote = result.errors.length
        ? `\n\n**Errors (${result.errors.length}):**\n` +
          result.errors.map((e) => `- ${e.feedUrl}: ${e.message}`).join('\n')
        : '';
      return {
        content: [
          {
            type: 'text',
            text:
              `Fetched ${result.feedCount} feed(s) for **${result.courseId}**.\n\n` +
              `Retrieved ${result.itemCount} items.\n\n` +
              `Wrote: ${result.cachePath}` +
              errorNote,
          },
        ],
      };
    }
    if (name === 'scan_recent_developments') {
      const raw = args as Record<string, unknown>;
      const since = typeof raw.since === 'string' ? new Date(raw.since) : undefined;
      const result = await scanRecentDevelopments({
        courseId: raw.courseId as string,
        topicArea: raw.topicArea as string,
        since,
        llmClient: getLlmClient(),
        searchClient: getSearchClient(),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'suggest_topics') {
      const result = suggestTopics(args as unknown as Parameters<typeof suggestTopics>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'score_topic_currency') {
      const raw = args as Record<string, unknown>;
      const result = await Promise.resolve(scoreTopicCurrency({
        ...(raw as unknown as Parameters<typeof scoreTopicCurrency>[0]),
        ...(raw.semanticVerify ? { llmClient: getLlmClient() } : {}),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'recommend_for_topic') {
      const result = recommendForTopic(args as unknown as Parameters<typeof recommendForTopic>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'generate_ideas_file') {
      const result = generateIdeasFile(args as unknown as Parameters<typeof generateIdeasFile>[0]);
      return {
        content: [
          {
            type: 'text',
            text:
              `Generated ideas.md for **${result.courseId}**.\n\n` +
              `Path: ${result.ideasPath}\n\n` +
              `Open it to see deferred v1 scope, architecture follow-ons, and suggested next prompts.`,
          },
        ],
      };
    }
    if (name === 'import_previous_shell') {
      const result = importPreviousShell(args as unknown as Parameters<typeof importPreviousShell>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'fetch_academic_calendar') {
      const result = await fetchAcademicCalendar(args as unknown as Parameters<typeof fetchAcademicCalendar>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'shift_dates') {
      const result = shiftDates(args as unknown as Parameters<typeof shiftDates>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'generate_recommended_outline') {
      const result = generateRecommendedOutline(args as unknown as Parameters<typeof generateRecommendedOutline>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'draft_assignment_brief') {
      const result = await draftAssignmentBrief({ ...(args as unknown as Parameters<typeof draftAssignmentBrief>[0]), llmClient: getLlmClient() });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'update_examples') {
      const p = args as unknown as Parameters<typeof updateExamples>[0];
      const llmClient = getLlmClient();
      const result = p.llmPass ? await updateExamples({ ...p, llmPass: true, llmClient }) : updateExamples(p);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'export_course_folder') {
      const result = exportCourseFolder(args as unknown as Parameters<typeof exportCourseFolder>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'analyze_course') {
      const raw = args as Record<string, unknown>;
      const extractConcepts = raw.extractConcepts === true;
      const result = await ciAnalyzeCourseFull({
        courseId: raw.courseId as string,
        semesterId: raw.semesterId as string,
        archivePath: raw.archivePath as string,
        extractConcepts,
        ...(extractConcepts ? { llmClient: getLlmClient() } : {}),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'get_course_trajectory') {
      const raw = args as Record<string, unknown>;
      const result = await getCourseTrajectory({
        courseId: raw.courseId as string,
        granularity: raw.granularity as 'summary' | 'standard' | 'granular' | undefined,
        lookback: typeof raw.lookback === 'number' ? raw.lookback : undefined,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: formatError({
            title: `Tool error — ${name}`,
            message,
            fix: ['Check the tool arguments against its inputSchema.'],
          }),
        },
      ],
      isError: true,
    };
  }
});

// Only boot the MCP server when this file is the process entrypoint.
// Importing the package root must never attach stdio.
// realpath so npm bin shims that pass the node_modules symlink path still match.
function isMainModule(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMainModule()) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
