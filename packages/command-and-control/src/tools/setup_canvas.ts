import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';
import { migrateCanvasStores, normalizeCanvasHost, writeCanvasConfig } from '@canvas-toolchain/shared-types';

export interface CanvasSetupConfig {
  host: string;
  token: string;
  configuredAt: string;
  lastValidatedAt: string;
  /** Where new snapshots get written. 'project' = <courseDir>/.canvas-toolchain/publish-snapshots/
   *  (git-trackable, faculty-portable). 'global' = ~/.command-and-control/publish-snapshots/
   *  (legacy, machine-bound). Default: 'project'. Existing snapshots in either location
   *  remain readable via the snapshot_location fallback resolver. */
  snapshotsLocation?: 'project' | 'global';
  /** V&R Plan C: number of most-recent snapshots to always keep regardless of age. Default 3. */
  snapshotRetentionCount?: number;
  /** V&R Plan C: number of days to keep snapshots regardless of count. Default 30. */
  snapshotRetentionDays?: number;
  /** V&R Plan C: course-level breadcrumb default. 'enabled' creates archived Canvas pages + files on publish. Default 'enabled'. */
  canvasBreadcrumbs?: 'enabled' | 'disabled';
  /** V&R Plan C: override automatic backup detection. 'auto' uses detected state. Default 'auto'. */
  backupOverride?: 'verified' | 'none' | 'auto';
}

export interface SetupCanvasInput {
  /** Canvas hostname, e.g. "example.instructure.com". Leading scheme + trailing slash are stripped. */
  host: string;
  /** Canvas API access token (Canvas → Account → Settings → New Access Token). */
  token: string;
  /** Default: true — validate by calling /api/v1/users/self before saving. */
  test?: boolean;
}

export interface SetupCanvasResult {
  configured: boolean;
  host?: string;
  validatedAt?: string;
  message?: string;
  error?: string;
  fix?: string[];
}

function getCanvasConfigPath(): string {
  return join(getCcHomePath(), 'canvas-config.json');
}

export function loadCanvasConfig(): CanvasSetupConfig {
  const configPath = getCanvasConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      'CANVAS_NOT_CONFIGURED: Run setup_canvas with your Canvas host and API token.',
    );
  }
  let config: Partial<CanvasSetupConfig>;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    throw new Error(
      'CANVAS_NOT_CONFIGURED: canvas-config.json is corrupt. Re-run setup_canvas.',
    );
  }
  if (!config.host || !config.token) {
    throw new Error(
      'CANVAS_NOT_CONFIGURED: canvas-config.json is missing required fields. Re-run setup_canvas.',
    );
  }
  // Self-heal on read: configs written before host normalization was unified —
  // or hand-edited — can hold a bare subdomain that resolves nowhere. Correct it
  // in memory so existing installs work without re-running setup.
  return { ...config, host: normalizeCanvasHost(config.host) } as CanvasSetupConfig;
}

async function validateToken(host: string, token: string): Promise<void> {
  const response = await fetch(`https://${host}/api/v1/users/self`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Canvas API returned ${response.status}`);
  }
}

export async function setupCanvas(input: SetupCanvasInput): Promise<SetupCanvasResult> {
  const host = normalizeCanvasHost(input.host);
  const { token, test = true } = input;

  if (!host) {
    return {
      configured: false,
      error: 'CANVAS_HOST_INVALID',
      message: 'No Canvas hostname was provided.',
      fix: ['Pass your school\'s Canvas host, e.g. "example.instructure.com"'],
    };
  }
  const now = new Date().toISOString();

  if (test) {
    try {
      await validateToken(host, token);
    } catch (err) {
      return {
        configured: false,
        error: 'CREDENTIAL_VALIDATION_FAILED',
        message: err instanceof Error ? err.message : String(err),
        fix: [
          'Verify the token at Canvas → Account → Settings → New Access Token',
          'Confirm the host is your school\'s Canvas URL (e.g. "example.instructure.com")',
          'Check network connectivity',
        ],
      };
    }
  }

  // One writer for the canonical store (#151 R7, D1): atomic with a unique temp
  // name, owner-only, preserving the settings setup_canvas does not own — the
  // V&R Plan C snapshot settings declared on CanvasSetupConfig, plus any field
  // written by the Go installer or a future version. setup_canvas is this file's
  // owner and the professor is explicitly re-configuring, so a file that cannot be
  // parsed may be replaced — with its old bytes kept aside as a backup.
  writeCanvasConfig(
    {
      host,
      token,
      configuredAt: now,
      lastValidatedAt: test ? now : '',
    },
    { replaceCorrupt: true },
  );

  // Canvas Design Studio reads its Canvas host and token from its own
  // institution.json (which also owns the brand colors, accessibility policy and
  // WAVE key). Bridge the two stores in both directions: on a fresh install this
  // creates the mirror that C&C's own a11y tools need, and on an existing one it
  // keeps them from disagreeing. Never fatal — the Canvas connection itself is
  // saved and usable either way.
  let storeNote = '';
  try {
    const migration = migrateCanvasStores({ createInstitution: true });
    if (migration.changed || migration.action === 'corrupt') storeNote = ` ${migration.detail}`;
  } catch (err) {
    storeNote = ` Warning: Canvas Design Studio's institution.json could not be updated (${
      err instanceof Error ? err.message : String(err)
    }); review_accessibility_policy and wave_deep_check may stay unavailable.`;
  }

  return {
    configured: true,
    host,
    ...(test && { validatedAt: now }),
    message: (test
      ? `Canvas configured and token validated for ${host}.`
      : `Canvas configured for ${host} (token not tested).`) + storeNote,
  };
}
