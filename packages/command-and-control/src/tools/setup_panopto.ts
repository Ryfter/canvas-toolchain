import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPanoptoToken } from 'canvas-design-mcp/dist/tools/panopto.js';
import { getCcHomePath } from '../kb/config.js';

export interface PanoptoSetupConfig {
  domain: string;
  clientId: string;
  clientSecret: string;
  iframeWhitelisted: boolean | null;
  configuredAt: string;
  lastValidatedAt: string;
}

export interface SetupPanoptoInput {
  domain: string;
  clientId: string;
  clientSecret: string;
  iframeWhitelisted?: boolean | null;
  /** Default: true — validate credentials before saving. */
  test?: boolean;
}

export interface SetupPanoptoResult {
  configured: boolean;
  domain?: string;
  validatedAt?: string;
  message?: string;
  error?: string;
  fix?: string[];
}

function getPanoptoConfigPath(): string {
  return join(getCcHomePath(), 'panopto-config.json');
}

/**
 * Loads the saved Panopto config. Throws with PANOPTO_NOT_CONFIGURED if absent or incomplete.
 */
export function loadPanoptoConfig(): PanoptoSetupConfig {
  const configPath = getPanoptoConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      'PANOPTO_NOT_CONFIGURED: Run setup_panopto with your Panopto domain, clientId, and clientSecret.',
    );
  }
  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<PanoptoSetupConfig>;
  if (!config.domain || !config.clientId || !config.clientSecret) {
    throw new Error(
      'PANOPTO_NOT_CONFIGURED: panopto-config.json is missing required fields. Re-run setup_panopto.',
    );
  }
  return config as PanoptoSetupConfig;
}

export async function setupPanopto(input: SetupPanoptoInput): Promise<SetupPanoptoResult> {
  const { domain, clientId, clientSecret, iframeWhitelisted = null, test = true } = input;
  const now = new Date().toISOString();

  if (test) {
    try {
      await getPanoptoToken({ domain, clientId, clientSecret, iframeWhitelisted });
    } catch (err) {
      return {
        configured: false,
        error: 'CREDENTIAL_VALIDATION_FAILED',
        message: err instanceof Error ? err.message : String(err),
        fix: [
          'Verify your clientId and clientSecret in the Panopto admin panel',
          'Confirm the domain is correct (e.g. "bsu.hosted.panopto.com")',
          'Ensure the API client has the Creator role in Panopto',
        ],
      };
    }
  }

  const config: PanoptoSetupConfig = {
    domain,
    clientId,
    clientSecret,
    iframeWhitelisted,
    configuredAt: now,
    lastValidatedAt: test ? now : '',
  };

  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  writeFileSync(getPanoptoConfigPath(), JSON.stringify(config, null, 2), 'utf-8');

  return {
    configured: true,
    domain,
    ...(test && { validatedAt: now }),
    message: test
      ? `Panopto configured and credentials validated for ${domain}.`
      : `Panopto configured for ${domain} (credentials not tested).`,
  };
}
