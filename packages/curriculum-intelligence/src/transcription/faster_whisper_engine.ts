import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { EngineStatus, TranscribeOptions, TranscriptionEngine } from './engine.js';
import type { TranscriptCue } from '../types.js';

const PY_CANDIDATES = ['python3', 'python', 'py'];

function bridgePath(): string {
  // engine compiles to dist/transcription/; the python/ dir sits at package root.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'python', 'whisper_transcribe.py');
}

async function probe(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    let proc;
    try {
      proc = spawn(cmd, args);
    } catch {
      resolve({ ok: false, out: '' });
      return;
    }
    proc.stdout?.on('data', (d) => (out += d.toString()));
    proc.stderr?.on('data', (d) => (out += d.toString()));
    proc.on('error', () => resolve({ ok: false, out: '' }));
    proc.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

async function resolvePython(): Promise<string | null> {
  for (const c of PY_CANDIDATES) {
    const r = await probe(c, ['--version']);
    if (r.ok) return c;
  }
  return null;
}

/** Find the first python candidate that has faster_whisper installed.
 *  Multiple pythons commonly exist on Windows (python3/python/py); only one may
 *  have the dependency. The basic resolvePython picks the first that runs at all,
 *  which can mismatch the install location. */
async function resolvePythonWithFasterWhisper(): Promise<string | null> {
  for (const c of PY_CANDIDATES) {
    const v = await probe(c, ['--version']);
    if (!v.ok) continue;
    const imp = await probe(c, ['-c', 'import faster_whisper']);
    if (imp.ok) return c;
  }
  return null;
}

class FasterWhisperEngine implements TranscriptionEngine {
  readonly name = 'faster-whisper';

  async isAvailable(): Promise<EngineStatus> {
    const python = await resolvePython();
    if (!python) {
      return {
        available: false,
        engine: this.name,
        detail: 'Python 3 not found on PATH',
        setupSteps: ['Install Python 3', 'pip install faster-whisper', 'Install ffmpeg'],
      };
    }
    // Prefer a python where faster_whisper is actually importable, not just the first that runs.
    const pythonWithDep = await resolvePythonWithFasterWhisper();
    if (!pythonWithDep) {
      return {
        available: false,
        engine: this.name,
        detail: `faster-whisper not installed in any Python on PATH (checked: ${PY_CANDIDATES.join(', ')})`,
        setupSteps: [`${python} -m pip install faster-whisper`, 'Install ffmpeg'],
      };
    }
    const ff = await probe('ffmpeg', ['-version']);
    if (!ff.ok) {
      return {
        available: false,
        engine: this.name,
        detail: 'ffmpeg not found on PATH',
        setupSteps: ['Install ffmpeg and ensure it is on PATH'],
      };
    }
    return { available: true, engine: this.name, detail: `Python ${pythonWithDep}, faster-whisper, ffmpeg present` };
  }

  async transcribe(audioPath: string, opts: TranscribeOptions): Promise<TranscriptCue[]> {
    const python = (await resolvePythonWithFasterWhisper()) ?? (await resolvePython()) ?? 'python';
    const args = [
      bridgePath(),
      '--audio', audioPath,
      '--model', opts.model,
      '--language', opts.language ?? 'en',
    ];
    if (opts.vocabHints && opts.vocabHints.length > 0) {
      args.push('--initial-prompt', opts.vocabHints.join(', '));
    }
    return new Promise<TranscriptCue[]>((resolve, reject) => {
      const proc = spawn(python, args);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`whisper bridge exited ${code}: ${stderr.trim()}`));
          return;
        }
        try {
          const raw = JSON.parse(stdout) as Array<{ start: number; end: number; text: string }>;
          resolve(raw.map((c) => ({ startSec: c.start, endSec: c.end, text: c.text })));
        } catch (e) {
          reject(new Error(`whisper bridge produced invalid JSON: ${(e as Error).message}`));
        }
      });
    });
  }
}

const REGISTRY: Record<string, () => TranscriptionEngine> = {
  'faster-whisper': () => new FasterWhisperEngine(),
};

export function getTranscriptionEngine(name: string): TranscriptionEngine {
  const factory = REGISTRY[name];
  if (!factory) throw new Error(`unknown transcription engine: ${name}`);
  return factory();
}
