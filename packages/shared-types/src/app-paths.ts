/**
 * Per-OS app-home resolver (#200). Pure apart from two optional existence
 * probes (upgrade-window rule), both injectable so every row is testable on
 * any OS. See docs/specs/2026-10-18-paths-and-module-credentials.md section 4.1.
 *
 * Roots:
 *  - config:  settings and irreplaceable state
 *  - data:    caches, artifacts, large regenerable data
 *  - secrets: token/key-bearing files and the roster vault. Local (not
 *             roaming) on Windows; equals config on POSIX.
 *
 * macOS/Linux behaviour is unchanged: all three roots are the legacy
 * `~/.<app>` dot-folder.
 */
import { existsSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import path from 'node:path';

export type AppId = 'cc' | 'cds' | 'ci';

export interface AppPaths {
  /** Settings and irreplaceable state. */
  config: string;
  /** Caches, artifacts, snapshots, large regenerable data. */
  data: string;
  /** Token/key-bearing files, module-credentials/ and roster-vault/. */
  secrets: string;
  source: 'env' | 'default';
}

export interface PathEnv {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  homedir?: string;
  /** Test injection: stand-in for "legacy folder exists". When unset, the real filesystem is probed. */
  legacyExists?: boolean;
  /** Test injection: stand-in for "new config home exists". When unset, the real filesystem is probed. */
  newExists?: boolean;
  /** Internal (migration engine, doctor): resolve the new homes even inside the upgrade window. */
  ignoreUpgradeWindow?: boolean;
}

interface AppMeta {
  sub: string;
  legacy: string;
  envVar: string;
}

const APPS: Record<AppId, AppMeta> = {
  cc: { sub: 'CommandAndControl', legacy: '.command-and-control', envVar: 'CC_HOME' },
  cds: { sub: 'CanvasDesignStudio', legacy: '.canvas-design-mcp', envVar: 'CANVAS_DESIGN_HOME' },
  ci: { sub: 'CurriculumIntelligence', legacy: '.curriculum-intelligence', envVar: 'CURRICULUM_INTELLIGENCE_HOME' },
};

function flavour(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function nonBlank(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** The pre-#200 home, `~/.<app>`. */
export function legacyAppHome(app: AppId, o: PathEnv = {}): string {
  const platform = o.platform ?? process.platform;
  const home = o.homedir ?? osHomedir();
  return flavour(platform).join(home, APPS[app].legacy);
}

export function appPaths(app: AppId, o: PathEnv = {}): AppPaths {
  const meta = APPS[app];
  const platform = o.platform ?? process.platform;
  const env = o.env ?? process.env;
  const home = o.homedir ?? osHomedir();

  // Row 1: an override means "one folder for everything".
  const override = nonBlank(env[meta.envVar]);
  if (override !== undefined) {
    return { config: override, data: override, secrets: override, source: 'env' };
  }

  const p = flavour(platform);
  const legacy = p.join(home, meta.legacy);

  // Row 3: POSIX, unchanged. All roots are the same dot-folder.
  if (platform !== 'win32') {
    return { config: legacy, data: legacy, secrets: legacy, source: 'default' };
  }

  // Row 2: Windows.
  const roaming = nonBlank(env.APPDATA) ?? p.join(home, 'AppData', 'Roaming');
  const local = nonBlank(env.LOCALAPPDATA) ?? p.join(home, 'AppData', 'Local');
  const config = p.join(roaming, 'CanvasToolchain', meta.sub);
  const data = p.join(local, 'CanvasToolchain', meta.sub);
  const secrets = p.join(data, 'secrets');

  // Upgrade-window rule: legacy present and new config home absent means the
  // legacy folder is still authoritative for every root.
  if (!o.ignoreUpgradeWindow) {
    const legacyExists = o.legacyExists ?? existsSync(legacy);
    if (legacyExists) {
      const newExists = o.newExists ?? existsSync(config);
      if (!newExists) {
        return { config: legacy, data: legacy, secrets: legacy, source: 'default' };
      }
    }
  }
  return { config, data, secrets, source: 'default' };
}

export const ccConfigHome = (o?: PathEnv): string => appPaths('cc', o).config;
export const ccDataHome = (o?: PathEnv): string => appPaths('cc', o).data;
export const ccSecretsHome = (o?: PathEnv): string => appPaths('cc', o).secrets;
export const cdsConfigHome = (o?: PathEnv): string => appPaths('cds', o).config;
export const cdsDataHome = (o?: PathEnv): string => appPaths('cds', o).data;
export const cdsSecretsHome = (o?: PathEnv): string => appPaths('cds', o).secrets;
export const ciConfigHome = (o?: PathEnv): string => appPaths('ci', o).config;
export const ciDataHome = (o?: PathEnv): string => appPaths('ci', o).data;
export const ciSecretsHome = (o?: PathEnv): string => appPaths('ci', o).secrets;
