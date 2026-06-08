import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { videoTools } from './tools.js';

export const MODULE_ID = 'video';

const videoModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Lecture Video',
  description:
    'Embed lecture videos in Canvas pages and pull transcripts. Providers: Panopto (more coming: Zoom, Teams, Meet, YouTube).',
  version: '1.0.0',
  handles: ['panopto', 'zoom', 'teams', 'meet', 'youtube'],
  tools: videoTools,
};

export default videoModule;

// Re-export provider primitives that C&C workflows orchestrate.
export {
  bulkDownloadPanoptoCaptions,
  type ProgressCallback,
} from './panopto/client.js';
export { enrichVttFile, BUILTIN_FILLER_WORDS, type SessionsManifest } from './panopto/enrich.js';
export { fetchSessionAudio } from './panopto/audio.js';
