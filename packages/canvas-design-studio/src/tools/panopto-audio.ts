import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PanoptoConfig } from '../types.js';
import { getPanoptoToken, buildViewerUrl } from './panopto.js';
import type { SessionManifestEntry } from './panopto-enrich.js';

// VERIFY against a live Panopto before relying on auto-fetch (spec Open Question #1).
const DOWNLOAD_URL = (domain: string, sessionId: string) =>
  `https://${domain}/Panopto/Podcast/Download/${sessionId}.mp4?mediaTargetType=audioPodcast`;

const MANUAL_EXTS = ['mp3', 'm4a', 'mp4', 'wav'];

export type AudioMode = 'auto' | 'manual';

export interface AudioFetchResult {
  ok: boolean;
  path?: string;
  source?: 'panopto' | 'manual';
  reason?: 'DOWNLOAD_DISABLED' | 'NOT_FOUND' | 'NETWORK' | 'MANUAL_MISSING';
  viewerUrl?: string;
  manualInstructions?: string[];
}

function stem(filename: string): string {
  return filename.replace(/\.panopto\.vtt$/, '');
}

function findManual(dir: string, fileStem: string): string | null {
  for (const ext of MANUAL_EXTS) {
    const candidate = join(dir, `${fileStem}.${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function guidedInstructions(
  config: PanoptoConfig,
  session: SessionManifestEntry,
  destDir: string,
  fileStem: string,
): { viewerUrl: string; manualInstructions: string[] } {
  const viewerUrl = buildViewerUrl(config.domain, session.sessionId);
  return {
    viewerUrl,
    manualInstructions: [
      `1. Open the recording: ${viewerUrl}`,
      `2. Click the settings/⋯ menu → "Download" (or the download icon below the player).`,
      `   If there is no Download option, your Panopto admin has downloads disabled —`,
      `   ask them to enable "Make available for download" for this folder.`,
      `3. Save the file and rename it to exactly: ${fileStem}.mp3  (.m4a/.mp4/.wav also accepted)`,
      `4. Place it in: ${destDir}`,
      `5. Re-run compare_transcripts.`,
    ],
  };
}

export async function fetchSessionAudio(
  session: SessionManifestEntry,
  config: PanoptoConfig,
  destDir: string,
  mode: AudioMode = 'auto',
): Promise<AudioFetchResult> {
  const fileStem = stem(session.filename);

  // 1. Best-effort Panopto download (skipped in manual mode).
  if (mode === 'auto') {
    try {
      const token = await getPanoptoToken(config);
      const res = await fetch(DOWNLOAD_URL(config.domain, session.sessionId), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const outPath = join(destDir, `${fileStem}.audio.mp4`);
        writeFileSync(outPath, buf);
        return { ok: true, path: outPath, source: 'panopto' };
      }
      // fall through to manual on 403/404/etc.
    } catch {
      // network/token error → fall through to manual
    }
  }

  // 2. Manual file already present.
  const manual = findManual(destDir, fileStem);
  if (manual) return { ok: true, path: manual, source: 'manual' };

  // 3. Guided web-interface download instructions.
  return { ok: false, reason: 'MANUAL_MISSING', ...guidedInstructions(config, session, destDir, fileStem) };
}
