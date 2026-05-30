import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listCanvasPages, listCanvasAssignments } from '../src/tools/list-canvas-objects.js';

const fakeApi = {
  listPages: vi.fn(),
  listAssignments: vi.fn(),
};

beforeEach(() => {
  fakeApi.listPages.mockReset();
  fakeApi.listAssignments.mockReset();
});

describe('listCanvasPages', () => {
  it('returns the api result verbatim', async () => {
    fakeApi.listPages.mockResolvedValue([{ url: 'a', title: 'A', html_url: 'https://x/a' }]);
    const out = await listCanvasPages(123, fakeApi as any);
    expect(out).toEqual([{ url: 'a', title: 'A', html_url: 'https://x/a' }]);
    expect(fakeApi.listPages).toHaveBeenCalledWith(123);
  });
});

describe('listCanvasAssignments', () => {
  it('returns id/name/description triples', async () => {
    fakeApi.listAssignments.mockResolvedValue([
      { id: 1, name: 'A', description: '<p>x</p>', other: 'ignored' },
      { id: 2, name: 'B', description: null },
    ]);
    const out = await listCanvasAssignments(123, fakeApi as any);
    expect(out).toEqual([
      { id: 1, name: 'A', description: '<p>x</p>' },
      { id: 2, name: 'B', description: null },
    ]);
  });
});
