/**
 * Remap an absolute path stored inside a config file (#200, spec Q7, option A).
 *
 * Some config files record absolute paths, for example Curriculum
 * Intelligence's `courseRoot`, which defaulted to
 * `~/.curriculum-intelligence/courses`. After the Windows migration renames the
 * legacy folder to `.migrated-<stamp>`, that stored path no longer exists. The
 * reader passes it through here and gets the equivalent path under the new
 * root. No config file is rewritten, and the original folder is never touched.
 *
 * Pure: no filesystem access beyond the resolver's own upgrade-window probes,
 * which `PathEnv` can inject. A no-op on POSIX, under an env override, and
 * inside the upgrade window (where the legacy folder is still authoritative).
 */
import path from 'node:path';
import { appPaths, legacyAppHome, type AppId, type PathEnv } from './app-paths.js';
import { legacyEntryRoot } from './app-home-migration.js';

const MIGRATED_SUFFIX = /^\.migrated-\d{8}-\d{6}(-\d+)?$/;

function stripTrailingSeparators(p: string): string {
  // Keep a drive root such as `C:\` intact.
  return p.replace(/(?<!^[A-Za-z]:)[\\/]+$/, '');
}

export function remapLegacyPath(storedPath: string, app: AppId, o: PathEnv = {}): string {
  const platform = o.platform ?? process.platform;
  if (platform !== 'win32' || typeof storedPath !== 'string' || storedPath === '') return storedPath;

  const p = path.win32;
  if (!p.isAbsolute(storedPath)) return storedPath;

  const effective = appPaths(app, o);
  if (effective.source === 'env') return storedPath;

  const legacy = stripTrailingSeparators(p.normalize(legacyAppHome(app, o)));
  const home = p.dirname(legacy);
  const legacyName = p.basename(legacy).toLowerCase();

  const trailing = /[\\/]$/.test(storedPath);
  const stored = stripTrailingSeparators(p.normalize(storedPath));
  // Windows paths are case-insensitive; compare lowercased, slice the original.
  const prefix = `${home.toLowerCase()}\\`;
  if (!stored.toLowerCase().startsWith(prefix)) return storedPath;

  const segments = stored.slice(prefix.length).split('\\').filter((s) => s !== '');
  if (segments.length === 0) return storedPath;
  const folder = segments[0].toLowerCase();
  const isLegacy = folder === legacyName
    || (folder.startsWith(legacyName) && MIGRATED_SUFFIX.test(folder.slice(legacyName.length)));
  if (!isLegacy) return storedPath;

  const rest = segments.slice(1);
  const root = rest.length === 0 ? effective.config : effective[legacyEntryRoot(app, rest[0])];
  const mapped = p.join(root, ...rest);
  return trailing ? `${stripTrailingSeparators(mapped)}\\` : mapped;
}
