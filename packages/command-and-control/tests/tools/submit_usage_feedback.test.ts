import { describe, expect, it, vi } from 'vitest';
import { submitUsageFeedback, makeGhRunner } from '../../src/tools/submit_usage_feedback.js';
import type { InstitutionProfile } from '../../src/discovery/profile.js';

const profile: InstitutionProfile = {
  identifiers: { lms: 'canvas', 'Canvas LMS': 'bsu.instructure.com' },
  tools: [{ id: 'panopto', name: 'Panopto', scope: 'global', module: 'video', source: 'detected' }],
};

function ghSpy(overrides: Partial<{ available: boolean; url: string; throwOnCreate: boolean }> = {}) {
  return {
    available: vi.fn(async () => overrides.available ?? true),
    createIssue: vi.fn(async () => {
      if (overrides.throwOnCreate) throw new Error('gh boom');
      return overrides.url ?? 'https://github.com/Ryfter/canvas-toolchain/issues/123';
    }),
  };
}

describe('submitUsageFeedback', () => {
  it('review stage (no confirm): returns body, never touches gh', async () => {
    const gh = ghSpy();
    const r = await submitUsageFeedback({}, { load: () => profile, gh });
    expect(r.ok).toBe(true);
    if (r.ok && r.stage === 'review') {
      expect(r.body).toContain('## Tools');
      expect(r.title).toContain('usage-feedback:');
    } else throw new Error('expected review stage');
    expect(gh.available).not.toHaveBeenCalled();
    expect(gh.createIssue).not.toHaveBeenCalled();
  });

  it('send stage (confirm:true, gh available): creates the issue and returns the URL', async () => {
    const gh = ghSpy({ url: 'https://github.com/Ryfter/canvas-toolchain/issues/7' });
    const r = await submitUsageFeedback({ confirm: true }, { load: () => profile, gh });
    expect(r).toEqual({ ok: true, stage: 'submitted', issueUrl: 'https://github.com/Ryfter/canvas-toolchain/issues/7' });
    expect(gh.createIssue).toHaveBeenCalledOnce();
    expect(gh.createIssue.mock.calls[0][0].label).toBe('usage-feedback');
  });

  it('send stage with gh unavailable → GH_UNAVAILABLE, createIssue never called', async () => {
    const gh = ghSpy({ available: false });
    const r = await submitUsageFeedback({ confirm: true }, { load: () => profile, gh });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('GH_UNAVAILABLE');
    expect(gh.createIssue).not.toHaveBeenCalled();
  });

  it('empty profile → NO_PROFILE, gh never called', async () => {
    const gh = ghSpy();
    const r = await submitUsageFeedback({ confirm: true }, { load: () => ({ identifiers: {}, tools: [] }), gh });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NO_PROFILE');
    expect(gh.available).not.toHaveBeenCalled();
  });

  it('createIssue throws → GH_SUBMIT_FAILED with the error surfaced', async () => {
    const gh = ghSpy({ throwOnCreate: true });
    const r = await submitUsageFeedback({ confirm: true }, { load: () => profile, gh });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('GH_SUBMIT_FAILED');
      expect(r.message).toContain('gh boom');
    }
  });

  it('named:true rides the full identifiers into the rendered body', async () => {
    const gh = ghSpy();
    const r = await submitUsageFeedback({ named: true }, { load: () => profile, gh });
    if (r.ok && r.stage === 'review') expect(r.body).toContain('bsu.instructure.com');
    else throw new Error('expected review stage');
  });
});

describe('makeGhRunner (default runner)', () => {
  it('exposes available() + createIssue() and available() resolves to a boolean', async () => {
    const runner = makeGhRunner('Ryfter/canvas-toolchain');
    expect(typeof runner.available).toBe('function');
    expect(typeof runner.createIssue).toBe('function');
    const avail = await runner.available();
    expect(typeof avail).toBe('boolean'); // true or false depending on the box; must not throw
  });
});
