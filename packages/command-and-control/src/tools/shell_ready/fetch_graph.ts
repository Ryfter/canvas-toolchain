import type { InstitutionConfigBridge } from '../publish/canvas_config_bridge.js';

export interface ShellGraphModuleItem {
  id: number;
  title: string;
  type: string;
  published: boolean;
  contentId?: number | null;
  htmlUrl?: string;
}

export interface ShellGraphModule {
  id: number;
  name: string;
  position: number;
  published: boolean;
  unlockAt?: string | null;
  items: ShellGraphModuleItem[];
}

export interface ShellGraphAssignment {
  id: number;
  name: string;
  published: boolean;
  dueAt?: string | null;
  unlockAt?: string | null;
  lockAt?: string | null;
  pointsPossible?: number | null;
  description?: string | null;
  htmlUrl?: string;
  isQuiz?: boolean;
}

export interface ShellGraphPage {
  url: string;
  title: string;
  published: boolean;
  frontPage: boolean;
  body?: string | null;
  htmlUrl?: string;
}

export interface ShellGraph {
  courseId: number;
  courseName: string;
  modules: ShellGraphModule[];
  assignments: ShellGraphAssignment[];
  pages: ShellGraphPage[];
  hasFrontPage: boolean;
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

function assertSameOrigin(nextUrl: string, expectedOrigin: string): string {
  let next: URL;
  try { next = new URL(nextUrl); }
  catch {
    throw new Error('CANVAS_PAGINATION_OFF_HOST: Canvas returned an unparseable Link "next" URL.');
  }
  if (next.origin !== expectedOrigin) {
    throw new Error(
      `CANVAS_PAGINATION_OFF_HOST: refusing Link next to ${next.origin}; credentials only for ${expectedOrigin}.`,
    );
  }
  return next.toString();
}

async function fetchJson<T>(
  url: string,
  token: string,
  fetchFn: typeof fetch,
): Promise<PaginatedRes<T>> {
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Canvas API ${res.status} ${res.statusText} for ${url}`);
  }
  const body = await res.json() as T;
  return { body, nextLink: parseNextLink(res.headers.get('link')) };
}

async function paginated<T>(
  initialUrl: string,
  token: string,
  fetchFn: typeof fetch,
): Promise<T[]> {
  const expectedOrigin = new URL(initialUrl).origin;
  const out: T[] = [];
  let url: string | undefined = initialUrl;
  while (url) {
    const r: PaginatedRes<T[]> = await fetchJson<T[]>(url, token, fetchFn);
    out.push(...r.body);
    url = r.nextLink === undefined ? undefined : assertSameOrigin(r.nextLink, expectedOrigin);
  }
  return out;
}

export interface FetchShellGraphDeps {
  cfg: InstitutionConfigBridge;
  fetchFn?: typeof fetch;
}

export async function fetchShellGraph(
  courseId: number,
  deps: FetchShellGraphDeps,
): Promise<ShellGraph> {
  const fetchFn = deps.fetchFn ?? fetch;
  const base = `${deps.cfg.canvasUrl.replace(/\/$/, '')}/api/v1`;
  const token = deps.cfg.apiToken;

  const course = await fetchJson<{ id: number; name: string }>(
    `${base}/courses/${courseId}`,
    token,
    fetchFn,
  );

  const modulesRaw = await paginated<{
    id: number;
    name: string;
    position: number;
    published?: boolean;
    unlock_at?: string | null;
    items?: Array<{
      id: number;
      title: string;
      type: string;
      published?: boolean;
      content_id?: number | null;
      html_url?: string;
    }>;
  }>(`${base}/courses/${courseId}/modules?per_page=100&include[]=items`, token, fetchFn);

  const assignsRaw = await paginated<{
    id: number;
    name: string;
    published?: boolean;
    due_at?: string | null;
    unlock_at?: string | null;
    lock_at?: string | null;
    points_possible?: number | null;
    description?: string | null;
    html_url?: string;
    is_quiz_assignment?: boolean;
  }>(`${base}/courses/${courseId}/assignments?per_page=100`, token, fetchFn);

  const pagesRaw = await paginated<{
    url: string;
    title: string;
    published?: boolean;
    front_page?: boolean;
    html_url?: string;
  }>(`${base}/courses/${courseId}/pages?per_page=100`, token, fetchFn);

  const pages: ShellGraphPage[] = [];
  for (const p of pagesRaw) {
    let body: string | null | undefined;
    if (p.published) {
      try {
        const full = await fetchJson<{ body?: string }>(
          `${base}/courses/${courseId}/pages/${encodeURIComponent(p.url)}`,
          token,
          fetchFn,
        );
        body = full.body.body ?? null;
      } catch {
        body = null;
      }
    }
    pages.push({
      url: p.url,
      title: p.title,
      published: !!p.published,
      frontPage: !!p.front_page,
      body,
      htmlUrl: p.html_url,
    });
  }

  return {
    courseId: course.body.id,
    courseName: course.body.name,
    modules: modulesRaw
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
      .map(m => ({
        id: m.id,
        name: m.name,
        position: m.position,
        published: !!m.published,
        unlockAt: m.unlock_at ?? null,
        items: (m.items ?? []).map(i => ({
          id: i.id,
          title: i.title,
          type: i.type,
          published: !!i.published,
          contentId: i.content_id ?? null,
          htmlUrl: i.html_url,
        })),
      })),
    assignments: assignsRaw.map(a => ({
      id: a.id,
      name: a.name,
      published: !!a.published,
      dueAt: a.due_at ?? null,
      unlockAt: a.unlock_at ?? null,
      lockAt: a.lock_at ?? null,
      pointsPossible: a.points_possible ?? null,
      description: a.description ?? null,
      htmlUrl: a.html_url,
      isQuiz: !!a.is_quiz_assignment,
    })),
    pages,
    hasFrontPage: pages.some(p => p.frontPage),
  };
}
