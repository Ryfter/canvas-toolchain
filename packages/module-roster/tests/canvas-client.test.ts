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
});
