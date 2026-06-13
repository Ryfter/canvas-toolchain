import type { Strategy } from './types.js';
import { chunkBySizes } from './types.js';
import { shuffle } from '../rng.js';

export const randomStrategy: Strategy = {
  id: 'random',
  generateCandidate(records, spec, rng) {
    const ids = shuffle(records.map((r) => r.canvasId), rng);
    return chunkBySizes(ids, spec.targetSizes);
  },
  misfit() { return 0; }, // any assignment is equally valid
};
