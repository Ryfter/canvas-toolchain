import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPanoptoToken } from './client.js';

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

function getPanoptoConfigPath(secretsDir: string): string {
  return join(secretsDir, 'panopto-config.json');
}

/**
 * Save the shared Panopto credential to `<secretsDir>/panopto-config.json` (the file the host's
 * credential resolver reads as the shared Panopto credential). Reading is done by the host via
 * `ctx.credentials`; this module has no no-arg loader.
 */
export async function setupPanopto(input: SetupPanoptoInput, secretsDir: string): Promise<SetupPanoptoResult> {
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
          'Confirm the domain is correct (e.g. "example.hosted.panopto.com")',
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

  mkdirSync(secretsDir, { recursive: true });
  const configPath = getPanoptoConfigPath(secretsDir);
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, configPath);

  return {
    configured: true,
    domain,
    ...(test && { validatedAt: now }),
    message: test
      ? `Panopto configured and credentials validated for ${domain}.`
      : `Panopto configured for ${domain} (credentials not tested).`,
  };
}
