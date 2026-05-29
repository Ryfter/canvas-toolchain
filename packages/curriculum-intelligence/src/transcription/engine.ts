import type { TranscriptCue } from '../types.js';

export type { TranscriptCue };

export interface EngineStatus {
  available: boolean;
  engine: string;
  detail: string;
  setupSteps?: string[];
}

export interface TranscribeOptions {
  model: string;
  language?: string;
  vocabHints?: string[];
}

export interface TranscriptionEngine {
  readonly name: string;
  isAvailable(): Promise<EngineStatus>;
  transcribe(audioPath: string, opts: TranscribeOptions): Promise<TranscriptCue[]>;
}
