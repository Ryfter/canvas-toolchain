import type { Strategy } from './types.js';
import { chunkBySizes } from './types.js';

export const alphabeticalStrategy: Strategy = {
  id: 'alphabetical',
  generateCandidate(records, spec) {
    const ids = [...records].sort((a, b) => a.pseudonym.localeCompare(b.pseudonym)).map((r) => r.canvasId);
    return chunkBySizes(ids, spec.targetSizes);
  },
  misfit() { return 0; }, // deterministic single layout
};
