import { describe, expect, it } from 'vitest';
import { buildSubmissionPayload } from '../../src/feedback/submission.js';
import type { InstitutionProfile } from '../../src/discovery/profile.js';

const profile: InstitutionProfile = {
  identifiers: { 'Canvas LMS': 'bsu.instructure.com', Panopto: 'bsu.hosted.panopto.com', lms: 'canvas' },
  tools: [
    { id: 'panopto', name: 'Panopto', scope: 'global', module: 'video', source: 'detected' },
    { id: 'iclicker', name: 'iClicker', scope: 'global', module: 'none', source: 'self-reported' },
  ],
};

describe('buildSubmissionPayload', () => {
  it('anonymized (default): drops identifying keys, keeps safe-allowlist keys', () => {
    const p = buildSubmissionPayload(profile);
    expect(p.named).toBe(false);
    expect(p.identifiers).toEqual({ lms: 'canvas' });
    expect(p.tools.map((t) => t.id)).toEqual(['panopto', 'iclicker']);
  });

  it('anonymized with no safe keys → empty identifiers, tools still present', () => {
    const p = buildSubmissionPayload({
      identifiers: { 'Canvas LMS': 'bsu.instructure.com' },
      tools: profile.tools,
    });
    expect(p.identifiers).toEqual({});
    expect(p.tools).toHaveLength(2);
  });

  it('named: keeps the full identifiers map verbatim', () => {
    const p = buildSubmissionPayload(profile, { named: true });
    expect(p.named).toBe(true);
    expect(p.identifiers).toEqual(profile.identifiers);
  });

  it('field-guards tools: strips any key not in SAFE_TOOL_KEYS', () => {
    const dirty = {
      identifiers: {},
      tools: [{ id: 'x', name: 'X', scope: 'global', module: 'none', source: 'detected', apiToken: 'SECRET' }],
    } as unknown as InstitutionProfile;
    const p = buildSubmissionPayload(dirty);
    expect(Object.keys(p.tools[0])).toEqual(['id', 'name', 'scope', 'module', 'source']);
    expect((p.tools[0] as Record<string, unknown>).apiToken).toBeUndefined();
  });
});
