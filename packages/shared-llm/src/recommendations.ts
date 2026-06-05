import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface FetchRecommendedModelsInput {
  url: string;
  cachePath: string;
  fallbackPath: string;
  ttlMs: number;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export async function fetchRecommendedModels(input: FetchRecommendedModelsInput): Promise<string> {
  const { url, cachePath, fallbackPath, ttlMs, timeoutMs = DEFAULT_TIMEOUT_MS } = input;

  if (existsSync(cachePath)) {
    const mtime = statSync(cachePath).mtimeMs;
    if (Date.now() - mtime < ttlMs) {
      return readFileSync(cachePath, 'utf-8');
    }
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(tid);
    if (response.ok) {
      const text = await response.text();
      writeCache(cachePath, text);
      return text;
    }
  } catch {
    // fall through to cache / fallback
  }

  if (existsSync(cachePath)) {
    return readFileSync(cachePath, 'utf-8');
  }

  return readFileSync(fallbackPath, 'utf-8');
}

function writeCache(cachePath: string, content: string): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  const tmp = `${cachePath}.tmp`;
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, cachePath);
}
