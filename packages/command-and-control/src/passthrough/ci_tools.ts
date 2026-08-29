import { setupCourse } from '@canvas-toolchain/curriculum-intelligence/dist/tools/setup_course.js';
import { getCourseState } from '@canvas-toolchain/curriculum-intelligence/dist/tools/get_course_state.js';
import { ingestCanvasArchive } from '@canvas-toolchain/curriculum-intelligence/dist/tools/ingest_canvas_archive.js';
import { listAssignments } from '@canvas-toolchain/curriculum-intelligence/dist/tools/list_assignments.js';
import { listPages } from '@canvas-toolchain/curriculum-intelligence/dist/tools/list_pages.js';
import { listModules } from '@canvas-toolchain/curriculum-intelligence/dist/tools/list_modules.js';
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
import { updateExamples } from '@canvas-toolchain/curriculum-intelligence/dist/tools/update_examples.js';
import { exportCourseFolder } from '@canvas-toolchain/curriculum-intelligence/dist/tools/export_course_folder.js';
import type { TaskCategory } from '../types.js';

export interface PassthroughTool {
  name: string;
  taskCategory: TaskCategory;
  handler: (args: unknown) => unknown | Promise<unknown>;
}

export const CI_TOOLS: PassthroughTool[] = [
  {
    name: 'setup_course',
    taskCategory: 'none',
    handler: (args) => setupCourse(args as Parameters<typeof setupCourse>[0]),
  },
  {
    name: 'get_course_state',
    taskCategory: 'none',
    handler: (args) => getCourseState(args as Parameters<typeof getCourseState>[0]),
  },
  {
    name: 'ingest_canvas_archive',
    taskCategory: 'none',
    handler: (args) => ingestCanvasArchive(args as Parameters<typeof ingestCanvasArchive>[0]),
  },
  {
    name: 'list_assignments',
    taskCategory: 'none',
    handler: (args) => listAssignments(args as Parameters<typeof listAssignments>[0]),
  },
  {
    name: 'list_pages',
    taskCategory: 'none',
    handler: (args) => listPages(args as Parameters<typeof listPages>[0]),
  },
  {
    name: 'list_modules',
    taskCategory: 'none',
    handler: (args) => listModules(args as Parameters<typeof listModules>[0]),
  },
  {
    name: 'list_resources',
    taskCategory: 'none',
    handler: (args) => listResources(args as Parameters<typeof listResources>[0]),
  },
  {
    name: 'diff_semesters',
    taskCategory: 'none',
    handler: (args) => diffSemesters(args as Parameters<typeof diffSemesters>[0]),
  },
  {
    name: 'ingest_transcripts',
    taskCategory: 'none',
    handler: (args) => ingestTranscripts(args as Parameters<typeof ingestTranscripts>[0]),
  },
  {
    name: 'map_transcripts_to_weeks',
    taskCategory: 'none',
    handler: (args) => mapTranscriptsToWeeks(args as Parameters<typeof mapTranscriptsToWeeks>[0]),
  },
  {
    name: 'extract_lecture_topics',
    taskCategory: 'fast',
    handler: (args) => extractLectureTopics(args as Parameters<typeof extractLectureTopics>[0]),
  },
  {
    name: 'find_off_syllabus_topics',
    taskCategory: 'none',
    handler: (args) => findOffSyllabusTopics(args as Parameters<typeof findOffSyllabusTopics>[0]),
  },
  {
    name: 'build_quote_bank',
    taskCategory: 'fast',
    handler: (args) => buildQuoteBank(args as Parameters<typeof buildQuoteBank>[0]),
  },
  {
    name: 'fetch_news_feed',
    taskCategory: 'fast',
    handler: (args) => fetchNewsFeed(args as Parameters<typeof fetchNewsFeed>[0]),
  },
  {
    name: 'scan_recent_developments',
    taskCategory: 'judgment',
    handler: (args) => scanRecentDevelopments(args as Parameters<typeof scanRecentDevelopments>[0]),
  },
  {
    name: 'suggest_topics',
    taskCategory: 'judgment',
    handler: (args) => suggestTopics(args as Parameters<typeof suggestTopics>[0]),
  },
  {
    name: 'score_topic_currency',
    taskCategory: 'fast',
    handler: (args) => scoreTopicCurrency(args as Parameters<typeof scoreTopicCurrency>[0]),
  },
  {
    name: 'recommend_for_topic',
    taskCategory: 'judgment',
    handler: (args) => recommendForTopic(args as Parameters<typeof recommendForTopic>[0]),
  },
  {
    name: 'generate_ideas_file',
    taskCategory: 'judgment',
    handler: (args) => generateIdeasFile(args as Parameters<typeof generateIdeasFile>[0]),
  },
  {
    name: 'import_previous_shell',
    taskCategory: 'none',
    handler: (args) => importPreviousShell(args as Parameters<typeof importPreviousShell>[0]),
  },
  {
    name: 'fetch_academic_calendar',
    taskCategory: 'none',
    handler: (args) => fetchAcademicCalendar(args as Parameters<typeof fetchAcademicCalendar>[0]),
  },
  {
    name: 'shift_dates',
    taskCategory: 'none',
    handler: (args) => shiftDates(args as Parameters<typeof shiftDates>[0]),
  },
  {
    name: 'generate_recommended_outline',
    taskCategory: 'judgment',
    handler: (args) => generateRecommendedOutline(args as Parameters<typeof generateRecommendedOutline>[0]),
  },
  {
    name: 'draft_assignment_brief',
    taskCategory: 'judgment',
    handler: (args) => draftAssignmentBrief(args as Parameters<typeof draftAssignmentBrief>[0]),
  },
  {
    name: 'update_examples',
    taskCategory: 'fast',
    handler: (args) => {
      const p = args as Parameters<typeof updateExamples>[0];
      return (p as { llmPass?: boolean }).llmPass ? updateExamples({ ...p, llmPass: true }) : updateExamples(p);
    },
  },
  {
    name: 'export_course_folder',
    taskCategory: 'none',
    handler: (args) => exportCourseFolder(args as Parameters<typeof exportCourseFolder>[0]),
  },
];
