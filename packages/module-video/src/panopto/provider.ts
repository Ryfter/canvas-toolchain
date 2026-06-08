import type { VideoProvider, VideoResult, EmbedOptions } from '../provider.js';
import type { PanoptoConfig } from '../types.js';
import {
  searchPanoptoVideos,
  embedPanoptoVideo,
  fetchPanoptoCaptions,
} from './client.js';

/** Panopto implementation of the VideoProvider contract. */
export class PanoptoProvider implements VideoProvider {
  readonly id = 'panopto';
  readonly name = 'Panopto';
  readonly capabilities = { search: true, embed: true, fetchCaptions: true };

  constructor(private readonly config: PanoptoConfig) {}

  async search(query: string): Promise<VideoResult[]> {
    // The MCP tool layer (tools.ts) calls searchPanoptoVideos directly to keep the
    // exact current formatted-string output. This structured method exists only so
    // future providers can return real VideoResult[]. Minimal placeholder for now
    // (YAGNI until a second provider needs structured search).
    const formatted = await searchPanoptoVideos({ query }, this.config);
    return [{ id: '', title: formatted, url: '' }];
  }

  async embed(ref: string, opts?: EmbedOptions): Promise<string> {
    const placement = opts?.width && opts.width >= 720 ? 'full-page' : 'inline';
    const res = await embedPanoptoVideo({ videoId: ref, placement }, this.config);
    return res.html;
  }

  async fetchCaptions(ref: string): Promise<string> {
    return fetchPanoptoCaptions({ videoId: ref }, this.config);
  }
}
