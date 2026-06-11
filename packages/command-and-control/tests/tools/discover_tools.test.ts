import { describe, expect, it } from 'vitest';
import { discoverTools } from '../../src/tools/discover_tools.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('discoverTools', () => {
  it('reports matched modules + unmatched + pick-list from an account scan', async () => {
    const deps = {
      loadConfig: () => ({ canvasUrl: 'https://x.instructure.com', apiToken: 't' }),
      fetchFn: (async (url: string) =>
        url.includes('/accounts/self/external_tools')
          ? jsonResponse([{ name: 'University Panopto' }, { name: 'iClicker' }])
          : jsonResponse({}, 404)) as unknown as typeof fetch,
      moduleState: async () => [{ id: 'video', name: 'Lecture Video', enabled: false, handles: ['panopto'], activeProvider: undefined }],
    };
    const r = await discoverTools({}, deps);
    expect(r.scanTier).toBe('account');
    expect(r.matchedModules).toEqual([{ tool: 'panopto', module: 'video', enabled: false }]);
    expect(r.unmatched).toContain('iclicker');
    expect(r.catalogPickList.length).toBeGreaterThanOrEqual(10);
  });

  it('returns self-report tier with empty detection when there is no token', async () => {
    const deps = {
      loadConfig: () => ({ canvasUrl: '', apiToken: '' }),
      fetchFn: (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
      moduleState: async () => [],
    };
    const r = await discoverTools({}, deps);
    expect(r.scanTier).toBe('self-report');
    expect(r.detected).toEqual([]);
    expect(r.catalogPickList.length).toBeGreaterThanOrEqual(10);
  });

  it('does not throw if loadConfig throws (no canvas configured) → self-report', async () => {
    const deps = {
      loadConfig: () => {
        throw new Error('CANVAS_NOT_CONFIGURED');
      },
      fetchFn: (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
      moduleState: async () => [],
    };
    const r = await discoverTools({}, deps);
    expect(r.scanTier).toBe('self-report');
  });
});
