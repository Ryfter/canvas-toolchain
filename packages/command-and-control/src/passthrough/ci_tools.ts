import { setupCourse } from 'curriculum-intelligence-mcp/dist/tools/setup_course.js';
import { getCourseState } from 'curriculum-intelligence-mcp/dist/tools/get_course_state.js';
import { ingestCanvasArchive } from 'curriculum-intelligence-mcp/dist/tools/ingest_canvas_archive.js';
import { listAssignments } from 'curriculum-intelligence-mcp/dist/tools/list_assignments.js';
import { listPages } from 'curriculum-intelligence-mcp/dist/tools/list_pages.js';
import { listModules } from 'curriculum-intelligence-mcp/dist/tools/list_modules.js';
import { listResources } from 'curriculum-intelligence-mcp/dist/tools/list_resources.js';
import { diffSemesters } from 'curriculum-intelligence-mcp/dist/tools/diff_semesters.js';
import { ingestTranscripts } from 'curriculum-intelligence-mcp/dist/tools/ingest_transcripts.js';
import { mapTranscriptsToWeeks } from 'curriculum-intelligence-mcp/dist/tools/map_transcripts_to_weeks.js';
import { extractLectureTopics } from 'curriculum-intelligence-mcp/dist/tools/extract_lecture_topics.js';
import { findOffSyllabusTopics } from 'curriculum-intelligence-mcp/dist/tools/find_off_syllabus_topics.js';
import { buildQuoteBank } from 'curriculum-intelligence-mcp/dist/tools/build_quote_bank.js';
import { fetchNewsFeed } from 'curriculum-intelligence-mcp/dist/tools/fetch_news_feed.js';
import { scanRecentDevelopments } from 'curriculum-intelligence-mcp/dist/tools/scan_recent_developments.js';
import { suggestTopics } from 'curriculum-intelligence-mcp/dist/tools/suggest_topics.js';
import { scoreTopicCurrency } from 'curriculum-intelligence-mcp/dist/tools/score_topic_currency.js';
import { recommendForTopic } from 'curriculum-intelligence-mcp/dist/tools/recommend_for_topic.js';
import { generateIdeasFile } from 'curriculum-intelligence-mcp/dist/tools/generate_ideas_file.js';
import { importPreviousShell } from 'curriculum-intelligence-mcp/dist/tools/import_previous_shell.js';
import { fetchAcademicCalendar } from 'curriculum-intelligence-mcp/dist/tools/fetch_academic_calendar.js';
import { shiftDates } from 'curriculum-intelligence-mcp/dist/tools/shift_dates.js';
import { generateRecommendedOutline } from 'curriculum-intelligence-mcp/dist/tools/generate_recommended_outline.js';
import { draftAssignmentBrief } from 'curriculum-intelligence-mcp/dist/tools/draft_assignment_brief.js';
import { updateExamples } from 'curriculum-intelligence-mcp/dist/tools/update_examples.js';
import { exportCourseFolder } from 'curriculum-intelligence-mcp/dist/tools/export_course_folder.js';
import type { TaskCategory } from '../types.js';

export interface PassthroughTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  taskCategory: TaskCategory;
  handler: (args: unknown) => unknown | Promise<unknown>;
}

export const CI_TOOLS: PassthroughTool[] = [
  {
    name: 'setup_course',
    taskCategory: 'none',
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
    handler: (args) => setupCourse(args as Parameters<typeof setupCourse>[0]),
  },
  {
    name: 'get_course_state',
    taskCategory: 'none',
    description: 'List registered courses with their on-disk paths, semester history, and feed counts.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional. Course id to inspect. Omit to list all.' },
      },
    },
    handler: (args) => getCourseState(args as Parameters<typeof getCourseState>[0]),
  },
  {
    name: 'ingest_canvas_archive',
    taskCategory: 'none',
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
    handler: (args) => ingestCanvasArchive(args as Parameters<typeof ingestCanvasArchive>[0]),
  },
  {
    name: 'list_assignments',
    taskCategory: 'none',
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
    handler: (args) => listAssignments(args as Parameters<typeof listAssignments>[0]),
  },
  {
    name: 'list_pages',
    taskCategory: 'none',
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
    handler: (args) => listPages(args as Parameters<typeof listPages>[0]),
  },
  {
    name: 'list_modules',
    taskCategory: 'none',
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
    handler: (args) => listModules(args as Parameters<typeof listModules>[0]),
  },
  {
    name: 'list_resources',
    taskCategory: 'none',
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
    handler: (args) => listResources(args as Parameters<typeof listResources>[0]),
  },
  {
    name: 'diff_semesters',
    taskCategory: 'none',
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
    handler: (args) => diffSemesters(args as Parameters<typeof diffSemesters>[0]),
  },
  {
    name: 'ingest_transcripts',
    taskCategory: 'none',
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
    handler: (args) => ingestTranscripts(args as Parameters<typeof ingestTranscripts>[0]),
  },
  {
    name: 'map_transcripts_to_weeks',
    taskCategory: 'none',
    description: 'Match each ingested transcript to a course week. Writes week-map.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: (args) => mapTranscriptsToWeeks(args as Parameters<typeof mapTranscriptsToWeeks>[0]),
  },
  {
    name: 'extract_lecture_topics',
    taskCategory: 'fast',
    description: 'Return lecture chunks shaped for Claude to reason over.',
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
    handler: (args) => extractLectureTopics(args as Parameters<typeof extractLectureTopics>[0]),
  },
  {
    name: 'find_off_syllabus_topics',
    taskCategory: 'none',
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
    handler: (args) => findOffSyllabusTopics(args as Parameters<typeof findOffSyllabusTopics>[0]),
  },
  {
    name: 'build_quote_bank',
    taskCategory: 'fast',
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
    handler: (args) => buildQuoteBank(args as Parameters<typeof buildQuoteBank>[0]),
  },
  {
    name: 'fetch_news_feed',
    taskCategory: 'fast',
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
    handler: (args) => fetchNewsFeed(args as Parameters<typeof fetchNewsFeed>[0]),
  },
  {
    name: 'scan_recent_developments',
    taskCategory: 'judgment',
    description: 'Ask Claude what\'s new in a given topic area since a date.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'topicArea'],
      properties: {
        courseId: { type: 'string' },
        topicArea: { type: 'string' },
        since: { type: 'string' },
      },
    },
    handler: (args) => scanRecentDevelopments(args as Parameters<typeof scanRecentDevelopments>[0]),
  },
  {
    name: 'suggest_topics',
    taskCategory: 'judgment',
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
    handler: (args) => suggestTopics(args as Parameters<typeof suggestTopics>[0]),
  },
  {
    name: 'score_topic_currency',
    taskCategory: 'fast',
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
    handler: (args) => scoreTopicCurrency(args as Parameters<typeof scoreTopicCurrency>[0]),
  },
  {
    name: 'recommend_for_topic',
    taskCategory: 'judgment',
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
    handler: (args) => recommendForTopic(args as Parameters<typeof recommendForTopic>[0]),
  },
  {
    name: 'generate_ideas_file',
    taskCategory: 'judgment',
    description: 'Write ideas.md with follow-on development ideas based on what the professor used.',
    inputSchema: {
      type: 'object',
      required: ['courseId'],
      properties: {
        courseId: { type: 'string' },
        context: { type: 'string' },
      },
    },
    handler: (args) => generateIdeasFile(args as Parameters<typeof generateIdeasFile>[0]),
  },
  {
    name: 'import_previous_shell',
    taskCategory: 'none',
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
    handler: (args) => importPreviousShell(args as Parameters<typeof importPreviousShell>[0]),
  },
  {
    name: 'fetch_academic_calendar',
    taskCategory: 'none',
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
    handler: (args) => fetchAcademicCalendar(args as Parameters<typeof fetchAcademicCalendar>[0]),
  },
  {
    name: 'shift_dates',
    taskCategory: 'none',
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
    handler: (args) => shiftDates(args as Parameters<typeof shiftDates>[0]),
  },
  {
    name: 'generate_recommended_outline',
    taskCategory: 'judgment',
    description: 'Generate a week-by-week outline from diff + optional currency-report.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: (args) => generateRecommendedOutline(args as Parameters<typeof generateRecommendedOutline>[0]),
  },
  {
    name: 'draft_assignment_brief',
    taskCategory: 'judgment',
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
    handler: (args) => draftAssignmentBrief(args as Parameters<typeof draftAssignmentBrief>[0]),
  },
  {
    name: 'update_examples',
    taskCategory: 'fast',
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
    handler: (args) => {
      const p = args as Parameters<typeof updateExamples>[0];
      return (p as { llmPass?: boolean }).llmPass ? updateExamples({ ...p, llmPass: true }) : updateExamples(p);
    },
  },
  {
    name: 'export_course_folder',
    taskCategory: 'none',
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
    handler: (args) => exportCourseFolder(args as Parameters<typeof exportCourseFolder>[0]),
  },
];
