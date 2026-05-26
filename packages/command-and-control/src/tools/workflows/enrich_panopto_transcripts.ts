import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  enrichVttFile,
  BUILTIN_FILLER_WORDS,
  type SessionsManifest,
} from 'canvas-design-mcp/dist/tools/panopto-enrich.js';
import { loadPanoptoConfig } from '../setup_panopto.js';
import { loadPanoptoVocab } from '../setup_panopto_vocab.js';

export interface EnrichPanoptoTranscriptsInput {
  transcriptsPath: string;
}

export interface EnrichPanoptoTranscriptsResult {
  transcriptsPath: string;
  enriched: { sessionId: string; title: string; mdPath: string }[];
  failed: { sessionId: string; title: string; reason: string }[];
  summary: { total: number; enrichedCount: number; failedCount: number };
  error?: string;
  message?: string;
  fix?: string[];
}

export async function enrichPanoptoTranscripts(
  input: EnrichPanoptoTranscriptsInput,
): Promise<EnrichPanoptoTranscriptsResult> {
  const { transcriptsPath } = input;

  const manifestPath = join(transcriptsPath, '_sessions.json');
  if (!existsSync(manifestPath)) {
    return {
      transcriptsPath,
      enriched: [],
      failed: [],
      summary: { total: 0, enrichedCount: 0, failedCount: 0 },
      error: 'MANIFEST_NOT_FOUND',
      fix: ['Run bulk_fetch_panopto_transcripts first'],
    };
  }

  let manifest: SessionsManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SessionsManifest;
  } catch {
    return {
      transcriptsPath,
      enriched: [],
      failed: [],
      summary: { total: 0, enrichedCount: 0, failedCount: 0 },
      error: 'MANIFEST_CORRUPT',
      fix: ['Re-run bulk_fetch_panopto_transcripts to regenerate _sessions.json'],
    };
  }

  let domain: string;
  try {
    const config = loadPanoptoConfig();
    domain = config.domain;
  } catch {
    return {
      transcriptsPath,
      enriched: [],
      failed: [],
      summary: { total: 0, enrichedCount: 0, failedCount: 0 },
      error: 'PANOPTO_NOT_CONFIGURED',
      fix: ['Run setup_panopto with your Panopto domain, clientId, and clientSecret.'],
    };
  }

  let vocab: { fillerWords: string[]; corrections: { from: string; to: string }[] };
  try {
    vocab = loadPanoptoVocab();
  } catch (err: any) {
    return {
      transcriptsPath,
      enriched: [],
      failed: [],
      summary: { total: 0, enrichedCount: 0, failedCount: 0 },
      error: err.error ?? 'VOCAB_CORRUPT',
      fix: err.fix,
    };
  }

  const allFillerWords = [...BUILTIN_FILLER_WORDS, ...vocab.fillerWords];

  const result: EnrichPanoptoTranscriptsResult = {
    transcriptsPath,
    enriched: [],
    failed: [],
    summary: { total: manifest.sessions.length, enrichedCount: 0, failedCount: 0 },
  };

  for (const session of manifest.sessions) {
    const vttPath = join(transcriptsPath, session.filename);

    if (!existsSync(vttPath)) {
      result.failed.push({ sessionId: session.sessionId, title: session.title, reason: 'VTT file not found' });
      continue;
    }

    try {
      const markdown = enrichVttFile(vttPath, session, {
        fillerWords: allFillerWords,
        corrections: vocab.corrections,
        domain,
      });
      const mdPath = join(transcriptsPath, session.filename.replace(/\.panopto\.vtt$/, '.enriched.md'));
      writeFileSync(mdPath, markdown, 'utf-8');
      result.enriched.push({ sessionId: session.sessionId, title: session.title, mdPath });
    } catch (err) {
      result.failed.push({
        sessionId: session.sessionId,
        title: session.title,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  result.summary.enrichedCount = result.enriched.length;
  result.summary.failedCount = result.failed.length;

  return result;
}
