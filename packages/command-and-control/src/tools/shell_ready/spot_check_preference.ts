import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../../kb/config.js';
import type { SpotCheckPreference, ShellWeekday } from './types.js';

const WEEKDAYS = new Set<ShellWeekday>([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

export function getSpotCheckPreferencePath(): string {
  return join(getCcHomePath(), 'spot-check.json');
}

export function loadSpotCheckPreference(): SpotCheckPreference | null {
  const path = getSpotCheckPreferencePath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<SpotCheckPreference>;
    if (typeof raw.weeklyCheckEnabled !== 'boolean') return null;
    const day = raw.weeklyCheckDay;
    if (!day || !WEEKDAYS.has(day)) return null;
    return {
      weeklyCheckEnabled: raw.weeklyCheckEnabled,
      weeklyCheckDay: day,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveSpotCheckPreference(
  pref: Omit<SpotCheckPreference, 'updatedAt'>,
): SpotCheckPreference {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const full: SpotCheckPreference = {
    weeklyCheckEnabled: pref.weeklyCheckEnabled,
    weeklyCheckDay: pref.weeklyCheckDay,
    updatedAt: new Date().toISOString(),
  };
  const path = getSpotCheckPreferencePath();
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(full, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
  try { chmodSync(path, 0o600); } catch { /* best-effort */ }
  return full;
}
