import { describe, it, expect } from 'vitest';
import { AnnouncementsClient } from '../src/canvas.js';

const creds = { host: 'canvas.test', token: 'secret-token' };

function page(body: unknown, nextLink?: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'link' && nextLink ? `<${nextLink}>; rel="next"` : null),
    },
  } as unknown as Response;
}

describe('AnnouncementsClient pagination origin guard (#124)', () => {
  it('follows same-host rel="next" links and concatenates pages', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (!url.includes('page=2')) {
        return page([{ id: 1 }], 'https://canvas.test/api/v1/courses/5/discussion_topics?page=2');
      }
      return page([{ id: 2 }]);
    }) as unknown as typeof fetch;
    const client = new AnnouncementsClient(creds, { fetchImpl });
    const rows = await client.listAnnouncements(5);
    expect(rows.map((r) => (r as { id: number }).id)).toEqual([1, 2]);
    expect(calls).toHaveLength(2);
  });

  it('refuses an off-host Link target and never sends the token there', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes('evil.example')) throw new Error(`credentialed request escaped to ${url}`);
      return page([{ id: 1 }], 'https://evil.example/steal?x=1');
    }) as unknown as typeof fetch;
    const client = new AnnouncementsClient(creds, { fetchImpl });
    await expect(client.listAnnouncements(5)).rejects.toThrow(/CANVAS_PAGINATION_OFF_HOST/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('canvas.test');
  });

  it('refuses an unparseable Link target instead of following it', async () => {
    let first = true;
    const fetchImpl = (async () => {
      if (first) { first = false; return page([{ id: 1 }], 'not a url'); }
      return page([]);
    }) as unknown as typeof fetch;
    const client = new AnnouncementsClient(creds, { fetchImpl });
    await expect(client.listAnnouncements(5)).rejects.toThrow(/CANVAS_PAGINATION_OFF_HOST/);
  });
});
