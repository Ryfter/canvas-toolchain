import { fetchCatalog, type ModuleCatalog } from './catalog.js';
import { loadInstalledModules } from './installed.js';
import { loadPendingRequests } from './pending.js';
import { compareVersions } from '../update/check.js';

let channelNotice: string | null = null;

export function resetChannelNotices(): void {
  channelNotice = null;
}

export function getChannelNotices(): string | null {
  return channelNotice;
}

/** Best-effort, never throws. Pending-request notices work even with no catalog;
 *  update notices need the (possibly cached) catalog. */
export async function checkChannelNotices(
  opts: { fetchImpl?: typeof fetch; catalog?: ModuleCatalog } = {},
): Promise<void> {
  const parts: string[] = [];
  const installed = loadInstalledModules();

  let catalog: ModuleCatalog | null = null;
  try {
    catalog = opts.catalog ?? (await fetchCatalog({ fetchImpl: opts.fetchImpl }));
  } catch {
    catalog = null; // offline is fine; skip update notices
  }

  const pending = loadPendingRequests().modules.filter((id) => !installed.modules[id]);
  if (pending.length > 0) {
    const names = pending
      .map((id) => catalog?.modules.find((m) => m.id === id)?.name ?? id)
      .join(', ');
    parts.push(`_You requested ${names} in the installer — say "install ${pending[0]}" to proceed._`);
  }

  if (catalog) {
    for (const rec of Object.values(installed.modules)) {
      const entry = catalog.modules.find((m) => m.id === rec.id);
      if (entry && compareVersions(rec.version, entry.version) < 0) {
        parts.push(`_Module update available: ${rec.id} v${entry.version} — say "install ${rec.id}" to upgrade._`);
      }
    }
  }

  channelNotice = parts.length > 0 ? `\n\n${parts.join('\n')}` : null;
}
