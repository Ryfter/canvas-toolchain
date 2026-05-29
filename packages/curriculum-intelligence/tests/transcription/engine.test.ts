import { describe, it, expect } from 'vitest';
import type {
  TranscriptionEngine,
  EngineStatus,
  TranscribeOptions,
} from '../../src/transcription/engine.js';
import type { TranscriptCue } from '../../src/types.js';

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
