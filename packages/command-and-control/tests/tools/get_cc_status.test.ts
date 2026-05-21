import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCcStatus } from '../../src/tools/get_cc_status.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('getCcStatus', () => {
  it('reports anthropic key absent when env var not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(false);
  });

  it('reports anthropic key present when env var set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('reports ollama as undefined when not configured', async () => {
    const status = await getCcStatus();
    expect(status.providers.ollama).toBeUndefined();
  });

  it('reports mode and routing from config', async () => {
    const status = await getCcStatus();
    expect(status.mode).toBe('easy');
    expect(status.routing.fast).toBe('anthropic');
  });

  it('reports ci as installed (it is a local dep)', async () => {
    const status = await getCcStatus();
    expect(status.installedPackages.ci).toBe(true);
  });
});
