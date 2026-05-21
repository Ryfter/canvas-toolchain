import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBriefFile } from './front_matter.js';

export interface CdsBrief {
  title: string;
  week: number;
  type: string;
  points?: number;
  due?: string;
  body: string;
}

export interface CdsCourseFolder {
  courseId?: string;
  title?: string;
  semester?: string;
  briefs: CdsBrief[];
}

export function parseCdsCourseFolder(folderPath: string): CdsCourseFolder {
  const configPath = join(folderPath, 'course-config.md');
  let courseId: string | undefined;
  let title: string | undefined;
  let semester: string | undefined;

  if (existsSync(configPath)) {
    const { data } = parseBriefFile(readFileSync(configPath, 'utf-8'));
    courseId = data['courseId'] as string | undefined;
    title = data['title'] as string | undefined;
    semester = data['semester'] as string | undefined;
  }

  const briefs: CdsBrief[] = [];
  const entries = readdirSync(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('week-')) continue;
    const weekDir = join(folderPath, entry.name);
    const weekNum = parseInt(entry.name.replace('week-', ''), 10);
    for (const file of readdirSync(weekDir)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(weekDir, file), 'utf-8');
      const { data, body } = parseBriefFile(content);
      briefs.push({
        title: (data['title'] as string) ?? file.replace('.md', ''),
        week: (data['week'] as number) ?? weekNum,
        type: (data['type'] as string) ?? 'assignment',
        points: data['points'] as number | undefined,
        due: data['due'] as string | undefined,
        body,
      });
    }
  }

  return { courseId, title, semester, briefs };
}
