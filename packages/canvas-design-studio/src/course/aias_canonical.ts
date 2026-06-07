import type { AiasLevel } from '@canvas-toolchain/shared-types';

// Attribution: Leon Furze, AI Assessment Scale (AIAS).
// Source: https://aiassessmentscale.com/
// Licensed: Creative Commons BY-NC-SA 4.0.
// The canonical text below is summarized for student-facing display; the
// full original framework lives at the URL above.

export const CANONICAL_AIAS_NOTES: Record<AiasLevel, string> = {
  1: 'No AI permitted — demonstrate knowledge without AI assistance.',
  2: 'AI Planning only — brainstorm and outline; develop and refine ideas independently.',
  3: 'AI Collaboration — draft with AI; you must critically edit, cite, and disclose what you used.',
  4: 'Full AI — use AI throughout; demonstrate critical thinking by directing it strategically.',
  5: 'AI Exploration — leverage AI creatively for novel, innovative approaches.',
};

export const CANONICAL_AIAS_NAMES: Record<AiasLevel, string> = {
  1: 'No AI',
  2: 'AI Planning',
  3: 'AI Collaboration',
  4: 'Full AI',
  5: 'AI Exploration',
};
