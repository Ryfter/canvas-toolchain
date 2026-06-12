import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractOralAssessmentFromFile } from '../../src/tools/extract_oral_assessment.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('extractOralAssessmentFromFile', () => {
  it('reads flat timing + randomization + launch_url fields', () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-extract-'));
    const p = join(dir, 'oral-assessment.md');
    writeFileSync(p, [
      '---', 'prep_seconds: 30', 'response_seconds: 120',
      'randomize_pick: 1', 'randomize_of: 3', 'attempts: "1"',
      'launch_url: "https://r.edu/lti/launch"', '---', '', '## What to expect', 'Speak.',
    ].join('\n'));
    const oa = extractOralAssessmentFromFile(p);
    expect(oa).toEqual({
      prepSeconds: 30, responseSeconds: 120,
      randomization: { pick: 1, of: 3 }, attempts: '1',
      launchUrl: 'https://r.edu/lti/launch',
    });
  });

  it('returns undefined when timing fields are absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-extract-'));
    const p = join(dir, 'x.md');
    writeFileSync(p, '---\ntitle: "X"\n---\nbody');
    expect(extractOralAssessmentFromFile(p)).toBeUndefined();
  });
});
