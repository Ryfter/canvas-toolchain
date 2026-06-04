import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

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
}

export interface SetupCanvasInput {
  /** Canvas hostname, e.g. "bsu.instructure.com". Leading scheme + trailing slash are stripped. */
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

function normalizeHost(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
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
  return config as CanvasSetupConfig;
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
  const host = normalizeHost(input.host);
  const { token, test = true } = input;
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
          'Confirm the host is your school\'s Canvas URL (e.g. "bsu.instructure.com")',
          'Check network connectivity',
        ],
      };
    }
  }

  const config: CanvasSetupConfig = {
    host,
    token,
    configuredAt: now,
    lastValidatedAt: test ? now : '',
  };

  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getCanvasConfigPath();
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, configPath);

  return {
    configured: true,
    host,
    ...(test && { validatedAt: now }),
    message: test
      ? `Canvas configured and token validated for ${host}.`
      : `Canvas configured for ${host} (token not tested).`,
  };
}
