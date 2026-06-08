import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { PanoptoProvider } from '../src/panopto/provider.js';
import type { PanoptoConfig } from '../src/types.js';

const cfg: PanoptoConfig = { domain: 'x.panopto.com', iframeWhitelisted: true, clientId: 'a', clientSecret: 'b' };

describe('PanoptoProvider', () => {
  it('declares its capabilities', () => {
    const p = new PanoptoProvider(cfg);
    expect(p.id).toBe('panopto');
    expect(p.name).toBe('Panopto');
    expect(p.capabilities).toEqual({ search: true, embed: true, fetchCaptions: true });
  });

  describe('embed()', () => {
    beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('returns html string', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'test-token' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ Name: 'Test Video', HasCaptions: true }),
        } as Response);

      const p = new PanoptoProvider(cfg);
      const html = await p.embed('vid-1', {});
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });
  });
});
