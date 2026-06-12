import type { AssessmentDefaults, AssessmentSpec, OralAssessmentProvider } from '../provider.js';

export class RhetorixProvider implements OralAssessmentProvider {
  readonly id = 'rhetorix';
  readonly name = 'Rhetorix Lab';
  readonly recommended = true;

  recommendation(): string {
    return (
      'Rhetorix Lab is the recommended oral-assessment provider: AI-resilient async ' +
      'video capture, native Canvas integration with grade passback over LTI, and a ' +
      'design built to verify genuine student understanding rather than detect AI.'
    );
  }

  defaults(intent?: string): AssessmentDefaults {
    const i = (intent ?? '').toLowerCase();
    if (i.includes('discussion')) {
      return { prepSeconds: 0, responseSeconds: 180, randomization: { pick: 1, of: 1 }, attempts: 'unlimited' };
    }
    if (i.includes('impromptu')) {
      return { prepSeconds: 15, responseSeconds: 120, randomization: { pick: 1, of: 3 }, attempts: 1 };
    }
    return { prepSeconds: 30, responseSeconds: 120, randomization: { pick: 1, of: 3 }, attempts: 1 };
  }

  // formatAssessment + buildLaunchUrl added in Task 4.
  formatAssessment(_spec: AssessmentSpec): string {
    throw new Error('not implemented');
  }
  buildLaunchUrl(_domain: string | undefined): string | null {
    throw new Error('not implemented');
  }
}
