import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { announcementTools } from './tools.js';
import { setCtx } from './ctx.js';

export const MODULE_ID = 'announcements';

const announcementsModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Announcements Auditor',
  description:
    'Find scheduled Canvas announcements whose fire dates are stale (typically after a course copy keeps ' +
    'last term\'s dates) and recreate them with corrected dates. Read-first; creation is confirm-gated; ' +
    'never deletes anything.',
  version: '1.2.0',
  handles: ['announcements'],
  tools: announcementTools,
  contractVersion: 2,
  credentials: [
    { kind: 'canvas', required: true, purpose: 'Read a course\'s announcements and create corrected copies of stale ones.' },
  ],
  init(ctx) { setCtx(ctx); },
};

export default announcementsModule;
export { classifyAnnouncements } from './audit.js';
