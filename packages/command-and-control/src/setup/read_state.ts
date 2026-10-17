import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { normalizeCanvasHost } from '@canvas-toolchain/shared-types';
import { loadConfig as loadInstitutionConfig } from '@canvas-toolchain/canvas-design-studio/dist/config.js';
import { getCcHomePath, loadConfig } from '../kb/config.js';
import { loadCanvasConfig } from '../tools/setup_canvas.js';
import { loadAnthropicConfig } from '../tools/setup_anthropic.js';
import { loadOllamaConfig } from '../tools/setup_ollama.js';
import { loadActiveProvider } from '../tools/set_active_llm_provider.js';
import { loadTranscriptConfig } from '../tools/setup_transcript_source.js';
import { loadLectureAnswersConfig } from '../tools/answers/config.js';
import { lectureAnswersConfigPath } from '../tools/answers/paths.js';
import { getModulesManifestPath, loadModuleManifest } from '../modules/manifest.js';
import { knownModuleIds } from '../modules/registry.js';
import { loadInstalledModules } from '../channel/installed.js';
import { loadPendingRequests } from '../channel/pending.js';
import { managedCanvasBackupConfigExists } from '../passthrough/canvas_backup_config.js';
import { isCanvasBackupConfigured } from '../passthrough/downloader_tools.js';
import { detectHostWiring } from './hosts.js';
import type {
  ConfigFileKey,
  ProbeResult,
  ReadSetupStateOptions,
  SecretFileHealth,
  SetupState,
} from './types.js';

/**
 * Where the setup engine looks. The filenames are the contract with each
 * writer — `setup_canvas`/`setup_anthropic`/`setup_ollama`/`set_active_llm_provider`
 * all write into the same CC home this reads.
 */
function filePaths(): Record<ConfigFileKey, string> {
  const ccHome = getCcHomePath();
  return {
    'cc-config': join(ccHome, 'config.json'),
    'canvas-config': join(ccHome, 'canvas-config.json'),
    // Canvas Design Studio's own home, the same rule its config.ts and C&C's
    // kb-bridge use. The two Canvas stores are the split this module reports on.
    'institution-config': join(
      process.env.CANVAS_DESIGN_HOME ?? join(homedir(), '.canvas-design-mcp'),
      'institution.json',
    ),
    'anthropic-config': join(ccHome, 'anthropic-config.json'),
    'ollama-config': join(ccHome, 'ollama-config.json'),
    'llm-provider': join(ccHome, 'llm-provider.json'),
    'transcript-config': join(ccHome, 'transcript-config.json'),
    'lecture-answers-config': lectureAnswersConfigPath(),
    'modules-manifest': getModulesManifestPath(),
  };
}

/** Presence, JSON validity, and POSIX permissions. Never the file body. */
function inspectFile(path: string): SecretFileHealth {
  if (!existsSync(path)) {
    return { path, present: false, validJson: false, modeOctal: null, permissionsOk: null };
  }

  let mode: number | null = null;
  try {
    mode = statSync(path).mode;
  } catch {
    mode = null;
  }

  let validJson = false;
  try {
    JSON.parse(readFileSync(path, 'utf-8'));
    validJson = true;
  } catch {
    validJson = false;
  }

  // Windows reports synthetic mode bits, so a permissions verdict there would be
  // noise. Null means "not applicable", which the doctor reports as such.
  const isPosix = platform() !== 'win32';
  return {
    path,
    present: true,
    validJson,
    modeOctal: isPosix && mode !== null ? mode & 0o777 : null,
    permissionsOk: isPosix && mode !== null ? (mode & 0o077) === 0 : null,
  };
}

/**
 * The existing loaders throw by design (callers are expected to have configured
 * the file). A readiness read must survive a half-written or hand-edited config,
 * so every load is allowed to fail into `undefined` and the doctor reports it.
 */
function safely<T>(load: () => T): T | undefined {
  try {
    return load();
  } catch {
    return undefined;
  }
}

function safeHost(value: unknown): string | null {
  return typeof value === 'string' && value ? normalizeCanvasHost(value) : null;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

const PROBE_TIMEOUT_MS = 5000;

/** Which of the three ways to reach Canvas Backup the machine has, in priority order. */
function backupExecutableSource(): SetupState['backup']['executableSource'] {
  if (process.env.CANVAS_BACKUP_COMMAND) return 'env';
  if (safely(() => loadConfig().downloader?.executablePath)) return 'config';
  if (safely(isCanvasBackupConfigured)) return 'sibling-venv';
  return 'none';
}

/**
 * Bounded live check. Credentials go in headers (never the URL), redirects are
 * refused rather than followed to another origin, and a failure is reduced to a
 * machine code — an error message can echo request material.
 */
async function probeRequest(url: string, headers: Record<string, string>): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return { attempted: true, reachable: response.ok, status: response.status };
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    const errorCode = typeof code === 'string' && code
      ? code
      : err instanceof Error && err.name === 'TimeoutError' ? 'TIMEOUT' : 'UNREACHABLE';
    return { attempted: true, reachable: false, errorCode };
  }
}

/**
 * One read-only pass over the machine's setup. Never throws, never returns a
 * secret, and makes no network call unless `probe` is explicitly true.
 */
export async function readSetupState(opts: ReadSetupStateOptions = {}): Promise<SetupState> {
  const paths = filePaths();
  const files = Object.fromEntries(
    (Object.keys(paths) as ConfigFileKey[]).map((key) => [key, inspectFile(paths[key])]),
  ) as Record<ConfigFileKey, SecretFileHealth>;

  const config = safely(loadConfig);
  const coursesRoot = config?.coursesRoot ?? null;

  const canvas = safely(loadCanvasConfig);
  const institution = safely(loadInstitutionConfig);

  const designStudio = {
    configured: institution !== undefined,
    host: safeHost(institution?.canvasUrl),
    hasApiToken: nonEmpty(institution?.apiToken),
    hasWaveApiKey: nonEmpty(institution?.waveApiKey),
    institutionName: institution?.institution ?? null,
  };

  // In sync means the two stores agree, or neither exists. A store present on
  // only one side is the split that strands C&C's policy and WAVE tools.
  const canvasHost = canvas?.host ?? null;
  const storesInSync =
    (canvasHost === null && designStudio.host === null) ||
    (canvasHost !== null && canvasHost === designStudio.host);

  const anthropic = safely(loadAnthropicConfig);
  const ollama = safely(loadOllamaConfig);
  const answers = loadLectureAnswersConfig();
  const envKeyPresent = nonEmpty(process.env.ANTHROPIC_API_KEY);
  const anthropicSource =
    anthropic && envKeyPresent ? 'both' : anthropic ? 'file' : envKeyPresent ? 'env' : 'none';

  const transcript = safely(loadTranscriptConfig);

  const backupSource = backupExecutableSource();

  const manifest = loadModuleManifest();
  const installedModules = loadInstalledModules();

  const secretBearingFiles: ConfigFileKey[] = [];
  if (nonEmpty(config?.registry?.token)) secretBearingFiles.push('cc-config');
  if (nonEmpty(canvas?.token)) secretBearingFiles.push('canvas-config');
  if (nonEmpty(institution?.apiToken) || nonEmpty(institution?.waveApiKey)) {
    secretBearingFiles.push('institution-config');
  }
  if (nonEmpty(anthropic?.apiKey)) secretBearingFiles.push('anthropic-config');
  if (nonEmpty(answers?.voyageApiKey)) secretBearingFiles.push('lecture-answers-config');

  const state: SetupState = {
    platform: platform(),
    coursesRoot,
    coursesRootExists: coursesRoot !== null && existsSync(coursesRoot),
    files,
    secretBearingFiles,
    canvas: {
      configured: canvas !== undefined,
      host: canvasHost,
      configuredAt: canvas?.configuredAt || null,
    },
    designStudio,
    storesInSync,
    llm: {
      activeProvider: safely(loadActiveProvider) ?? null,
      anthropic: {
        configured: anthropic !== undefined || envKeyPresent,
        source: anthropicSource,
        configuredAt: anthropic?.configuredAt || null,
      },
      ollama: {
        configured: ollama !== undefined,
        host: ollama?.baseUrl ?? null,
        model: ollama?.model ?? null,
      },
      lectureAnswers: {
        configured: answers !== null,
        provider: answers?.provider ?? null,
      },
    },
    transcripts: {
      // The loader supplies the panopto default, so `source` is only null when
      // the file exists but could not be read — never silently defaulted away.
      source: transcript?.source ?? null,
      configured: transcript !== undefined && files['transcript-config'].present,
    },
    backup: {
      executableConfigured: backupSource !== 'none',
      executableSource: backupSource,
      managedTomlPresent: managedCanvasBackupConfigExists(),
    },
    modules: {
      bundled: knownModuleIds().map((id) => ({ id, enabled: manifest.modules[id]?.enabled === true })),
      installed: Object.entries(installedModules.modules).map(([id, record]) => ({
        id,
        version: record.version,
        enabled: manifest.modules[id]?.enabled === true,
      })),
      pendingRequests: loadPendingRequests().modules,
    },
    // Read-only, and the only part of this read that looks outside the CC home.
    // Opt-out, so a caller that must not touch another app's files can say so.
    hosts: opts.hosts === false ? null : detectHostWiring(),
  };

  if (opts.probe === true) {
    state.canvas.probe = canvas?.host && canvas.token
      ? await probeRequest(`https://${canvas.host}/api/v1/users/self`, {
          authorization: `Bearer ${canvas.token}`,
        })
      : { attempted: false, reachable: false };
    state.llm.anthropic.probe = anthropic
      ? await probeRequest('https://api.anthropic.com/v1/models', {
          'x-api-key': anthropic.apiKey,
          'anthropic-version': '2023-06-01',
        })
      : { attempted: false, reachable: false };
  }

  return state;
}
