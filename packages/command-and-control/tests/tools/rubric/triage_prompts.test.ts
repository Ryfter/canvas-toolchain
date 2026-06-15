// tests/tools/rubric/triage_prompts.test.ts
import { describe, it, expect } from 'vitest';
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from '../../../src/tools/rubric/triage_prompts.js';
import type { PulledRubric, RubricChangeReport } from '../../../src/tools/rubric/sync_types.js';

const pulled: PulledRubric = {
  source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'Essay' },
  criteria: [{ id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis' }],
};
const change: RubricChangeReport = { status: 'changed', added: [], removed: [], modified: [{ name: 'Thesis', before: 'old', after: 'Clear arguable thesis' }] };

describe('triage_prompts', () => {
  it('system prompt demands strict JSON and the three verdicts', () => {
    expect(TRIAGE_SYSTEM_PROMPT).toMatch(/acceptable/);
    expect(TRIAGE_SYSTEM_PROMPT).toMatch(/needs-update/);
    expect(TRIAGE_SYSTEM_PROMPT).toMatch(/needs-review/);
    expect(TRIAGE_SYSTEM_PROMPT).toMatch(/JSON/);
  });

  it('user prompt embeds rubric, change summary, and the assignment signal', () => {
    const p = buildTriageUserPrompt({ pulled, change, assignmentSignal: 'Assignment now asks for 5 sources.' });
    expect(p).toContain('Thesis');
    expect(p).toContain('Clear arguable thesis');
    expect(p).toContain('Assignment now asks for 5 sources.');
    expect(p).toMatch(/CHANGE SINCE LAST REWRITE/i);
  });

  it('user prompt states when no prior rewrite exists (first-draft)', () => {
    const firstDraftChange = { status: 'first-draft' as const, added: [], removed: [], modified: [] };
    const p = buildTriageUserPrompt({ pulled, change: firstDraftChange, assignmentSignal: '' });
    expect(p).toContain('No prior student rewrite exists.');
    expect(p).toContain('(none provided)');
  });

  it('user prompt states when the rubric is unchanged', () => {
    const unchanged = { status: 'unchanged' as const, added: [], removed: [], modified: [] };
    const p = buildTriageUserPrompt({ pulled, change: unchanged, assignmentSignal: 'Brief.' });
    expect(p).toContain('No change from the last rewrite.');
  });
});
