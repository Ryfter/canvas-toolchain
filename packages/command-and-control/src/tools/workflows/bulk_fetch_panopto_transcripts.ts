import { bulkDownloadPanoptoCaptions, loadPanoptoConfig, type ProgressCallback } from '@canvas-toolchain/module-video';
import { ingestTranscripts } from '@canvas-toolchain/curriculum-intelligence/dist/tools/ingest_transcripts.js';
import type { IngestTranscriptsResult } from '@canvas-toolchain/curriculum-intelligence/dist/tools/ingest_transcripts.js';

export interface BulkFetchPanoptoTranscriptsInput {
  folderId: string;
  outputPath: string;
  courseId?: string;
  semesterId?: string;
  /** Passed through to ingestTranscripts. Default: false. */
  copy?: boolean;
}

export interface BulkFetchPanoptoTranscriptsResult {
  folderId: string;
  outputPath: string;
  downloaded: { sessionId: string; title: string; path: string }[];
  skippedNoCaptions: { sessionId: string; title: string }[];
  failed: { sessionId: string; title: string; reason: string }[];
  summary: {
    total: number;
    downloadedCount: number;
    skippedCount: number;
    failedCount: number;
  };
  ingestResult?: IngestTranscriptsResult;
  error?: string;
  message?: string;
  fix?: string[];
}

export type { ProgressCallback };

export async function bulkFetchPanoptoTranscripts(
  input: BulkFetchPanoptoTranscriptsInput,
  onProgress?: ProgressCallback,
): Promise<BulkFetchPanoptoTranscriptsResult> {
  const { folderId, outputPath, courseId, semesterId, copy = false } = input;

  let panoptoConfig;
  try {
    panoptoConfig = loadPanoptoConfig();
  } catch (err) {
    return {
      folderId,
      outputPath,
      downloaded: [],
      skippedNoCaptions: [],
      failed: [],
      summary: { total: 0, downloadedCount: 0, skippedCount: 0, failedCount: 0 },
      error: 'PANOPTO_NOT_CONFIGURED',
      message: err instanceof Error ? err.message : String(err),
      fix: ['Run setup_panopto with your Panopto domain, clientId, and clientSecret.'],
    };
  }

  let downloadResult;
  try {
    downloadResult = await bulkDownloadPanoptoCaptions(
      { folderId, outputDir: outputPath },
      panoptoConfig,
      onProgress,
    );
  } catch (err) {
    return {
      folderId,
      outputPath,
      downloaded: [],
      skippedNoCaptions: [],
      failed: [],
      summary: { total: 0, downloadedCount: 0, skippedCount: 0, failedCount: 0 },
      error: 'DOWNLOAD_FAILED',
      message: err instanceof Error ? err.message : String(err),
      fix: ['Re-run setup_panopto with test:true to re-validate credentials.'],
    };
  }

  const total =
    downloadResult.downloaded.length +
    downloadResult.skippedNoCaptions.length +
    downloadResult.failed.length;

  const result: BulkFetchPanoptoTranscriptsResult = {
    folderId,
    outputPath,
    downloaded: downloadResult.downloaded,
    skippedNoCaptions: downloadResult.skippedNoCaptions,
    failed: downloadResult.failed,
    summary: {
      total,
      downloadedCount: downloadResult.downloaded.length,
      skippedCount: downloadResult.skippedNoCaptions.length,
      failedCount: downloadResult.failed.length,
    },
  };

  if (courseId && semesterId) {
    result.ingestResult = ingestTranscripts({
      courseId,
      semesterId,
      transcriptsPath: outputPath,
      source: 'panopto',
      copy,
    });
  }

  return result;
}
