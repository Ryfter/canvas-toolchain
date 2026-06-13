import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadMajorBuckets, saveMajorBuckets } from '../../src/buckets/store.js';

let home: string;
const saved = process.env.CC_HOME;
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); if (saved === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = saved; });

describe('major-buckets store', () => {
  it('round-trips per course; returns undefined when absent', () => {
    home = mkdtempSync(join(tmpdir(), 'gb-buckets-'));
    process.env.CC_HOME = home;
    expect(loadMajorBuckets('5')).toBeUndefined();
    saveMajorBuckets('5', { 'IT Management': 'technical', Marketing: 'creative' });
    expect(loadMajorBuckets('5')).toEqual({ 'IT Management': 'technical', Marketing: 'creative' });
  });
});
