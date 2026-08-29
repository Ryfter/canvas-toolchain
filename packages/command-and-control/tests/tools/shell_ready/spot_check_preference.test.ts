import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadSpotCheckPreference,
  saveSpotCheckPreference,
} from '../../../src/tools/shell_ready/spot_check_preference.js';
import { setupSpotCheck } from '../../../src/tools/workflows/setup_spot_check.js';
import { getCcStatus } from '../../../src/tools/get_cc_status.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-spot-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('spot_check_preference', () => {
  it('returns null when file absent', () => {
    expect(loadSpotCheckPreference()).toBeNull();
  });

  it('saves and loads preference with 0o600', () => {
    const saved = saveSpotCheckPreference({
      weeklyCheckEnabled: true,
      weeklyCheckDay: 'sunday',
    });
    expect(saved.weeklyCheckEnabled).toBe(true);
    expect(saved.weeklyCheckDay).toBe('sunday');
    expect(saved.updatedAt).toMatch(/^\d{4}-/);
    const mode = statSync(join(tmpHome, 'spot-check.json')).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(loadSpotCheckPreference()?.weeklyCheckDay).toBe('sunday');
  });
});

describe('setupSpotCheck', () => {
  it('defaults day to saturday when enabling without day', () => {
    const r = setupSpotCheck({ enabled: true });
    expect(r.ok).toBe(true);
    expect(r.preference?.weeklyCheckDay).toBe('saturday');
    expect(r.preference?.weeklyCheckEnabled).toBe(true);
    expect(r.message).toMatch(/anytime/i);
  });

  it('disables weekly check', () => {
    setupSpotCheck({ enabled: true, day: 'friday' });
    const r = setupSpotCheck({ enabled: false });
    expect(r.preference?.weeklyCheckEnabled).toBe(false);
    expect(r.preference?.weeklyCheckDay).toBe('friday');
  });
});

describe('getCcStatus spotCheck', () => {
  it('reports configured/enabled/day presence-only', async () => {
    let status = await getCcStatus();
    expect(status.spotCheck).toEqual({ configured: false, enabled: false, day: null });
    setupSpotCheck({ enabled: true, day: 'saturday' });
    status = await getCcStatus();
    expect(status.spotCheck).toEqual({ configured: true, enabled: true, day: 'saturday' });
    const dumped = JSON.stringify(status);
    expect(dumped).not.toContain('spot-check.json');
  });
});
