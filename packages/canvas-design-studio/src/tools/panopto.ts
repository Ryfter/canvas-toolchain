import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { PanoptoConfig } from '../types.js';
import { formatError } from '../utils/errors.js';

// mkdirSync, writeFileSync, homedir, join will be used in Task 5 (fetchPanoptoCaptions)

export interface PanoptoSearchResult {
  id: string;
  title: string;
  duration: number;  // seconds
  hasCaptions: boolean;
}

export interface EmbedPanoptoResult {
  html: string;
  videoTitle: string;
  hasCaptions: boolean | null;  // null when API not configured
  captionWarning?: string;
  iframeUsed: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildEmbedUrl(domain: string, videoId: string): string {
  return `https://${domain}/Panopto/Pages/Embed.aspx?id=${encodeURIComponent(videoId)}&autoplay=false&captions=true`;
}

export function buildViewerUrl(domain: string, videoId: string): string {
  return `https://${domain}/Panopto/Pages/Viewer.aspx?id=${encodeURIComponent(videoId)}`;
}

export function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatSearchResults(results: PanoptoSearchResult[], query: string): string {
  if (results.length === 0) {
    if (query) {
      return formatError({
        title: 'Panopto — No Videos Found',
        message: `No videos matched "${query}" in your Panopto library.`,
        cause: 'The search query did not match any video titles in your library.',
        fix: [
          'Try a shorter or broader search term',
          'Call search_panopto_videos without a query to browse your full library',
          'Confirm your Panopto domain is correct (run setup_institution)',
        ],
        context: `Panopto search returned no results for query: ${query}`,
      });
    }
    return formatError({
      title: 'Panopto — Library Empty or Inaccessible',
      message: 'No videos were found in your Panopto library.',
      cause: 'Your library may be empty, or the API client may not have access to your videos.',
      fix: [
        'Confirm you have uploaded videos to your Panopto account',
        'Verify Panopto client ID and secret in setup_institution',
        'Check that the API client has the Creator role in Panopto',
      ],
      context: 'Panopto video library returned empty results',
    });
  }
  const header = query
    ? `Found ${results.length} video(s) matching "${query}":`
    : `Found ${results.length} video(s) in your library:`;
  const lines = [header, ''];
  results.forEach((v, i) => {
    const cap = v.hasCaptions ? '✓ captions' : '⚠ no captions';
    lines.push(`${i + 1}. ${v.title}  [${formatDuration(v.duration)}]  ${cap}`);
    lines.push(`   ID: ${v.id}`);
    lines.push('');
  });
  lines.push('Use embed_panopto_video with the ID of the video you want to embed.');
  return lines.join('\n');
}

export function buildEmbedHtml(
  config: PanoptoConfig,
  videoId: string,
  title: string,
  placement: 'inline' | 'full-page',
): string {
  const embedUrl = buildEmbedUrl(config.domain, videoId);
  const viewerUrl = buildViewerUrl(config.domain, videoId);

  let embed: string;
  if (config.iframeWhitelisted === true) {
    embed = [
      `<iframe`,
      `  src="${embedUrl}"`,
      `  width="720"`,
      `  height="405"`,
      `  allowfullscreen`,
      `  aria-label="${escapeHtml(title)}"`,
      `  style="max-width:100%;border:0;display:block;">`,
      `</iframe>`,
    ].join('\n');
  } else {
    embed = [
      `<a href="${viewerUrl}"`,
      `   target="_blank"`,
      `   style="display:inline-block;padding:12px 20px;background:#0033A0;color:#ffffff;`,
      `          border-radius:8px;font-family:Lato,sans-serif;font-size:15px;text-decoration:none;">`,
      `  ▶ Watch: ${escapeHtml(title)}`,
      `</a>`,
    ].join('\n');
  }

  if (placement === 'full-page') {
    return `<div style="max-width:720px;margin:0 auto;">\n  ${embed}\n</div>`;
  }
  return embed;
}

export function parseVttToText(vtt: string): string {
  const timestampRe = /^(\d+:)?\d+:\d+\.\d+ --> (\d+:)?\d+:\d+\.\d+/;
  const cueIdRe = /^\d+$/;
  const textLines: string[] = [];
  for (const line of vtt.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'WEBVTT' || timestampRe.test(trimmed)) continue;
    if (trimmed.startsWith('NOTE') || trimmed.startsWith('STYLE') || trimmed.startsWith('REGION')) continue;
    if (cueIdRe.test(trimmed)) continue;
    textLines.push(trimmed);
  }
  return textLines.join(' ');
}

export function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getPanoptoToken(config: PanoptoConfig): Promise<string> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('getPanoptoToken: clientId and clientSecret are required');
  }
  const url = `https://${config.domain}/Panopto/oauth2/connect/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'api',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Panopto OAuth2 failed: ${res.status}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function searchPanoptoVideos(
  input: { query?: string; limit?: number },
  config: PanoptoConfig,
): Promise<string> {
  if (!config.clientId || !config.clientSecret) {
    return 'API_NOT_CONFIGURED: Panopto API credentials are not set. Run setup_institution to add your Panopto clientId and clientSecret.';
  }

  const token = await getPanoptoToken(config);
  const hardLimit = Math.min(input.limit ?? 500, 500);
  const results: PanoptoSearchResult[] = [];
  let pageNumber = 0;

  while (results.length < hardLimit) {
    const params = new URLSearchParams({ maxResults: '100', pageNumber: String(pageNumber) });
    if (input.query) params.set('searchQuery', input.query);

    const res = await fetch(
      `https://${config.domain}/Panopto/api/v1/sessions/search?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Panopto search failed: ${res.status}`);

    const data = await res.json() as {
      Results: Array<{ Id: string; Name: string; Duration: number; HasCaptions: boolean }>;
      TotalNumberOfResults: number;
    };

    for (const v of data.Results) {
      if (results.length >= hardLimit) break;
      results.push({ id: v.Id, title: v.Name, duration: Math.round(v.Duration), hasCaptions: v.HasCaptions });
    }

    if (data.Results.length < 100 || results.length >= data.TotalNumberOfResults) break;
    pageNumber++;
  }

  return formatSearchResults(results, input.query ?? '');
}

export async function fetchPanoptoCaptions(
  input: { videoId: string; title?: string },
  config: PanoptoConfig,
): Promise<string> {
  if (!config.clientId || !config.clientSecret) {
    return 'API_NOT_CONFIGURED: Panopto API credentials are not set. Run setup_institution to add your Panopto clientId and clientSecret.';
  }

  const token = await getPanoptoToken(config);

  const listRes = await fetch(
    `https://${config.domain}/Panopto/api/v1/sessions/${input.videoId}/captions`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) throw new Error(`Panopto captions list failed: ${listRes.status}`);

  const captionsList = await listRes.json() as Array<{ Language: string; FileUrl: string; IsDefault: boolean }>;
  if (captionsList.length === 0) {
    return `No captions available for video ${input.videoId}.`;
  }

  const caption = captionsList.find(c => c.IsDefault) ?? captionsList[0];

  const vttRes = await fetch(caption.FileUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!vttRes.ok) throw new Error(`Panopto VTT download failed: ${vttRes.status}`);

  const vtt = await vttRes.text();
  const transcript = parseVttToText(vtt);

  const title = input.title ?? input.videoId;
  const filename = `${sanitizeFilename(title)}-${sanitizeFilename(input.videoId)}.md`;
  const transcriptDir = join(homedir(), '.canvas-design-mcp', 'transcripts');
  const filePath = join(transcriptDir, filename);

  mkdirSync(transcriptDir, { recursive: true });
  writeFileSync(filePath, `# ${title}\n**Video ID:** ${input.videoId}\n\n---\n\n${transcript}\n`, 'utf-8');

  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  return `✓ Transcript saved to ${filePath}\n  ${wordCount} words extracted\n\nFirst 200 characters:\n${transcript.slice(0, 200)}...`;
}

export async function embedPanoptoVideo(
  input: { videoId: string; placement: 'inline' | 'full-page'; title?: string },
  config: PanoptoConfig,
): Promise<EmbedPanoptoResult> {
  let title = input.title ?? 'Video';
  let hasCaptions: boolean | null = null;

  if (config.clientId && config.clientSecret) {
    const token = await getPanoptoToken(config);
    const res = await fetch(
      `https://${config.domain}/Panopto/api/v1/sessions/${input.videoId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const data = await res.json() as { Name: string; HasCaptions: boolean };
      title = data.Name;
      hasCaptions = data.HasCaptions;
    }
  }

  const html = buildEmbedHtml(config, input.videoId, title, input.placement);
  const iframeUsed = config.iframeWhitelisted === true;
  const result: EmbedPanoptoResult = { html, videoTitle: title, hasCaptions, iframeUsed };

  if (hasCaptions === false) {
    result.captionWarning = 'This video has no captions. Consider adding captions in Panopto before embedding.';
  }
  return result;
}

export interface PanoptoFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  sessionCount: number;
}

export interface PanoptoSession {
  id: string;
  title: string;
  startTime: string;        // ISO
  duration: number;         // seconds
  hasCaptions: boolean;
}

export interface BulkDownloadResult {
  folderId: string;
  outputDir: string;
  downloaded: { sessionId: string; title: string; path: string; startTime: string; duration: number }[];
  failed: { sessionId: string; title: string; reason: string }[];
  skippedNoCaptions: { sessionId: string; title: string }[];
}

export type ProgressCallback = (event: {
  type: 'session-start' | 'session-complete' | 'session-failed';
  sessionId: string;
  title: string;
  index: number;
  total: number;
  reason?: string;
}) => void;

export async function listPanoptoFolders(
  input: { query?: string; parentFolderId?: string },
  config: PanoptoConfig,
): Promise<PanoptoFolder[]> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('API_NOT_CONFIGURED: Panopto API credentials are not set.');
  }

  const token = await getPanoptoToken(config);
  const params = new URLSearchParams({ maxResults: '100', pageNumber: '0' });
  if (input.query) params.set('searchQuery', input.query);
  if (input.parentFolderId) params.set('parentFolderId', input.parentFolderId);

  const res = await fetch(
    `https://${config.domain}/Panopto/api/v1/folders?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Panopto list folders failed: ${res.status}`);

  const data = await res.json() as {
    Results: Array<{
      Id: string;
      Name: string;
      ParentFolder?: string | { Id: string } | null;
      ParentFolderId?: string | null;
      SessionCount?: number;
    }>;
  };

  return (data.Results || []).map(v => {
    let parentFolderId: string | null = null;
    if (v.ParentFolder) {
      if (typeof v.ParentFolder === 'object') {
        parentFolderId = v.ParentFolder.Id || null;
      } else {
        parentFolderId = v.ParentFolder;
      }
    } else if (v.ParentFolderId) {
      parentFolderId = v.ParentFolderId;
    }
    return {
      id: v.Id,
      name: v.Name,
      parentFolderId,
      sessionCount: v.SessionCount ?? 0,
    };
  });
}

export async function listSessionsInFolder(
  folderId: string,
  config: PanoptoConfig,
): Promise<PanoptoSession[]> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('API_NOT_CONFIGURED: Panopto API credentials are not set.');
  }

  const token = await getPanoptoToken(config);
  const results: PanoptoSession[] = [];
  let pageNumber = 0;

  while (true) {
    const params = new URLSearchParams({ maxResults: '100', pageNumber: String(pageNumber) });
    const res = await fetch(
      `https://${config.domain}/Panopto/api/v1/folders/${encodeURIComponent(folderId)}/sessions?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Panopto list sessions in folder failed: ${res.status}`);

    const data = await res.json() as {
      Results: Array<{
        Id: string;
        Name: string;
        StartTime?: string;
        Duration?: number;
        HasCaptions?: boolean;
      }>;
      TotalNumberOfResults?: number;
    };

    if (!data.Results || data.Results.length === 0) break;

    for (const v of data.Results) {
      results.push({
        id: v.Id,
        title: v.Name,
        startTime: v.StartTime ?? new Date().toISOString(),
        duration: Math.round(v.Duration ?? 0),
        hasCaptions: v.HasCaptions ?? false,
      });
    }

    if (data.Results.length < 100 || (data.TotalNumberOfResults !== undefined && results.length >= data.TotalNumberOfResults)) {
      break;
    }
    pageNumber++;
  }

  return results;
}

export async function bulkDownloadPanoptoCaptions(
  input: { folderId: string; outputDir: string },
  config: PanoptoConfig,
  onProgress?: ProgressCallback,
): Promise<BulkDownloadResult> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('API_NOT_CONFIGURED: Panopto API credentials are not set.');
  }

  const sessions = await listSessionsInFolder(input.folderId, config);
  const token = await getPanoptoToken(config);
  
  const result: BulkDownloadResult = {
    folderId: input.folderId,
    outputDir: input.outputDir,
    downloaded: [],
    failed: [],
    skippedNoCaptions: [],
  };

  if (sessions.length === 0) {
    return result;
  }

  mkdirSync(input.outputDir, { recursive: true });

  const total = sessions.length;
  for (let index = 0; index < total; index++) {
    const session = sessions[index];
    if (!session.hasCaptions) {
      result.skippedNoCaptions.push({ sessionId: session.id, title: session.title });
      continue;
    }

    onProgress?.({
      type: 'session-start',
      sessionId: session.id,
      title: session.title,
      index,
      total,
    });

    try {
      const listRes = await fetch(
        `https://${config.domain}/Panopto/api/v1/sessions/${session.id}/captions`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!listRes.ok) {
        throw new Error(`Panopto captions list failed with status ${listRes.status}`);
      }

      const captionsList = await listRes.json() as Array<{ Language: string; FileUrl: string; IsDefault: boolean }>;
      if (captionsList.length === 0) {
        throw new Error('No captions available returned from API captions list');
      }

      const caption = captionsList.find(c => c.IsDefault) ?? captionsList[0];
      const vttRes = await fetch(caption.FileUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!vttRes.ok) {
        throw new Error(`Panopto VTT download failed with status ${vttRes.status}`);
      }

      const vtt = await vttRes.text();
      
      const datePrefix = session.startTime.slice(0, 10); // "YYYY-MM-DD"
      const filename = `${datePrefix}_${sanitizeFilename(session.title)}.panopto.vtt`;
      const filePath = join(input.outputDir, filename);
      writeFileSync(filePath, vtt, 'utf-8');

      result.downloaded.push({
        sessionId: session.id,
        title: session.title,
        path: filePath,
        startTime: session.startTime,
        duration: session.duration,
      });

      onProgress?.({
        type: 'session-complete',
        sessionId: session.id,
        title: session.title,
        index,
        total,
      });
    } catch (err: any) {
      const reason = err instanceof Error ? err.message : String(err);
      result.failed.push({
        sessionId: session.id,
        title: session.title,
        reason,
      });

      onProgress?.({
        type: 'session-failed',
        sessionId: session.id,
        title: session.title,
        index,
        total,
        reason,
      });
    }
  }

  const manifest = {
    domain: config.domain,
    generatedAt: new Date().toISOString(),
    sessions: result.downloaded.map((d) => ({
      sessionId: d.sessionId,
      title: d.title,
      startTime: d.startTime,
      duration: d.duration,
      filename: basename(d.path),
    })),
  };
  writeFileSync(join(input.outputDir, '_sessions.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  return result;
}
