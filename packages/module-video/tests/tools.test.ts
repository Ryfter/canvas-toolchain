import { describe, it, expect } from 'vitest';
import { videoTools } from '../src/tools.js';

describe('videoTools', () => {
  it('exposes provider-agnostic names plus deprecated aliases', () => {
    const names = videoTools.map((t) => t.schema.name);
    expect(names).toContain('video_search');
    expect(names).toContain('video_embed');
    expect(names).toContain('video_fetch_captions');
    expect(names).toContain('setup_panopto');
    expect(names).toContain('setup_panopto_vocab');
    expect(names).toContain('search_panopto_videos');
    expect(names).toContain('embed_panopto_video');
    expect(names).toContain('fetch_panopto_captions');
  });

  it('alias and canonical share a handler reference', () => {
    const canonical = videoTools.find((t) => t.schema.name === 'video_embed');
    const alias = videoTools.find((t) => t.schema.name === 'embed_panopto_video');
    expect(canonical?.handler).toBe(alias?.handler);
  });
});
