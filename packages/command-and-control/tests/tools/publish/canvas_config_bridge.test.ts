import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/tools/setup_canvas.js', () => ({
  loadCanvasConfig: vi.fn(),
}));

import { loadCanvasConfig } from '../../../src/tools/setup_canvas.js';
import { loadInstitutionConfig } from '../../../src/tools/publish/canvas_config_bridge.js';

describe('loadInstitutionConfig', () => {
  it('translates CanvasSetupConfig to InstitutionConfig', () => {
    vi.mocked(loadCanvasConfig).mockReturnValue({
      host: 'bsu.instructure.com', token: 'abc',
      configuredAt: '2026-05-26T00:00:00Z', lastValidatedAt: '2026-05-26T00:00:00Z',
    });
    const cfg = loadInstitutionConfig();
    expect(cfg).toEqual({ canvasUrl: 'https://bsu.instructure.com', apiToken: 'abc' });
  });

  it('throws CANVAS_NOT_CONFIGURED when underlying load throws', () => {
    vi.mocked(loadCanvasConfig).mockImplementation(() => { throw new Error('CANVAS_NOT_CONFIGURED'); });
    expect(() => loadInstitutionConfig()).toThrow(/CANVAS_NOT_CONFIGURED/);
  });
});
