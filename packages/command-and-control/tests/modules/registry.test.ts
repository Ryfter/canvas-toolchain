import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModules, knownModuleIds, KNOWN_MODULES } from '../../src/modules/registry.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-reg-')); process.env.CC_HOME = dir; });
afterEach(() => { delete process.env.CC_HOME; rmSync(dir, { recursive: true, force: true }); });

describe('loadModules', () => {
  it('exposes no module tools when manifest absent', async () => {
    const { tools, handlers } = await loadModules();
    expect(tools.find((t) => t.name === 'video_embed')).toBeUndefined();
    expect(handlers.has('video_embed')).toBe(false);
  });

  it('exposes video tools when enabled', async () => {
    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: true, activeProvider: 'panopto' } } }));
    const { tools, handlers } = await loadModules();
    expect(tools.find((t) => t.name === 'video_embed')).toBeDefined();
    expect(handlers.has('video_embed')).toBe(true);
    expect(handlers.has('embed_panopto_video')).toBe(true);
  });

  it('hides video tools when disabled', async () => {
    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: false } } }));
    const { tools } = await loadModules();
    expect(tools.find((t) => t.name === 'video_embed')).toBeUndefined();
  });

  it('skips a module whose loader throws (fail-soft) and still loads good ones', async () => {
    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: true }, broken: { enabled: true } } }));
    const known = {
      video: async () => (await import('@canvas-toolchain/module-video')).default,
      broken: async () => { throw new Error('boom'); },
    };
    const { tools, handlers } = await loadModules(known as any);
    // good module still loaded:
    expect(handlers.has('video_embed')).toBe(true);
    // broken module skipped, no throw:
    expect(tools.find((t) => t.name === undefined)).toBeUndefined();
  });
});

describe('knownModuleIds', () => {
  it('returns the ids of the known-module map', () => {
    expect(knownModuleIds()).toEqual(Object.keys(KNOWN_MODULES));
  });
  it('includes video', () => {
    expect(knownModuleIds()).toContain('video');
  });
  it('honors an injected known map', () => {
    expect(knownModuleIds({ foo: async () => ({} as never) })).toEqual(['foo']);
  });
});

describe('oral-assessment is a known module', () => {
  it('appears in knownModuleIds', () => {
    expect(knownModuleIds()).toContain('oral-assessment');
  });
});

describe('group-builder is a known module', () => {
  it('group-builder is a known module', () => {
    expect(knownModuleIds()).toContain('group-builder');
  });
});

describe('roster is a known module', () => {
  it('includes the roster module', () => {
    expect(knownModuleIds()).toContain('roster');
  });
});
