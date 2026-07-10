import { describe, it, expect, vi } from 'vitest';
import { waveDeepCheckTool } from '../src/tools/wave_deep_check.js';

const FINDINGS_RESULT = {
  url: 'https://www.example.edu/open/', creditsRemaining: 42,
  findings: [{ sc: '1.1.1', scName: 'Non-text Content', scVersion: '2.0', level: 'AA', severity: 'critical', engine: 'wave', message: 'Missing alternative text (1 instance, WAVE error)' }],
  unmapped: [{ id: 'new_rule', description: 'Novel WAVE rule', count: 2, category: 'alert' }],
};

describe('wave_deep_check tool', () => {
  it('previews without spending when confirm is absent', async () => {
    const wave = vi.fn();
    const r = await waveDeepCheckTool({ url: 'https://www.example.edu/open/' }, { wave, loadKey: () => 'k' });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/2 credit/i);
    expect(r.text).toMatch(/confirm: ?true/);
    expect(r.text).toMatch(/public/i);
    expect(wave).not.toHaveBeenCalled();
  });

  it('errors with the WAVE signup fix when no key is available', async () => {
    const r = await waveDeepCheckTool({ url: 'https://x.example.edu/', confirm: true }, { wave: vi.fn(), loadKey: () => undefined });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('NO_WAVE_API_KEY');
    expect(r.fix!.join(' ')).toContain('wave.webaim.org/api');
  });

  it('persists a supplied key and runs the adapter on confirm', async () => {
    const wave = vi.fn().mockResolvedValue(FINDINGS_RESULT);
    const saveKey = vi.fn();
    const r = await waveDeepCheckTool(
      { url: 'https://www.example.edu/open/', confirm: true, apiKey: 'fresh-key' },
      { wave, loadKey: () => undefined, saveKey },
    );
    expect(saveKey).toHaveBeenCalledWith('fresh-key');
    expect(wave).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://www.example.edu/open/', apiKey: 'fresh-key' }));
    expect(r.ok).toBe(true);
    expect(r.text).toContain('1.1.1');
    expect(r.text).toContain('Novel WAVE rule');
    expect(r.text).toContain('42');
  });

  it('passes adapter refusals through unchanged', async () => {
    const wave = vi.fn().mockResolvedValue({ url: 'x', findings: [], unmapped: [], error: 'AUTH_GATED_URL', message: 'login required', fix: ['use the browser extension'] });
    const r = await waveDeepCheckTool({ url: 'https://example.instructure.com/courses/1', confirm: true }, { wave, loadKey: () => 'k' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('AUTH_GATED_URL');
  });
});
