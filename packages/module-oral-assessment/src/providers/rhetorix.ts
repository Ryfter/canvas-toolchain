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

  formatAssessment(spec: AssessmentSpec): string {
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const lines: string[] = [
      `# ${spec.title} — paste into Rhetorix Lab assignment creator`,
      '',
      `Prep: ${spec.prepSeconds}s  ·  Response: ${mmss(spec.responseSeconds)}  ·  ` +
        `Randomization: ${spec.randomization.pick} of ${spec.randomization.of}  ·  ` +
        `Attempts: ${spec.attempts}`,
      '',
      '## Questions',
      ...spec.questions.map((q, i) => `${i + 1}. ${q.prompt}`),
      '',
      '## Rubric',
      ...spec.rubricCriteria.map((c) => `- ${c.name} (${c.points} pts): ${c.description}`),
      '',
    ];
    return lines.join('\n');
  }

  buildLaunchUrl(domain: string | undefined): string | null {
    if (!domain || !domain.trim()) return null;
    return `https://${domain.trim()}/lti/launch`;
  }
}
