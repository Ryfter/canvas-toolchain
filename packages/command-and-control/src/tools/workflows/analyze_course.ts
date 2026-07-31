import { analyzeCourse as ciAnalyzeCourse } from '@canvas-toolchain/curriculum-intelligence/dist/tools/analyze_course.js';
import { fetchNewsFeed } from '@canvas-toolchain/curriculum-intelligence/dist/tools/fetch_news_feed.js';
import { setupCourse } from '@canvas-toolchain/curriculum-intelligence/dist/tools/setup_course.js';

type CiReport = Awaited<ReturnType<typeof ciAnalyzeCourse>>;

export interface AnalyzeCourseInput {
  courseId: string;
  semesterId: string;
  archivePath: string;
  transcriptsPath?: string;
  feedUrls?: string[];
  semanticVerify?: boolean;
}

export interface AnalyzeCourseAugmentations {
  newsFeed?: Awaited<ReturnType<typeof fetchNewsFeed>>;
  searchScans?: unknown[];
  transcripts?: unknown;
  weekMap?: unknown;
}

export type AnalyzeCourseResult = CiReport & {
  augmentations: AnalyzeCourseAugmentations;
  status: 'complete';
};

export async function analyzeCourse(input: AnalyzeCourseInput): Promise<AnalyzeCourseResult> {
  const { courseId, semesterId, archivePath, transcriptsPath, feedUrls } = input;

  // Ensure course exists. setupCourse throws if already registered, so we catch that case.
  try {
    setupCourse({ id: courseId, title: courseId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('already registered')) throw err;
    // Course already set up — proceed
  }

  // 1. CI's full analysis — writes a trajectory entry to history.jsonl
  const ciReport = await ciAnalyzeCourse({ courseId, semesterId, archivePath });

  const augmentations: AnalyzeCourseAugmentations = {};

  // 2. RSS feeds, if provided
  if (feedUrls && feedUrls.length > 0) {
    augmentations.newsFeed = await fetchNewsFeed({ courseId, feedUrls });
  }

  // 3. Web search — only when BRAVE_SEARCH_API_KEY is set
  // BraveSearchAdapter and scanRecentDevelopments exist in CI dist, but we only
  // activate this when the key is present. Lazy-import to avoid a hard dependency
  // at module load time.
  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      const [{ BraveSearchAdapter }, { scanRecentDevelopments }] = await Promise.all([
        import('@canvas-toolchain/curriculum-intelligence/dist/search/brave_search_adapter.js'),
        import('@canvas-toolchain/curriculum-intelligence/dist/tools/scan_recent_developments.js'),
      ]);
      const searchClient = new BraveSearchAdapter(process.env.BRAVE_SEARCH_API_KEY);
      const topicArea = courseId;
      const scan = await scanRecentDevelopments({ courseId, topicArea, searchClient });
      augmentations.searchScans = [scan];
    } catch {
      // Gracefully degrade — scan is best-effort
    }
  }

  // 4. Transcripts, if a path was provided
  if (transcriptsPath) {
    try {
      const [{ ingestTranscripts }, { mapTranscriptsToWeeks }] = await Promise.all([
        import('@canvas-toolchain/curriculum-intelligence/dist/tools/ingest_transcripts.js'),
        import('@canvas-toolchain/curriculum-intelligence/dist/tools/map_transcripts_to_weeks.js'),
      ]);
      augmentations.transcripts = await ingestTranscripts({ courseId, semesterId, transcriptsPath });
      augmentations.weekMap = await mapTranscriptsToWeeks({ courseId, semesterId });
    } catch {
      // Gracefully degrade — transcripts are best-effort
    }
  }

  return { ...ciReport, augmentations, status: 'complete' };
}
