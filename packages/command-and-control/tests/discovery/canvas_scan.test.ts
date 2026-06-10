import { describe, expect, it } from 'vitest';
import { scanCanvasTools } from '../../src/discovery/canvas_scan.js';

const cfg = { canvasUrl: 'https://x.instructure.com', apiToken: 't' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function pagedResponse(body: unknown, nextUrl?: string): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (nextUrl) headers.link = `<${nextUrl}>; rel="next"`;
  return new Response(JSON.stringify(body), { status: 200, headers });
}

describe('scanCanvasTools', () => {
  it('follows Link-header pagination instead of truncating at one page', async () => {
    const page2 = 'https://x.instructure.com/api/v1/accounts/self/external_tools?page=2';
    const fetchFn = async (url: string) => {
      if (url.includes('page=2')) return jsonResponse([{ name: 'Gradescope' }]);
      if (url.includes('/accounts/self/external_tools')) return pagedResponse([{ name: 'Panopto' }], page2);
      throw new Error(`unexpected url ${url}`);
    };
    const res = await scanCanvasTools(cfg, fetchFn as unknown as typeof fetch);
    expect(res.tier).toBe('account');
    expect(res.tools.map((t) => t.rawName).sort()).toEqual(['Gradescope', 'Panopto']);
  });

  it('returns account tier when account external_tools succeeds', async () => {
    const fetchFn = async (url: string) => {
      if (url.includes('/accounts/self/external_tools')) return jsonResponse([{ name: 'BSU Panopto' }, { name: 'Zoom' }]);
      throw new Error('should not reach per-course');
    };
    const res = await scanCanvasTools(cfg, fetchFn as unknown as typeof fetch);
    expect(res.tier).toBe('account');
    expect(res.tools.map((t) => t.rawName)).toContain('BSU Panopto');
    expect(res.gaps).toEqual([]);
  });

  it('falls back to per-course on account 403, unioning tools with course attribution', async () => {
    const fetchFn = async (url: string) => {
      if (url.includes('/accounts/self/external_tools')) return jsonResponse({ errors: 'forbidden' }, 403);
      if (url.includes('/courses?')) return jsonResponse([{ id: 11, name: 'ITM 370' }, { id: 12, name: 'ITM 310' }]);
      if (url.includes('/courses/11/external_tools')) return jsonResponse([{ name: 'Panopto' }]);
      if (url.includes('/courses/12/external_tools')) return jsonResponse([{ name: 'Panopto' }, { name: 'Gradescope' }]);
      throw new Error(`unexpected url ${url}`);
    };
    const res = await scanCanvasTools(cfg, fetchFn as unknown as typeof fetch);
    expect(res.tier).toBe('course');
    const panopto = res.tools.find((t) => t.rawName === 'Panopto')!;
    expect(panopto.courses?.sort()).toEqual(['ITM 310', 'ITM 370']);
    expect(res.gaps.some((g) => /account/i.test(g))).toBe(true);
  });

  it('returns self-report tier when there is no token', async () => {
    const res = await scanCanvasTools({ canvasUrl: '', apiToken: '' }, (async () => {
      throw new Error('no network');
    }) as unknown as typeof fetch);
    expect(res.tier).toBe('self-report');
    expect(res.tools).toEqual([]);
  });

  it('keeps successful courses and notes a gap when one course read fails', async () => {
    const fetchFn = async (url: string) => {
      if (url.includes('/accounts/self/external_tools')) return jsonResponse({}, 403);
      if (url.includes('/courses?')) return jsonResponse([{ id: 11, name: 'A' }, { id: 12, name: 'B' }]);
      if (url.includes('/courses/11/external_tools')) return jsonResponse([{ name: 'Panopto' }]);
      if (url.includes('/courses/12/external_tools')) return jsonResponse({}, 500);
      throw new Error(`unexpected url ${url}`);
    };
    const res = await scanCanvasTools(cfg, fetchFn as unknown as typeof fetch);
    expect(res.tools.map((t) => t.rawName)).toEqual(['Panopto']);
    expect(res.gaps.some((g) => /B/.test(g))).toBe(true);
  });
});
