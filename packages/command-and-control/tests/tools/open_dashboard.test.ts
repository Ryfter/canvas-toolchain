import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDashboard } from '../../src/tools/open_dashboard.js';

let ccHomeDir: string;
let coursesDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  coursesDir = mkdtempSync(join(tmpdir(), 'courses-'));
  process.env.CC_HOME = ccHomeDir;
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  rmSync(coursesDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

function seedConfig(extras: Record<string, unknown> = {}) {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'config.json'),
    JSON.stringify({ mode: 'auto', providers: { anthropic: {} }, routing: {}, lastRun: {}, ...extras }));
}

describe('openDashboard', () => {
  it('happy path: returns ok=true with url + port + coursesRoot + courseCount', async () => {
    seedConfig({ coursesRoot: coursesDir });

    const result = await openDashboard({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(result.port).toBeGreaterThan(0);
    expect(result.coursesRoot).toBe(coursesDir);
    expect(result.courseCount).toBe(0);
  });

  it('returns COURSES_ROOT_NOT_SET when config has no coursesRoot', async () => {
    seedConfig({});

    const result = await openDashboard({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('COURSES_ROOT_NOT_SET');
  });

  it('returns COURSES_ROOT_NOT_FOUND when coursesRoot points to missing directory', async () => {
    seedConfig({ coursesRoot: join(coursesDir, 'nonexistent') });

    const result = await openDashboard({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('COURSES_ROOT_NOT_FOUND');
  });
});
