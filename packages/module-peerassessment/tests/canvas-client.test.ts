import { describe, it, expect } from 'vitest';
import { PaCanvasClient } from '../src/canvas/client.js';

/** Build a fake fetch that maps URL substrings to JSON payloads (no Link paging). */
function fakeFetch(routes: Array<{ match: string; body: unknown }>): typeof fetch {
  return (async (url: string) => {
    const hit = routes.find((r) => url.includes(r.match));
    if (!hit) throw new Error(`unexpected url: ${url}`);
    return {
      ok: true,
      status: 200,
      json: async () => hit.body,
      headers: { get: () => null },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const creds = { host: 'canvas.test', token: 't' };

describe('PaCanvasClient.readGroupSet', () => {
  it('resolves a group set name to groups with members', async () => {
    const fetchImpl = fakeFetch([
      { match: '/courses/5/group_categories', body: [{ id: 9, name: 'Project Teams' }, { id: 8, name: 'Other' }] },
      { match: '/group_categories/9/groups', body: [{ id: 21, name: 'Team 1' }] },
      { match: '/groups/21/users', body: [
        { id: 100, name: 'Jane Public', sortable_name: 'Public, Jane', login_id: 'jpublic', sis_user_id: '900111', email: 'jane@u.edu' },
      ] },
    ]);
    const client = new PaCanvasClient(creds, { fetchImpl });
    const groups = await client.readGroupSet(5, 'Project Teams');
    expect(groups).toEqual([
      { name: 'Team 1', members: [
        { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', loginId: 'jpublic', sisUserId: '900111', email: 'jane@u.edu' },
      ] },
    ]);
  });

  it('throws GROUP_SET_NOT_FOUND when the name is absent', async () => {
    const fetchImpl = fakeFetch([{ match: '/group_categories', body: [{ id: 8, name: 'Other' }] }]);
    const client = new PaCanvasClient(creds, { fetchImpl });
    await expect(client.readGroupSet(5, 'Project Teams')).rejects.toThrow(/GROUP_SET_NOT_FOUND/);
  });

  it('listCourseStudents normalizes users and tolerates missing login/sis', async () => {
    const fetchImpl = fakeFetch([
      { match: '/courses/5/users', body: [{ id: 100, name: 'Jane Public', sortable_name: 'Public, Jane', email: 'jane@u.edu' }] },
    ]);
    const client = new PaCanvasClient(creds, { fetchImpl });
    const students = await client.listCourseStudents(5);
    expect(students).toEqual([
      { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', loginId: undefined, sisUserId: undefined, email: 'jane@u.edu' },
    ]);
  });
});

describe('PaCanvasClient paging', () => {
  it('follows rel="next" Link headers and concatenates pages', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes('/courses/5/users') && !url.includes('page=2')) {
        return {
          ok: true, status: 200,
          json: async () => [{ id: 1, name: 'A One', sortable_name: 'One, A' }],
          headers: { get: (h: string) => h.toLowerCase() === 'link'
            ? '<https://canvas.test/api/v1/courses/5/users?page=2>; rel="next"' : null },
        } as unknown as Response;
      }
      if (url.includes('/courses/5/users') && url.includes('page=2')) {
        return {
          ok: true, status: 200,
          json: async () => [{ id: 2, name: 'B Two', sortable_name: 'Two, B' }],
          headers: { get: () => null },
        } as unknown as Response;
      }
      throw new Error(`unexpected url: ${url}`);
    }) as unknown as typeof fetch;
    const client = new PaCanvasClient({ host: 'canvas.test', token: 't' }, { fetchImpl });
    const students = await client.listCourseStudents(5);
    expect(students.map((s) => s.canvasId)).toEqual(['1', '2']);
  });
});
