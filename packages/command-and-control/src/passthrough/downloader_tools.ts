import type { PassthroughTool } from './ci_tools.js';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { loadConfig } from '../kb/config.js';
import { loadCanvasConfig } from '../tools/setup_canvas.js';
import {
  managedCanvasBackupConfigExists,
  managedCanvasBackupConfigPath,
  writeManagedCanvasBackupConfig,
  type CanvasBackupPrefs,
} from './canvas_backup_config.js';

export interface CanvasBackupInvocation {
  command: string;
  baseArgs: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DownloadCanvasArchiveInput {
  courseId: string;
  configPath?: string;
  year?: string;
  semester?: string;
  root?: string;
  shellName?: string;
  downloadWorkers?: number;
}

export interface DownloadCanvasArchiveResult {
  status: 'complete';
  archivePath?: string;
  /** Full stdout+stderr written here. Kept out of the MCP result to avoid leaking tokens or personal data into LLM context. */
  logPath: string;
}

export function getCanvasBackupInvocation(): CanvasBackupInvocation {
  // Priority 1: explicit env var — agent/CI override, no disk read needed
  const explicit = process.env.CANVAS_BACKUP_COMMAND;
  if (explicit) return { command: explicit, baseArgs: [] };

  // Priority 2: path persisted via setup_cc — professor-configured, survives shell restarts
  const config = loadConfig();
  if (config.downloader?.executablePath) {
    return { command: config.downloader.executablePath, baseArgs: [] };
  }

  // Priority 3: sibling .venv checkout — developer workflow
  const repo = process.env.CANVAS_BACKUP_REPO ?? resolve(process.cwd(), '..', 'Canvas-Download');
  const windowsPython = resolve(repo, '.venv', 'Scripts', 'python.exe');
  const posixPython = resolve(repo, '.venv', 'bin', 'python');
  const python = existsSync(windowsPython) ? windowsPython : existsSync(posixPython) ? posixPython : undefined;

  if (python && existsSync(resolve(repo, 'src', 'canvas_download', 'cli.py'))) {
    const existingPythonPath = process.env.PYTHONPATH;
    const pythonPath = existingPythonPath
      ? `${resolve(repo, 'src')}${delimiter}${existingPythonPath}`
      : resolve(repo, 'src');
    return {
      command: python,
      baseArgs: ['-m', 'canvas_download.cli'],
      cwd: repo,
      env: { ...process.env, PYTHONPATH: pythonPath },
    };
  }

  return { command: 'canvas-backup', baseArgs: [] };
}

export function isCanvasBackupConfigured(): boolean {
  if (process.env.CANVAS_BACKUP_COMMAND) return true;
  const config = loadConfig();
  if (config.downloader?.executablePath) return true;
  const repo = process.env.CANVAS_BACKUP_REPO ?? resolve(process.cwd(), '..', 'Canvas-Download');
  return (
    (existsSync(resolve(repo, '.venv', 'Scripts', 'python.exe')) ||
      existsSync(resolve(repo, '.venv', 'bin', 'python'))) &&
    existsSync(resolve(repo, 'src', 'canvas_download', 'cli.py'))
  );
}

interface JsonProgressEvent {
  type: 'progress';
  message: string;
}

interface JsonCompleteEvent {
  type: 'complete';
  courseId: string;
  archivePath: string;
}

type JsonOutputEvent = JsonProgressEvent | JsonCompleteEvent;

/**
 * Run canvas-backup with --json-progress, streaming progress through an optional callback.
 *
 * Parses the structured JSON completion event for archivePath instead of the fragile
 * regex that was tied to Canvas Backup's human-readable output format.
 *
 * Requires canvas-backup v0.1+ with the --json-progress flag. Both sides must be
 * updated together (see docs/integration-contracts.md).
 */
export function downloadCanvasArchive(
  input: DownloadCanvasArchiveInput,
  onProgress?: (message: string) => void
): Promise<DownloadCanvasArchiveResult> {
  const invocation = getCanvasBackupInvocation();

  // Explicit input.configPath always wins; otherwise use the C&C-managed file if present.
  let configArgs: string[] = [];
  if (input.configPath) {
    configArgs = ['--config', input.configPath];
  } else if (managedCanvasBackupConfigExists()) {
    configArgs = ['--config', managedCanvasBackupConfigPath()];
  }

  const cliArgs = [
    ...invocation.baseArgs,
    ...configArgs,
    'archive',
    '--course-id', input.courseId,
    '--json-progress',
    ...(input.year ? ['--year', input.year] : []),
    ...(input.semester ? ['--semester', input.semester] : []),
    ...(input.root ? ['--root', input.root] : []),
    ...(input.shellName ? ['--shell-name', input.shellName] : []),
    ...(input.downloadWorkers ? ['--download-workers', String(input.downloadWorkers)] : []),
  ];

  // Merge env: preserve invocation.env (PYTHONPATH/cwd sibling-venv) when present,
  // inject CANVAS_TOKEN from the C&C canvas config when available. Never crash if
  // Canvas is not configured — spawn without the token and let the CLI report it.
  const baseEnv = invocation.env ?? process.env;
  let env: NodeJS.ProcessEnv = baseEnv;
  try {
    const canvas = loadCanvasConfig();
    env = { ...baseEnv, CANVAS_TOKEN: canvas.token };
  } catch {
    // Canvas not configured — leave env as-is.
  }

  return new Promise((resolveP, rejectP) => {
    const logPath = join(tmpdir(), `canvas-backup-${Date.now()}.log`);
    const logStream = createWriteStream(logPath, { encoding: 'utf-8' });
    let completeLine: JsonCompleteEvent | undefined;
    let stdoutBuf = '';

    const child = spawn(invocation.command, cliArgs, {
      cwd: invocation.cwd,
      env,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      logStream.write(text);
      stdoutBuf += text;

      // Process complete newline-terminated JSON lines; hold any partial trailing line.
      const parts = stdoutBuf.split('\n');
      stdoutBuf = parts.pop() ?? '';

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as JsonOutputEvent;
          if (event.type === 'progress') {
            onProgress?.(event.message);
          } else if (event.type === 'complete') {
            completeLine = event;
          }
        } catch {
          // Non-JSON line (e.g. an unexpected warning) — logged but not forwarded.
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      logStream.write(`[stderr] ${chunk.toString('utf-8')}`);
    });

    child.on('close', (code: number | null) => {
      logStream.end(() => {
        if (code !== 0) {
          rejectP(new Error(`canvas-backup exited with code ${code ?? 'null'}. See log: ${logPath}`));
          return;
        }
        resolveP({
          status: 'complete',
          archivePath: completeLine?.archivePath,
          logPath,
        } satisfies DownloadCanvasArchiveResult);
      });
    });

    child.on('error', (err: Error) => {
      logStream.end();
      rejectP(new Error(`Failed to start canvas-backup: ${err.message}`));
    });
  });
}

export const DOWNLOADER_TOOLS: PassthroughTool[] = [
  {
    name: 'setup_canvas_backup',
    taskCategory: 'none',
    description:
      '[canvas-backup] Generate a Canvas Backup config from the Canvas connection already ' +
      'configured in Command and Control. Writes ~/.command-and-control/canvas-backup.generated.toml ' +
      '(token stays out of the file; passed via CANVAS_TOKEN at archive time). Run this once per ' +
      'semester so download_canvas_archive can find base_url / archive root / year / semester.',
    inputSchema: {
      type: 'object',
      required: ['semester'],
      properties: {
        root: {
          type: 'string',
          description: 'Archive root directory. Defaults to ~/CanvasArchive.',
        },
        year: {
          type: 'string',
          description: 'Archive year folder (e.g. "2026"). Defaults to the current calendar year.',
        },
        semester: {
          type: 'string',
          description:
            'Archive semester folder (e.g. "Fall", "Spring", "Summer"). Required — never guessed.',
        },
        downloadWorkers: {
          type: 'number',
          description: 'Concurrent Canvas file downloads. Defaults to 6.',
        },
      },
    },
    handler: (args) => {
      const prefs = args as CanvasBackupPrefs;
      const { path, baseUrl } = writeManagedCanvasBackupConfig(prefs);
      return {
        configured: true,
        configPath: path,
        baseUrl,
        message:
          `Canvas Backup config written to ${path} (base_url=${baseUrl}). ` +
          'download_canvas_archive will use it automatically. The API token is not stored in the file.',
      };
    },
  },
  {
    name: 'download_canvas_archive',
    taskCategory: 'none',
    description: '[canvas-backup] Archive a Canvas course shell locally by invoking the Canvas Backup CLI.',
    inputSchema: {
      type: 'object',
      required: ['courseId'],
      properties: {
        courseId: { type: 'string' },
        configPath: { type: 'string', description: 'Optional path to config.local.toml.' },
        year: { type: 'string', description: 'Archive year folder override.' },
        semester: { type: 'string', description: 'Archive semester folder override.' },
        root: { type: 'string', description: 'Archive root override.' },
        shellName: { type: 'string', description: 'Folder name override for combined-section shells.' },
        downloadWorkers: { type: 'number', description: 'Concurrent Canvas file downloads.' },
      },
    },
    // Note: index.ts handles download_canvas_archive specially so it can attach MCP progress
    // notifications when the client provides a progressToken. This handler is a fallback
    // used only if the tool is somehow routed through the generic passthrough path.
    handler: async (args) => downloadCanvasArchive(args as DownloadCanvasArchiveInput),
  },
  {
    name: 'download_transcripts',
    taskCategory: 'none',
    description: '[canvas-backup] Placeholder for future bulk Panopto transcript download.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: () => ({
      error:
        'Bulk Panopto transcript download is not implemented in Canvas Backup yet. ' +
        'Use @canvas-toolchain/canvas-design-studio/fetch_panopto_captions for one video, or ingest existing .vtt/.srt files with Curriculum Intelligence.',
    }),
  },
];
