import { describe, it, expect } from 'vitest';
import { RosterCanvasClient } from '../src/canvas/client.js';

function fakeFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

describe('RosterCanvasClient', () => {
  it('maps course users to CanvasUser with match fields', async () => {
    const client = new RosterCanvasClient(
      { host: 'x.instructure.com', token: 't' },
      { fetchImpl: fakeFetch([
        { id: 900, name: 'Jane Doe', login_id: 'jdoe', sis_user_id: '100', email: 'a@x.edu' },
        { id: 901, name: 'Bob Smith', login_id: 'bsmith' },
      ]) },
    );
    const users = await client.listCourseStudents(123);
    expect(users[0]).toEqual({
      canvasId: '900', name: 'Jane Doe', loginId: 'jdoe', sisUserId: '100', email: 'a@x.edu',
    });
    expect(users[1]).toEqual({ canvasId: '901', name: 'Bob Smith', loginId: 'bsmith', sisUserId: undefined, email: undefined });
  });

  it('throws a clear error on a non-OK Canvas response', async () => {
    const client = new RosterCanvasClient(
      { host: 'x.instructure.com', token: 't' },
      { fetchImpl: (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch },
    );
    await expect(client.listCourseStudents(123)).rejects.toThrow(/403/);
  });

  it('refuses an off-host Link target and never sends the token there (#124)', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes('evil.example')) throw new Error(`credentialed request escaped to ${url}`);
      return new Response(JSON.stringify([{ id: 900, name: 'Jane Doe' }]), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: '<https://evil.example/api/v1/courses/123/users?page=2>; rel="next"',
        },
      });
    }) as unknown as typeof fetch;
    const client = new RosterCanvasClient({ host: 'x.instructure.com', token: 't' }, { fetchImpl });
    await expect(client.listCourseStudents(123)).rejects.toThrow(/CANVAS_PAGINATION_OFF_HOST/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('x.instructure.com');
  });
});
