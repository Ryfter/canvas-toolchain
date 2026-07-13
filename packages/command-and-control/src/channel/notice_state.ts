import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

/** What the discovery notice last told the professor about. Persisted so a
 *  professor who doesn't want the other modules isn't asked every session — a
 *  notice channel people learn to ignore is worse than no channel at all. */
export interface NoticeState {
  lastDiscoveryIds: string[];
}

export function noticeStatePath(): string {
  return join(getCcHomePath(), 'channel-notice-state.json');
}

export function loadNoticeState(path: string = noticeStatePath()): NoticeState {
  if (!existsSync(path)) return { lastDiscoveryIds: [] };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<NoticeState>;
    const ids = Array.isArray(raw.lastDiscoveryIds)
      ? raw.lastDiscoveryIds.filter((id): id is string => typeof id === 'string')
      : [];
    return { lastDiscoveryIds: ids };
  } catch {
    return { lastDiscoveryIds: [] };
  }
}

/** Atomic write (tmp + rename, 0o600) — mirrors saveInstalledModules. The mkdirSync
 *  matters: this runs at startup, potentially before any other C&C write has created
 *  CC_HOME. Without it the first save fails, state never persists, and the throttled
 *  notice nags on every single startup — the exact behaviour the throttle exists to prevent. */
export function saveNoticeState(state: NoticeState, path: string = noticeStatePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
}
