import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { announcementTools } from './tools.js';

export const MODULE_ID = 'announcements';

const announcementsModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Announcements Auditor',
  description:
    'Find scheduled Canvas announcements whose fire dates are stale (typically after a course copy keeps ' +
    'last term\'s dates) and recreate them with corrected dates. Read-first; creation is confirm-gated; ' +
    'never deletes anything.',
  version: '1.1.0',
  handles: ['announcements'],
  tools: announcementTools,
};

export default announcementsModule;
export { classifyAnnouncements } from './audit.js';
