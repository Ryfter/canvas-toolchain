import { loadVault } from './vault/store.js';
import type { CanvasUser } from './types.js';

export type ResolveStatus = 'ok' | 'unknown_pseudonym' | 'not_in_canvas';

export interface ResolvedIdentity {
  pseudonym: string;
  canvasId?: string;
  name?: string;
  email?: string;
  status: ResolveStatus;
}

/** A function that fetches one Canvas user by id, or null if not found. */
export type CanvasUserFetcher = (canvasId: string) => Promise<CanvasUser | null>;

/**
 * Reverse-lookup: pseudonym -> vault -> canvas id -> live Canvas user. Caches nothing.
 * `fetchUser` is injected (production wraps the Canvas client; tests inject a fake).
 */
export async function resolveIdentity(
  pseudonyms: string[], fetchUser: CanvasUserFetcher,
): Promise<ResolvedIdentity[]> {
  const vault = loadVault();
  const byPseudonym = new Map(vault.map((r) => [r.pseudonym, r]));
  const out: ResolvedIdentity[] = [];
  for (const p of pseudonyms) {
    const rec = byPseudonym.get(p);
    if (!rec) { out.push({ pseudonym: p, status: 'unknown_pseudonym' }); continue; }
    const user = await fetchUser(rec.canvasId);
    if (!user) { out.push({ pseudonym: p, canvasId: rec.canvasId, status: 'not_in_canvas' }); continue; }
    out.push({ pseudonym: p, canvasId: rec.canvasId, name: user.name, email: user.email, status: 'ok' });
  }
  return out;
}
