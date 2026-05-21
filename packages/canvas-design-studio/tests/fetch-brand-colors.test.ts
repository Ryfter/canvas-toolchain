import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchBrandColors } from '../src/tools/fetch-brand-colors.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchBrandColors', () => {
  it('rejects non-https URL before any fetch call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchBrandColors('http://example.com/brand');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('Brand URL Unreachable');
  });

  it('returns suggestion and full list when CSS vars present in inline <style>', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><style>--color-primary: #0033A0; --color-accent: #D64309;</style></html>',
    }));
    const result = await fetchBrandColors('https://example.com/brand');
    expect(result).toContain('## Brand Colors');
    expect(result).toContain('Suggested primary');
    expect(result).toContain('#0033A0');
    expect(result).toContain('--color-primary');
  });

  it('falls back to frequency ranking when no CSS vars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><style>color: #0033A0; color: #0033A0; border: #D64309;</style></html>',
    }));
    const result = await fetchBrandColors('https://example.com/brand');
    expect(result).toContain('frequency ranking');
  });

  it('returns formatted error string (not a throw) when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const result = await fetchBrandColors('https://unreachable.example.com/brand');
    expect(result).toContain('Brand URL Unreachable');
    expect(result).toContain('Connection refused');
  });

  it('fetches linked stylesheets — verifies second fetch called for <link> href', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '<html><link rel="stylesheet" href="/style.css"></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '--color-primary: #0033A0;',
      });
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchBrandColors('https://example.com/brand');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/style.css',
      expect.anything(),
    );
    expect(result).toContain('#0033A0');
  });

  it('caps at MAX_STYLESHEETS — 6 <link> tags results in only 5 stylesheet fetches', async () => {
    const links = Array.from(
      { length: 6 },
      (_, i) => `<link rel="stylesheet" href="/style${i}.css">`,
    ).join('\n');
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html>${links}</html>`,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchBrandColors('https://example.com/brand');
    // 1 page + 5 stylesheets = 6 total (not 7)
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
