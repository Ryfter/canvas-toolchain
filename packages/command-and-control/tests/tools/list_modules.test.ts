import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listModules } from '../../src/tools/list_modules.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
});
afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

describe('listModules', () => {
  it('lists the real video module as disabled when no manifest', async () => {
    const mods = await listModules();
    const video = mods.find((m) => m.id === 'video');
    expect(video).toBeDefined();
    expect(video!.enabled).toBe(false);
    expect(video!.name.length).toBeGreaterThan(0);
    expect(Array.isArray(video!.handles)).toBe(true);
  });

  it('reflects enabled + activeProvider from the manifest', async () => {
    writeFileSync(
      join(ccHomeDir, 'modules.json'),
      JSON.stringify({ modules: { video: { enabled: true, activeProvider: 'panopto' } } }),
    );
    const video = (await listModules()).find((m) => m.id === 'video')!;
    expect(video.enabled).toBe(true);
    expect(video.activeProvider).toBe('panopto');
  });

  it('is fail-soft: a throwing loader yields a loadError entry, not a throw', async () => {
    const known = {
      broken: async () => {
        throw new Error('boom');
      },
    };
    const mods = await listModules(known as never);
    const broken = mods.find((m) => m.id === 'broken')!;
    expect(broken.loadError).toContain('boom');
    expect(broken.name).toBe('broken');
    expect(broken.handles).toEqual([]);
    expect(broken.enabled).toBe(false);
  });
});
