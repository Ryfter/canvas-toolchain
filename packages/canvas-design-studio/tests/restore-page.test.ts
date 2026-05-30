import { describe, it, expect, vi } from 'vitest';
import { restorePage } from '../src/tools/restore-page.js';

describe('restorePage', () => {
  it('calls updatePage with priorHtml when prior was non-null', async () => {
    const api = { updatePage: vi.fn().mockResolvedValue({ url: 'a' }), deletePage: vi.fn() };
    await restorePage(10, 'a', '<p>old</p>', api as any);
    expect(api.updatePage).toHaveBeenCalledWith(10, 'a', '<p>old</p>');
    expect(api.deletePage).not.toHaveBeenCalled();
  });

  it('calls deletePage when priorHtml is null (page was newly created)', async () => {
    const api = { updatePage: vi.fn(), deletePage: vi.fn().mockResolvedValue(undefined) };
    await restorePage(10, 'a', null, api as any);
    expect(api.deletePage).toHaveBeenCalledWith(10, 'a');
    expect(api.updatePage).not.toHaveBeenCalled();
  });
});
