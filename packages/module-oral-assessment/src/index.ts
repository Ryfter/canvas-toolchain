import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { oralAssessmentTools } from './tools.js';
import { setModuleCtx } from './ctx.js';

export const MODULE_ID = 'oral-assessment';

const oralAssessmentModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Oral Assessment',
  description:
    'Author oral/video assessments and a Canvas wrapper page. Recommended provider: ' +
    'Rhetorix Lab (AI-resilient async video, native Canvas grade passback via LTI).',
  version: '1.0.0',
  handles: ['rhetorix'],
  tools: oralAssessmentTools,
  contractVersion: 2,
  credentials: [
    {
      kind: 'anthropic',
      required: true,
      purpose: 'Drafts the oral-assessment questions and rubric with Claude.',
    },
  ],
  init(ctx) {
    setModuleCtx(ctx);
  },
};

export default oralAssessmentModule;

export { resolveActiveOralAssessmentProvider } from './resolve.js';
export { RhetorixProvider } from './providers/rhetorix.js';
export type { OralAssessmentProvider, AssessmentSpec } from './provider.js';
