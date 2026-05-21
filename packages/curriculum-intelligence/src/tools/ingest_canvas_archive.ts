import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCanvasArchive } from '../parsers/canvas_archive.js';
import {
  ensureSemesterFolders,
  loadCourseConfig,
  saveCourseConfig,
} from '../kb/course_state.js';
import type { CourseId, SemesterId } from '../types.js';

export interface IngestCanvasArchiveInput {
  courseId: CourseId;
  semesterId: SemesterId;
  archivePath: string;
}

export interface IngestCanvasArchiveResult {
  courseId: CourseId;
  semesterId: SemesterId;
  topicMapPath: string;
  moduleCount: number;
  assignmentCount: number;
  pageCount: number;
  resourceLinkCount: number;
}

export function ingestCanvasArchive(
  input: IngestCanvasArchiveInput
): IngestCanvasArchiveResult {
  const config = loadCourseConfig(input.courseId);
  const map = parseCanvasArchive(input.archivePath, input.semesterId);

  const semDir = ensureSemesterFolders(input.courseId, input.semesterId);
  const topicMapPath = join(semDir, 'topic-map.json');
  writeFileSync(topicMapPath, JSON.stringify(map, null, 2), 'utf-8');

  const now = new Date().toISOString();
  const existing = config.semesters.find((s) => s.id === input.semesterId);
  if (existing) {
    existing.archivePath = input.archivePath;
    existing.lastIngestedAt = now;
  } else {
    config.semesters.push({
      id: input.semesterId,
      registeredAt: now,
      archivePath: input.archivePath,
      lastIngestedAt: now,
    });
  }
  saveCourseConfig(config);

  return {
    courseId: input.courseId,
    semesterId: input.semesterId,
    topicMapPath,
    moduleCount: map.modules.length,
    assignmentCount: map.assignments.length,
    pageCount: map.pages.length,
    resourceLinkCount: map.resourceLinks.length,
  };
}
