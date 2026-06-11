import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { loadPanoptoConfig, setupPanopto } from './panopto/setup.js';
import { setupPanoptoVocab } from './panopto/vocab.js';
import {
  searchPanoptoVideos,
  embedPanoptoVideo,
  fetchPanoptoCaptions,
} from './panopto/client.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });

const videoSearch: ModuleTool = {
  schema: {
    name: 'video_search',
    description:
      'Search or browse your lecture video library (active provider, default Panopto). Omit the query to list all videos. Returns video IDs, titles, durations, and captions status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search terms. Omit to list all videos.' },
        limit: { type: 'number', description: 'Maximum results (capped at 500).' },
      },
    },
  },
  handler: async (args) => {
    const input = args as { query?: string; limit?: number };
    return text(await searchPanoptoVideos(input, loadPanoptoConfig()));
  },
};

const videoEmbed: ModuleTool = {
  schema: {
    name: 'video_embed',
    description:
      'Generate Canvas-safe HTML to embed a lecture video (active provider, default Panopto). Works without API credentials (provide video ID and title). iframe when whitelisted, accessible fallback link otherwise.',
    inputSchema: {
      type: 'object' as const,
      required: ['videoId', 'placement'],
      properties: {
        videoId: { type: 'string', description: 'Provider video ID (UUID or URL id).' },
        placement: { type: 'string', enum: ['inline', 'full-page'], description: 'inline or centered full-page.' },
        title: { type: 'string', description: 'Accessibility label; fetched automatically when API configured.' },
      },
    },
  },
  handler: async (args) => {
    const input = args as { videoId: string; placement: 'inline' | 'full-page'; title?: string };
    const res = await embedPanoptoVideo(input, loadPanoptoConfig());
    return text(res.html);
  },
};

const videoFetchCaptions: ModuleTool = {
  schema: {
    name: 'video_fetch_captions',
    description:
      'Download captions for a lecture video, strip timestamps, and save the plain-text transcript. Requires provider API credentials.',
    inputSchema: {
      type: 'object' as const,
      required: ['videoId'],
      properties: {
        videoId: { type: 'string', description: 'Provider video ID.' },
        title: { type: 'string', description: 'Title used for the saved filename.' },
      },
    },
  },
  handler: async (args) => {
    const input = args as { videoId: string; title?: string };
    return text(await fetchPanoptoCaptions(input, loadPanoptoConfig()));
  },
};

const setupPanoptoTool: ModuleTool = {
  schema: {
    name: 'setup_panopto',
    description:
      'Configure Panopto integration: domain, clientId, clientSecret. Validates credentials before saving.',
    inputSchema: {
      type: 'object' as const,
      required: ['domain', 'clientId', 'clientSecret'],
      properties: {
        domain: { type: 'string', description: 'Panopto hostname, e.g. "example.hosted.panopto.com".' },
        clientId: { type: 'string', description: 'OAuth2 client ID.' },
        clientSecret: { type: 'string', description: 'OAuth2 client secret. Stored locally, never echoed.' },
        iframeWhitelisted: { type: 'boolean', description: 'Whether Canvas allows Panopto iframes. Null = unknown.', nullable: true },
        test: { type: 'boolean', description: 'Validate before saving (default true).' },
      },
    },
  },
  handler: async (args) => {
    const res = await setupPanopto(args as Parameters<typeof setupPanopto>[0]);
    return text(JSON.stringify(res, null, 2));
  },
};

const setupPanoptoVocabTool: ModuleTool = {
  schema: {
    name: 'setup_panopto_vocab',
    description:
      'Manage professor vocabulary corrections and filler words for transcript enrichment.',
    inputSchema: {
      type: 'object' as const,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['add-correction', 'add-filler', 'remove-correction', 'list'] },
        from: { type: 'string', description: 'Source word/phrase (add/remove-correction).' },
        to: { type: 'string', description: 'Replacement (add-correction).' },
        word: { type: 'string', description: 'Filler word (add-filler).' },
      },
    },
  },
  handler: async (args) => {
    const res = setupPanoptoVocab(args as Parameters<typeof setupPanoptoVocab>[0]);
    return text(JSON.stringify(res, null, 2));
  },
};

/** Deprecated alias: same handler, old name, with a deprecation note appended to the description. */
function alias(tool: ModuleTool, oldName: string): ModuleTool {
  return {
    schema: { ...tool.schema, name: oldName, description: `[deprecated: use ${tool.schema.name}] ${tool.schema.description ?? ''}` },
    handler: tool.handler,
  };
}

export const videoTools: ModuleTool[] = [
  videoSearch,
  videoEmbed,
  videoFetchCaptions,
  setupPanoptoTool,
  setupPanoptoVocabTool,
  alias(videoSearch, 'search_panopto_videos'),
  alias(videoEmbed, 'embed_panopto_video'),
  alias(videoFetchCaptions, 'fetch_panopto_captions'),
];
