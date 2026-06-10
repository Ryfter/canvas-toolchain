import { describe, expect, it } from 'vitest';
import { buildSubmissionPayload, renderIssueBody, renderIssueTitle } from '../../src/feedback/submission.js';
import type { InstitutionProfile } from '../../src/discovery/profile.js';
import { parse as parseYaml } from 'yaml';

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

describe('renderIssueBody', () => {
  it('includes the parser marker and a YAML block that round-trips', () => {
    const payload = buildSubmissionPayload(profile);
    const body = renderIssueBody(payload);
    expect(body).toContain('<!-- canvas-toolchain usage-feedback v1 -->');
    expect(body).toContain('**Mode:** anonymized');
    const yamlMatch = body.match(/```yaml\n([\s\S]*?)\n```/);
    expect(yamlMatch).not.toBeNull();
    const parsed = parseYaml(yamlMatch![1]) as { named: boolean; tools: unknown[] };
    expect(parsed.named).toBe(false);
    expect(parsed.tools).toHaveLength(2);
  });

  it('shows the no-identifiers note when the safe subset is empty', () => {
    const body = renderIssueBody(buildSubmissionPayload({ identifiers: {}, tools: profile.tools }));
    expect(body).toContain('None (anonymized).');
  });
});

describe('renderIssueTitle', () => {
  it('anonymized → generic title with tool count', () => {
    expect(renderIssueTitle(buildSubmissionPayload(profile))).toBe('usage-feedback: anonymous — 2 tools');
  });

  it('named → institution name when an identifier names it, else "named"', () => {
    const withName = buildSubmissionPayload({ identifiers: { institution: 'Boise State' }, tools: [] }, { named: true });
    expect(renderIssueTitle(withName)).toBe('usage-feedback: Boise State — 0 tools');
    const noName = buildSubmissionPayload({ identifiers: { lms: 'canvas' }, tools: profile.tools }, { named: true });
    expect(renderIssueTitle(noName)).toBe('usage-feedback: named — 2 tools');
  });
});

describe('renderIssueTitle — named priority (review I-1)', () => {
  it('prefers institution over a stray name key regardless of insertion order', () => {
    const p = buildSubmissionPayload(
      { identifiers: { name: 'Kevin sandbox', institution: 'Boise State' }, tools: [] },
      { named: true },
    );
    expect(renderIssueTitle(p)).toBe('usage-feedback: Boise State — 0 tools');
  });

  it('falls back to name when no institution key is present', () => {
    const p = buildSubmissionPayload({ identifiers: { name: 'Solo College' }, tools: [] }, { named: true });
    expect(renderIssueTitle(p)).toBe('usage-feedback: Solo College — 0 tools');
  });
});

describe('renderIssueBody — table cell escaping (review I-2)', () => {
  it('escapes pipes and newlines in tool names so the table is not corrupted', () => {
    const p = buildSubmissionPayload({
      identifiers: {},
      tools: [{ id: 'x', name: 'Weird | Tool\nName', scope: 'global', module: 'none', source: 'self-reported' }],
    });
    const body = renderIssueBody(p);
    // the tool row must remain a single physical line with the pipe escaped
    const row = body.split('\n').find((l) => l.includes('Weird'))!;
    expect(row).toContain('Weird \\| Tool Name');
    expect(row.startsWith('| ')).toBe(true);
    // exactly 5 unescaped pipes = 4 columns in this row
    expect((row.match(/(?<!\\)\|/g) || []).length).toBe(5);
  });
});
