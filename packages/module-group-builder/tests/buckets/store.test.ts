import { describe, it, expect, afterEach } from 'vitest';
import { initFake } from "../helpers/fake-ctx.js";
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadMajorBuckets, saveMajorBuckets } from '../../src/buckets/store.js';

let home: string;
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); });

describe('major-buckets store', () => {
  it('round-trips per course; returns undefined when absent', () => {
    home = mkdtempSync(join(tmpdir(), 'gb-buckets-'));
    initFake(home);
    expect(loadMajorBuckets('5')).toBeUndefined();
    saveMajorBuckets('5', { 'IT Management': 'technical', Marketing: 'creative' });
    expect(loadMajorBuckets('5')).toEqual({ 'IT Management': 'technical', Marketing: 'creative' });
  });
});
