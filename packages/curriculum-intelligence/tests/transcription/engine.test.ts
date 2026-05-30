import { describe, it, expect, vi } from 'vitest';
import type {
  TranscriptionEngine,
  EngineStatus,
  TranscribeOptions,
} from '../../src/transcription/engine.js';
import type { TranscriptCue } from '../../src/types.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getTranscriptionEngine } from '../../src/transcription/faster_whisper_engine.js';

function fakeProc(stdout: string, code: number) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  setTimeout(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', code);
  }, 0);
  return proc;
}

describe('TranscriptionEngine interface', () => {
  it('a conforming object satisfies the interface shape', async () => {
    const fake: TranscriptionEngine = {
      name: 'fake',
      async isAvailable(): Promise<EngineStatus> {
        return { available: true, engine: 'fake', detail: 'ok' };
      },
      async transcribe(_audio: string, _opts: TranscribeOptions): Promise<TranscriptCue[]> {
        return [{ startSec: 0, endSec: 1, text: 'hi' }];
      },
    };
    expect(fake.name).toBe('fake');
    const status = await fake.isAvailable();
    expect(status.available).toBe(true);
    const cues = await fake.transcribe('/x.mp3', { model: 'small' });
    expect(cues[0].text).toBe('hi');
  });
});

describe('getTranscriptionEngine', () => {
  it('returns the faster-whisper engine by name', () => {
    const engine = getTranscriptionEngine('faster-whisper');
    expect(engine.name).toBe('faster-whisper');
  });

  it('throws for an unknown engine name', () => {
    expect(() => getTranscriptionEngine('does-not-exist')).toThrow(/unknown transcription engine/i);
  });
});

describe('FasterWhisperEngine.isAvailable', () => {
  it('finds a python where faster_whisper imports, even if the first probed python lacks it', async () => {
    // Real-world Windows case from #60 verification: `python3` resolves to a
    // 3.12 install with no faster_whisper, while `python` resolves to 3.14
    // where it IS installed. The old probe stopped at the first python that
    // ran and reported "not installed" against that wrong interpreter.
    vi.mocked(spawn).mockImplementation((cmd: any, args: any) => {
      const a = (args ?? []) as string[];
      const isImport = a[0] === '-c' && typeof a[1] === 'string' && a[1].includes('faster_whisper');
      if (cmd === 'python3' && isImport) return fakeProc('ModuleNotFoundError', 1) as any;
      return fakeProc('ok', 0) as any;
    });
    const engine = getTranscriptionEngine('faster-whisper');
    const status = await engine.isAvailable();
    expect(status.available).toBe(true);
    expect(status.detail).toMatch(/^Python python,/);
  });

  it('reports faster-whisper not installed when no python has the dep', async () => {
    vi.mocked(spawn).mockImplementation((cmd: any, args: any) => {
      const a = (args ?? []) as string[];
      const isImport = a[0] === '-c' && typeof a[1] === 'string' && a[1].includes('faster_whisper');
      if (isImport) return fakeProc('ModuleNotFoundError', 1) as any;
      return fakeProc('ok', 0) as any;
    });
    const engine = getTranscriptionEngine('faster-whisper');
    const status = await engine.isAvailable();
    expect(status.available).toBe(false);
    expect(status.detail).toMatch(/faster-whisper not installed in any Python/);
  });
});

describe('FasterWhisperEngine.transcribe', () => {
  it('parses JSON cues from the bridge stdout', async () => {
    // spawn is called once to probe python (--version), then again for the bridge;
    // each call needs a fresh fake process, so use mockImplementation.
    vi.mocked(spawn).mockImplementation(
      () => fakeProc(JSON.stringify([{ start: 0, end: 2.5, text: 'hello world' }]), 0) as any,
    );
    const engine = getTranscriptionEngine('faster-whisper');
    const cues = await engine.transcribe('/tmp/a.mp3', { model: 'small' });
    expect(cues).toEqual([{ startSec: 0, endSec: 2.5, text: 'hello world' }]);
  });

  it('rejects when the bridge exits non-zero', async () => {
    vi.mocked(spawn).mockImplementation(() => fakeProc('', 1) as any);
    const engine = getTranscriptionEngine('faster-whisper');
    await expect(engine.transcribe('/tmp/a.mp3', { model: 'small' })).rejects.toThrow();
  });
});
