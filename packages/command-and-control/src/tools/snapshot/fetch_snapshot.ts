import type { CourseSnapshot } from './types.js';
import { loadCanvasConfig } from '../setup_canvas.js';

interface CanvasCourseDetail {
  id: number;
  name: string;
  course_code?: string;
  workflow_state?: string;
  start_at?: string | null;
  end_at?: string | null;
  term?: { id?: number; name?: string };
}

interface CanvasAssignmentGroup {
  id: number;
  name: string;
  position: number;
}

interface CanvasAssignment {
  id: number;
  assignment_group_id: number;
  published: boolean;
}

interface CanvasModuleItem {
  id: number;
  type: string;
}

interface CanvasModule {
  id: number;
  name: string;
  position: number;
  workflow_state?: string;
  items?: CanvasModuleItem[];
}

interface PaginatedRes<T> {
  body: T;
  nextLink: string | undefined;
}

function parseNextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  for (const part of linkHeader.split(',')) {
    if (part.includes('rel="next"')) {
      return part.trim().split(';')[0].trim().replace(/^<|>$/g, '');
    }
  }
  return undefined;
}

async function fetchJson<T>(url: string, token: string): Promise<PaginatedRes<T>> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Canvas API ${res.status} ${res.statusText} for ${url}`);
  }
  const body = await res.json() as T;
  return { body, nextLink: parseNextLink(res.headers.get('link')) };
}

async function paginated<T>(initialUrl: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = initialUrl;
  while (url) {
    const r: PaginatedRes<T[]> = await fetchJson<T[]>(url, token);
    out.push(...r.body);
    url = r.nextLink;
  }
  return out;
}

/** Query Canvas comprehensively for snapshot_course. Returns a normalized
 *  CourseSnapshot containing only the data needed to render the auto-managed
 *  sections of the reference doc.
 *
 *  Reads creds from ~/.command-and-control/canvas-config.json by default.
 */
export async function fetchCourseSnapshot(courseId: number): Promise<CourseSnapshot> {
  const cfg = loadCanvasConfig();
  const base = `https://${cfg.host}/api/v1`;
  const token = cfg.token;

  // 1. Course details
  const courseRes = await fetchJson<CanvasCourseDetail>(`${base}/courses/${courseId}?include[]=term`, token);
  const course = courseRes.body;

  // 2. Assignment groups
  const groups = await paginated<CanvasAssignmentGroup>(
    `${base}/courses/${courseId}/assignment_groups?per_page=100`,
    token,
  );

  // 3. All assignments (to count per-group published / unpublished)
  const assigns = await paginated<CanvasAssignment>(
    `${base}/courses/${courseId}/assignments?per_page=100`,
    token,
  );

  // 4. Modules with items
  const modules = await paginated<CanvasModule>(
    `${base}/courses/${courseId}/modules?per_page=100&include[]=items`,
    token,
  );

  // Bucket assignments by group
  const byGroup = new Map<number, { pub: number; unpub: number }>();
  for (const g of groups) byGroup.set(g.id, { pub: 0, unpub: 0 });
  for (const a of assigns) {
    const slot = byGroup.get(a.assignment_group_id);
    if (!slot) continue;
    if (a.published) slot.pub += 1;
    else slot.unpub += 1;
  }

  return {
    course: {
      id: course.id,
      title: course.name,
      courseCode: course.course_code ?? '',
      workflowState: course.workflow_state ?? 'unknown',
      startAt: course.start_at ?? null,
      endAt: course.end_at ?? null,
      termName: course.term?.name,
    },
    assignmentGroups: groups
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
      .map(g => {
        const counts = byGroup.get(g.id) ?? { pub: 0, unpub: 0 };
        return {
          id: g.id,
          name: g.name,
          position: g.position,
          publishedCount: counts.pub,
          unpublishedCount: counts.unpub,
        };
      }),
    modules: modules
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
      .map(m => {
        const items = m.items ?? [];
        return {
          id: m.id,
          name: m.name,
          position: m.position,
          itemCount: items.length,
          itemTypes: Array.from(new Set(items.map(i => i.type))).sort(),
          workflowState: m.workflow_state,
        };
      }),
  };
}
