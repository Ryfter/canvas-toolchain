import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A courses root whose local check throws (an unexpected `EACCES` from
 * `statSync`) must fail only its own section — `applySetup` cannot abort the
 * whole patch because one section's readiness check misbehaved.
 */
const { BOGUS_ROOT } = vi.hoisted(() => ({ BOGUS_ROOT: '/var/empty/cc-unreadable-courses-root' }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    // The real pair is what apply's validator calls: `existsSync` says yes, then
    // `statSync` throws the way an unreadable path would.
    existsSync: ((path: Parameters<typeof actual.existsSync>[0]) =>
      String(path) === BOGUS_ROOT ? true : actual.existsSync(path)) as typeof actual.existsSync,
    statSync: ((path: Parameters<typeof actual.statSync>[0], ...rest: unknown[]) => {
      if (String(path) === BOGUS_ROOT) {
        const err = new Error(`EACCES: permission denied, stat '${BOGUS_ROOT}'`) as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      return (actual.statSync as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.statSync,
  };
});

import { applySetup } from '../../src/setup/apply.js';

let ccHome: string;
let cdsHome: string;
const ORIGINAL = {
  ccHome: process.env.CC_HOME,
  cdsHome: process.env.CANVAS_DESIGN_HOME,
};

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-apply-validate-'));
  cdsHome = mkdtempSync(join(tmpdir(), 'cds-apply-validate-'));
  process.env.CC_HOME = ccHome;
  process.env.CANVAS_DESIGN_HOME = cdsHome;
});

afterEach(() => {
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(cdsHome, { recursive: true, force: true });
  if (ORIGINAL.ccHome === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL.ccHome;
  if (ORIGINAL.cdsHome === undefined) delete process.env.CANVAS_DESIGN_HOME;
  else process.env.CANVAS_DESIGN_HOME = ORIGINAL.cdsHome;
  vi.restoreAllMocks();
});

describe('applySetup isolates a section whose validation throws', () => {
  it('reports the throwing section and still runs the sections after it', async () => {
    const result = await applySetup({
      coursesRoot: BOGUS_ROOT,
      spotCheck: { enabled: true },
    });

    expect(result.ok).toBe(false);
    expect(result.sections.map((s) => s.section)).toEqual(['coursesRoot', 'spotCheck']);
    expect(result.sections[0]).toMatchObject({ section: 'coursesRoot', ok: false, code: 'STEP_FAILED' });
    expect(result.sections[0].fix?.length).toBeGreaterThan(0);
    expect(result.sections[1].ok).toBe(true);
  });

  it('isolates a throwing validation on a dry run too', async () => {
    const result = await applySetup({
      coursesRoot: BOGUS_ROOT,
      spotCheck: { enabled: true },
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.sections.map((s) => s.section)).toEqual(['coursesRoot', 'spotCheck']);
    expect(result.sections[0]).toMatchObject({ ok: false, code: 'STEP_FAILED' });
    expect(result.sections[1]).toMatchObject({ ok: true });
  });
});
