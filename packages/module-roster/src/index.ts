import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { rosterTools } from './tools.js';

export const MODULE_ID = 'roster';

const rosterModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Roster & Identity Manager',
  description:
    'Build the PII-free canvas_id,pseudonym,major roster the Group Builder consumes: ingest a ' +
    'PeopleSoft CSV, match students to Canvas, assign stable per-student pseudonyms, AI-normalize ' +
    'majors. Propose->commit; a minimal SIS-anchored vault stores only the identity link.',
  version: '1.0.0',
  handles: [],
  tools: rosterTools,
};

export default rosterModule;
export { proposeRoster } from './propose.js';
export { commitRoster } from './commit.js';
export { resolveIdentity } from './resolve.js';
