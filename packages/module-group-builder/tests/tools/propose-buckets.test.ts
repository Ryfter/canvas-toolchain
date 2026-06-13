import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { groupBuilderTools } from '../../src/tools.js';
import { loadMajorBuckets } from '../../src/buckets/store.js';

let dir: string; const savedHome = process.env.CC_HOME;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = savedHome;
});

describe('propose_major_buckets tool', () => {
  it('returns a draft map + other[] from a roster file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'gb-tool-'));
    const roster = join(dir, 'roster.csv');
    writeFileSync(roster, 'canvas_id,pseudonym,major\n1,SU26-001,IT Management\n2,SU26-002,Philosophy\n');
    const tool = groupBuilderTools.find((t) => t.schema.name === 'propose_major_buckets')!;
    const res = await tool.handler({ courseId: '5', rosterFile: roster });
    const payload = JSON.parse((res.content[0] as { text: string }).text);
    expect(payload.map).toEqual({ 'IT Management': 'technical', Philosophy: 'other' });
    expect(payload.other).toEqual(['Philosophy']);
  });

  it('persists a reviewed buckets map when given the buckets input', async () => {
    dir = mkdtempSync(join(tmpdir(), 'gb-save-')); process.env.CC_HOME = dir;
    const tool = groupBuilderTools.find((t) => t.schema.name === 'propose_major_buckets')!;
    const buckets = { 'IT Management': 'technical', Philosophy: 'other' };
    const res = await tool.handler({ courseId: '5', buckets });
    const payload = JSON.parse((res.content[0] as { text: string }).text);
    expect(payload.saved).toBe(true);
    expect(typeof payload.path).toBe('string');
    expect(loadMajorBuckets('5')).toEqual(buckets);
  });
});
