import { describe, it, expect, vi } from 'vitest';
import { waveDeepCheck } from '../src/tools/a11y/wave.js';

const WAVE_OK = {
  status: { success: true, creditsremaining: 97 },
  categories: {
    error: { count: 2, items: {
      alt_missing: { id: 'alt_missing', description: 'Missing alternative text', count: 1 },
      totally_new_rule: { id: 'totally_new_rule', description: 'Something WAVE added', count: 1 },
    } },
    contrast: { count: 1, items: {
      contrast: { id: 'contrast', description: 'Very low contrast', count: 3 },
    } },
    alert: { count: 1, items: {
      heading_skipped: { id: 'heading_skipped', description: 'Skipped heading level', count: 1 },
    } },
  },
};

const okResponse = (body: unknown) => ({ status: 200, ok: true, headers: new Headers(), json: async () => body }) as unknown as Response;
const redirectTo = (location: string) => ({ status: 302, ok: false, headers: new Headers({ location }), json: async () => ({}) }) as unknown as Response;

describe('waveDeepCheck', () => {
  it('refuses an auth-gated URL before spending any credits', async () => {
    const fetchFn = vi.fn().mockResolvedValue(redirectTo('https://example.instructure.com/login/canvas'));
    const r = await waveDeepCheck({ url: 'https://example.instructure.com/courses/1/pages/x', apiKey: 'k', fetchFn });
    expect(r.error).toBe('AUTH_GATED_URL');
    expect(fetchFn).toHaveBeenCalledTimes(1); // pre-flight only — no API call
    expect(r.message).toMatch(/cannot log into Canvas/i);
    expect(r.fix!.join(' ')).toMatch(/browser extension/i);
  });

  it('maps categories to canonical findings and collects unmapped ids', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(okResponse('<html>public page</html>'))
      .mockResolvedValueOnce(okResponse(WAVE_OK));
    const r = await waveDeepCheck({ url: 'https://www.example.edu/open-course/', apiKey: 'k', fetchFn });

    expect(r.error).toBeUndefined();
    const byId = Object.fromEntries(r.findings.map(f => [f.message, f]));
    const alt = r.findings.find(f => f.sc === '1.1.1')!;
    expect(alt.severity).toBe('critical');
    expect(alt.engine).toBe('wave');
    const contrast = r.findings.find(f => f.sc === '1.4.3')!;
    expect(contrast.severity).toBe('serious');
    const heading = r.findings.find(f => f.sc === '1.3.1')!;
    expect(heading.severity).toBe('moderate');
    expect(r.unmapped).toEqual([{ id: 'totally_new_rule', description: 'Something WAVE added', count: 1, category: 'error' }]);
    expect(r.creditsRemaining).toBe(97);
    // the API call carried the key and encoded url
    const apiUrl = String(fetchFn.mock.calls[1][0]);
    expect(apiUrl).toContain('wave.webaim.org/api/request');
    expect(apiUrl).toContain('key=k');
    expect(apiUrl).toContain('reporttype=2');
  });

  it('surfaces a WAVE-side failure as WAVE_API_ERROR', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(okResponse('<html>ok</html>'))
      .mockResolvedValueOnce(okResponse({ status: { success: false, error: 'invalid key' } }));
    const r = await waveDeepCheck({ url: 'https://www.example.edu/x', apiKey: 'bad', fetchFn });
    expect(r.error).toBe('WAVE_API_ERROR');
    expect(r.message).toContain('invalid key');
  });

  it('surfaces network failure as WAVE_UNREACHABLE', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const r = await waveDeepCheck({ url: 'https://www.example.edu/x', apiKey: 'k', fetchFn });
    expect(r.error).toBe('WAVE_UNREACHABLE');
  });
});
