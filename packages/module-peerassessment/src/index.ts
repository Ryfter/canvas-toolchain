import { requireCtx, type CanvasToolchainModule, type ModuleContext } from '@canvas-toolchain/module-contract';
import { createPeerAssessmentTools } from './tools.js';

export const MODULE_ID = 'peerassessment';

let ctx: ModuleContext | undefined;

const peerAssessmentModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'PeerAssessment.com Export',
  description:
    'Turn a Canvas group set into a PeerAssessment.com import CSV (Team,Login ID,Email,First Name,' +
    'Last Name,Student ID #). Canvas-first field sourcing with a PeopleSoft+vault fallback for the ' +
    'login/student-id columns a teacher token often withholds. Import-only; writes a local upload file.',
  version: '1.0.0',
  handles: [],
  contractVersion: 2,
  credentials: [
    { kind: 'canvas', required: true, purpose: 'Read the group set and course students to build the import CSV.' },
  ],
  init(c: ModuleContext): void {
    ctx = c;
  },
  tools: createPeerAssessmentTools(() => requireCtx(ctx)),
};

export default peerAssessmentModule;
export { buildPeerAssessmentImport } from './build.js';
