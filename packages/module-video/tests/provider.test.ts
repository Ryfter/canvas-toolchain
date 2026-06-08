import { describe, it, expectTypeOf } from 'vitest';
import type { VideoProvider, VideoResult, EmbedOptions } from '../src/provider.js';

describe('VideoProvider type', () => {
  it('shapes a provider', () => {
    const p: VideoProvider = {
      id: 'fake',
      name: 'Fake',
      capabilities: { search: false, embed: true, fetchCaptions: false },
      async embed() { return '<iframe></iframe>'; },
    };
    expectTypeOf(p.capabilities.embed).toEqualTypeOf<boolean>();
    expectTypeOf<VideoResult>().toHaveProperty('id');
    expectTypeOf<EmbedOptions>().toHaveProperty('startSeconds');
  });
});
