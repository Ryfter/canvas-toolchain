import type { OralAssessmentProvider } from './provider.js';
import { RhetorixProvider } from './providers/rhetorix.js';

/** Resolve the active provider. Default + only provider today: rhetorix. */
export function resolveActiveOralAssessmentProvider(id = 'rhetorix'): OralAssessmentProvider {
  switch (id) {
    case 'rhetorix':
      return new RhetorixProvider();
    default:
      throw new Error(`Unknown oral-assessment provider: '${id}'`);
  }
}
