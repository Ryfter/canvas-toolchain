import { describe, it, expect, vi, afterEach } from 'vitest';
import { CanvasClient } from '../../src/data/canvas-client.js';

afterEach(() => { vi.restoreAllMocks(); });

function jsonResponse(body: unknown, link?: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: link ? { 'content-type': 'application/json', link } : { 'content-type': 'application/json' },
  });
}

describe('CanvasClient', () => {
  it('listStudentEnrollments follows Link-header pagination and Bearer-auths', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      const auth = (init?.headers as Record<string, string>).Authorization;
      expect(auth).toBe('Bearer tok');
      if (url.includes('page=2')) return jsonResponse([{ user_id: 2, grades: { current_score: 80 } }]);
      return jsonResponse(
        [{ user_id: 1, grades: { current_score: 91 } }],
        '<https://x.instructure.com/api/v1/courses/5/enrollments?page=2>; rel="next"',
      );
    });
    const c = new CanvasClient({ host: 'x.instructure.com', token: 'tok' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    const rows = await c.listStudentEnrollments(5);
    expect(rows.map((r) => r.user_id)).toEqual([1, 2]);
    expect(calls[0]).toContain('/api/v1/courses/5/enrollments');
    expect(calls[0]).toContain('type%5B%5D=StudentEnrollment');
  });

  it('refuses an off-host Link target and never sends the token there (#124)', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('evil.example')) throw new Error(`credentialed request escaped to ${url}`);
      return jsonResponse(
        [{ user_id: 1, grades: { current_score: 91 } }],
        '<https://evil.example/api/v1/courses/5/enrollments?page=2>; rel="next"',
      );
    });
    const c = new CanvasClient({ host: 'x.instructure.com', token: 'tok' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(c.listStudentEnrollments(5)).rejects.toThrow(/CANVAS_PAGINATION_OFF_HOST/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('x.instructure.com');
  });

  it('createGroupCategory POSTs the name', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Week 3 Teams' });
      return jsonResponse({ id: 77, name: 'Week 3 Teams' });
    });
    const c = new CanvasClient({ host: 'x.instructure.com', token: 'tok' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    expect(await c.createGroupCategory(5, 'Week 3 Teams')).toEqual({ id: 77, name: 'Week 3 Teams' });
  });
});
