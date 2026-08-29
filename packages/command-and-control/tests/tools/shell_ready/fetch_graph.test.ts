import { describe, it, expect } from 'vitest';
import { fetchShellGraph } from '../../../src/tools/shell_ready/fetch_graph.js';

const cfg = {
  canvasUrl: 'https://example.instructure.com',
  apiToken: 'tok-test',
};

function jsonResponse(body: unknown, status = 200, link?: string): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (link) headers.link = link;
  return new Response(JSON.stringify(body), { status, headers });
}

describe('fetchShellGraph', () => {
  it('fetches course + modules + assignments with injectable fetch', async () => {
    const fetchFn = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/courses/42')) {
        return jsonResponse({ id: 42, name: 'Example Course' });
      }
      if (u.includes('/modules')) {
        return jsonResponse([
          {
            id: 1, name: 'Week 1', position: 1, published: true,
            items: [{ id: 10, title: 'Intro', type: 'Page', published: true, content_id: 5 }],
          },
        ]);
      }
      if (u.includes('/assignments')) {
        return jsonResponse([
          { id: 99, name: 'HW1', published: true, due_at: '2026-08-30T23:59:00Z', points_possible: 10 },
        ]);
      }
      if (u.includes('/pages')) {
        return jsonResponse([{ url: 'home', title: 'Home', published: true, front_page: true }]);
      }
      if (u.includes('/pages/home')) {
        return jsonResponse({ body: '<p>hi</p>' });
      }
      throw new Error(`unexpected ${u}`);
    };

    const g = await fetchShellGraph(42, { cfg, fetchFn: fetchFn as typeof fetch });
    expect(g.courseName).toBe('Example Course');
    expect(g.modules).toHaveLength(1);
    expect(g.modules[0].items[0].title).toBe('Intro');
    expect(g.assignments[0].dueAt).toContain('2026-08-30');
    expect(g.hasFrontPage).toBe(true);
  });

  it('refuses off-origin Link rel=next pagination', async () => {
    const fetchFn = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/courses/42')) return jsonResponse({ id: 42, name: 'X' });
      if (u.includes('/modules') && !u.includes('evil')) {
        return jsonResponse(
          [{ id: 1, name: 'Week 1', position: 1, published: true, items: [] }],
          200,
          '<https://evil.example/api/v1/modules?page=2>; rel="next"',
        );
      }
      throw new Error(`should not follow ${u}`);
    };

    await expect(fetchShellGraph(42, { cfg, fetchFn: fetchFn as typeof fetch }))
      .rejects.toThrow(/CANVAS_PAGINATION_OFF_HOST/);
  });
});
