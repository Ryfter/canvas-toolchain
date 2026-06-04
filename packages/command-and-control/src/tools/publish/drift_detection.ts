import { createHash } from 'node:crypto';

/** SHA-256 hex digest. Used throughout V&R for content fingerprinting —
 *  pages, widgets, and rollback drift checks all hash through this helper. */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface DetectPageDriftInput {
  currentCanvasHtml: string;
  expectedHash: string | null;
}

export interface PageDriftResult {
  drifted: boolean;
  expectedHash: string | null;
  actualHash: string;
}

/** Compare a current Canvas page body against a recorded baseline hash. When
 *  the baseline is null (older snapshot with no recorded hash), returns
 *  drifted=false so the rollback proceeds without false positives. */
export function detectPageDrift(input: DetectPageDriftInput): PageDriftResult {
  const actualHash = hashContent(input.currentCanvasHtml);
  if (input.expectedHash === null) {
    return { drifted: false, expectedHash: null, actualHash };
  }
  return {
    drifted: input.expectedHash !== actualHash,
    expectedHash: input.expectedHash,
    actualHash,
  };
}
