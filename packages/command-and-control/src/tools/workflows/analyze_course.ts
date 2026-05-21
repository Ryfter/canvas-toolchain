import { ingestCanvasArchive } from 'curriculum-intelligence-mcp/dist/tools/ingest_canvas_archive.js';

export interface AnalyzeCourseInput {
  courseId: string;
  semesterId: string;
  archivePath: string;
}

export interface AnalyzeCourseResult {
  courseId: string;
  semesterId: string;
  ingest: Awaited<ReturnType<typeof ingestCanvasArchive>>;
  status: 'complete';
}

export async function analyzeCourse(input: AnalyzeCourseInput): Promise<AnalyzeCourseResult> {
  const { courseId, semesterId, archivePath } = input;

  const ingest = ingestCanvasArchive({ courseId, semesterId, archivePath });

  return { courseId, semesterId, ingest, status: 'complete' };
}
