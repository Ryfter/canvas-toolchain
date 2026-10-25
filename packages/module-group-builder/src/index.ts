import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { groupBuilderTools } from './tools.js';
import { setCtx } from './ctx.js';

export const MODULE_ID = 'group-builder';

const groupBuilderModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Group Creator/Maintainer',
  description:
    'Form student teams from Canvas data + a thin roster file, with six strategies and a ' +
    'semester-long no-repeat-pairing memory. PII-free (keyed by Canvas ID + pseudonym).',
  version: '1.0.0',
  handles: [],
  tools: groupBuilderTools,
  contractVersion: 2,
  credentials: [
    { kind: 'canvas', required: true, purpose: 'Read course enrollments and submissions, and optionally create Canvas groups.' },
  ],
  init(ctx) { setCtx(ctx); },
};

export default groupBuilderModule;
export { createGroups, recordGroups } from './run.js';
