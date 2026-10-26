import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, win32 } from 'node:path';
import {
  MIGRATION_JOURNAL_FILE, appPaths, cdsSecretsHome, legacyAppHome, legacyEntryRoot,
  normalizeCanvasHost, readCanvasStoreJournal,
  type AppId,
} from '@canvas-toolchain/shared-types';
import { assertEndpointAllowed } from '@canvas-toolchain/shared-llm';
import { loadConfig } from '../kb/config.js';
import { loadCanvasConfig } from '../tools/setup_canvas.js';
import { loadAnthropicConfig } from '../tools/setup_anthropic.js';
import { loadOllamaConfig } from '../tools/setup_ollama.js';
import { loadLmStudioConfig } from '../tools/setup_lmstudio.js';
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
  AppHomeState,
  CanvasStoreMigrationRecord,
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
  const cc = appPaths('cc');
  // Classified by the same table the migration engine uses (#200): a
  // secrets-class file lives in the secrets root (local, non-roaming on
  // Windows), a settings file in the config root. Reading everything from the
  // config root told a connected Windows professor Canvas was not connected.
  const ccFile = (name: string): string => join(cc[legacyEntryRoot('cc', name)], name);
  return {
    'cc-config': ccFile('config.json'),
    'canvas-config': ccFile('canvas-config.json'),
    // Canvas Design Studio's own home, the same rule its config.ts and C&C's
    // kb-bridge use. The two Canvas stores are the split this module reports on.
    'institution-config': join(cdsSecretsHome(), 'institution.json'),
    'anthropic-config': ccFile('anthropic-config.json'),
    'ollama-config': ccFile('ollama-config.json'),
    'lmstudio-config': ccFile('lmstudio-config.json'),
    'llm-provider': ccFile('llm-provider.json'),
    'transcript-config': ccFile('transcript-config.json'),
    'lecture-answers-config': lectureAnswersConfigPath(),
    'modules-manifest': getModulesManifestPath(),
  };
}

const APP_LABELS: Record<AppId, string> = {
  cc: 'Command & Control',
  cds: 'Canvas Design Studio',
  ci: 'Curriculum Intelligence',
};

const JOURNAL_OUTCOMES = new Set(['migrated', 'partial', 'nothing-to-do', 'failed']);

/** The migration journal's outcome. Missing is `nothing-to-do`; garbage is `unreadable`. */
function readMigrationOutcome(configRoot: string): AppHomeState['migration'] {
  const file = join(configRoot, MIGRATION_JOURNAL_FILE);
  try {
    if (!existsSync(file)) return 'nothing-to-do';
    const outcome = (JSON.parse(readFileSync(file, 'utf-8')) as { outcome?: unknown } | null)?.outcome;
    return typeof outcome === 'string' && JOURNAL_OUTCOMES.has(outcome)
      ? (outcome as 'migrated' | 'partial' | 'nothing-to-do' | 'failed')
      : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/** True when `target` is a UNC path or sits outside `profile` (Windows semantics). */
function outsideWindowsProfile(target: string, profile: string): boolean {
  const norm = (v: string): string => win32.normalize(v).replace(/[\\/]+$/, '').toLowerCase();
  const t = norm(target);
  if (t.startsWith('\\\\')) return true;
  const p = norm(profile);
  return t !== p && !t.startsWith(`${p}\\`);
}

/** Home-relative display form (`~/.x`), like the host wiring paths: a report is
 *  pasted into chats, so it should not carry the OS account name. */
function tildify(p: string, home: string): string {
  const sep = process.platform === 'win32' ? '\\' : '/';
  const h = home.replace(/[\\/]+$/, '');
  return h && p.startsWith(h + sep) ? `~${p.slice(h.length)}` : p;
}

function readAppHomes(): AppHomeState[] {
  const onWindows = process.platform === 'win32';
  const home = homedir();
  return (['cc', 'cds', 'ci'] as const).map((app) => {
    const paths = appPaths(app);
    let legacyPresent = false;
    try {
      const legacy = legacyAppHome(app);
      legacyPresent = legacy !== paths.config && existsSync(legacy);
    } catch {
      legacyPresent = false;
    }
    const outsideProfile = onWindows &&
      [paths.config, paths.data, paths.secrets].some((r) => outsideWindowsProfile(r, homedir()));
    return {
      app,
      label: APP_LABELS[app],
      source: paths.source,
      config: tildify(paths.config, home),
      data: tildify(paths.data, home),
      secrets: tildify(paths.secrets, home),
      migration: readMigrationOutcome(paths.config),
      legacyPresent,
      outsideProfile,
    };
  });
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
  const isPosix = process.platform !== 'win32';
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

/** The Canvas store bridge's last recorded outcome, or null. Diagnostics only —
 *  an unreadable journal must never take the readiness read down with it. */
function safelyJournal(): CanvasStoreMigrationRecord | null {
  try {
    const record = readCanvasStoreJournal();
    if (!record) return null;
    return {
      at: record.at,
      action: record.action,
      detail: record.detail,
      ...(record.backupPath !== undefined && { backupPath: record.backupPath }),
    };
  } catch {
    return null;
  }
}

/**
 * The file's parsed JSON object, or undefined when it is absent, unparseable, or
 * not an object. Read raw — no overlaid view, and nothing but the fields named
 * here is ever kept.
 */
function readRawJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
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
 * Guarded LM Studio reachability check (`GET {baseUrl}/models`). The endpoint is
 * user-supplied, so it re-runs the SSRF guard before the request; a refused or
 * unresolvable endpoint is reduced to a machine code, never a message. A
 * remote/LAN server may require Bearer auth; the key comes from the environment
 * and is sent as a header only.
 */
async function probeLmStudio(baseUrl: string): Promise<ProbeResult> {
  let url: string;
  try {
    url = `${(await assertEndpointAllowed(baseUrl)).url}/models`;
  } catch {
    return { attempted: true, reachable: false, errorCode: 'ENDPOINT_BLOCKED' };
  }
  const apiKey = process.env.LMSTUDIO_API_KEY;
  return probeRequest(url, apiKey ? { authorization: `Bearer ${apiKey}` } : {});
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

  // The two Canvas stores are read RAW, here and not through Canvas Design
  // Studio's loadConfig(): that loader overlays the canonical host and token, so
  // going through it hid a disagreement between the files — and the doctor's
  // whole job is to report what is on disk, including the token a save would
  // silently replace.
  const rawCanvas = readRawJson(paths['canvas-config']);
  const rawInstitution = readRawJson(paths['institution-config']);

  const canvasConfig = {
    host: safeHost(rawCanvas?.host),
    hasApiToken: nonEmpty(rawCanvas?.token),
  };
  const institutionName = rawInstitution?.institution;
  const designStudio = {
    configured: rawInstitution !== undefined,
    host: safeHost(rawInstitution?.canvasUrl),
    hasApiToken: nonEmpty(rawInstitution?.apiToken),
    hasWaveApiKey: nonEmpty(rawInstitution?.waveApiKey),
    institutionName: nonEmpty(institutionName) ? String(institutionName) : null,
    brandSetupPending: rawInstitution?.brandSetupPending === true,
  };

  // In sync means the two stores agree on a host, or neither exists. A store
  // present on only one side is the split that strands C&C's policy and WAVE
  // tools.
  const storesInSync =
    (canvasConfig.host === null && designStudio.host === null) ||
    (canvasConfig.host !== null && canvasConfig.host === designStudio.host);

  const anthropic = safely(loadAnthropicConfig);
  const ollama = safely(loadOllamaConfig);
  const lmstudio = safely(loadLmStudioConfig);
  const answers = loadLectureAnswersConfig();
  const envKeyPresent = nonEmpty(process.env.ANTHROPIC_API_KEY);
  const anthropicSource =
    anthropic && envKeyPresent ? 'both' : anthropic ? 'file' : envKeyPresent ? 'env' : 'none';

  const transcript = safely(loadTranscriptConfig);

  const backupSource = backupExecutableSource();

  const manifest = loadModuleManifest();
  const installedModules = loadInstalledModules();

  // Only files that hold a secret ON DISK, read raw. Canvas Design Studio's
  // loadConfig() overlay made this list lie: institution.json was flagged for the
  // canonical token it does not contain, and canvas-config.json for a token it
  // only had a host of.
  const secretBearingFiles: ConfigFileKey[] = [];
  if (nonEmpty(config?.registry?.token)) secretBearingFiles.push('cc-config');
  if (canvasConfig.hasApiToken) secretBearingFiles.push('canvas-config');
  if (designStudio.hasApiToken || designStudio.hasWaveApiKey) {
    secretBearingFiles.push('institution-config');
  }
  if (nonEmpty(anthropic?.apiKey)) secretBearingFiles.push('anthropic-config');
  if (nonEmpty(answers?.voyageApiKey)) secretBearingFiles.push('lecture-answers-config');

  const state: SetupState = {
    platform: process.platform,
    coursesRoot,
    coursesRootExists: coursesRoot !== null && existsSync(coursesRoot),
    files,
    secretBearingFiles,
    canvas: {
      configured: canvas !== undefined,
      host: canvas?.host ?? null,
      configuredAt: canvas?.configuredAt || null,
    },
    designStudio,
    canvasConfig,
    storesInSync,
    canvasStoreMigration: safelyJournal(),
    appHomes: readAppHomes(),
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
      lmstudio: {
        configured: lmstudio !== undefined,
        host: lmstudio?.baseUrl ?? null,
        model: lmstudio?.model ?? null,
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
    state.llm.lmstudio.probe = lmstudio
      ? await probeLmStudio(lmstudio.baseUrl)
      : { attempted: false, reachable: false };
  }

  return state;
}
