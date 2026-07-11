import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverTools } from '../../src/tools/discover_tools.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// discoverTools now also does a best-effort channel-catalog pass (matchCatalogSuggestions)
// via the module-scoped `fetch`, independent of the per-test `deps.fetchFn` used for the
// Canvas scan. Isolate CC_HOME and stub global fetch to keep these tests offline and away
// from the real ~/.command-and-control directory.
let ccHome: string;
beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-discover-'));
  process.env.CC_HOME = ccHome;
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(ccHome, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

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
