import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join, posix } from 'node:path';

// CT200-01b: the canvas store's two homes delegate to the app-path resolver.
// The resolver reads process.platform/process.env and os.homedir(); we stub all
// three so no case touches the real home folder (and the upgrade-window probe
// sees an empty fake home).
const fakeHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (orig) => {
  const real = await orig<typeof import('node:os')>();
  return { ...real, homedir: () => fakeHome.dir };
});

import { canvasDesignHome, canvasStoreLocations, ccHome } from '../src/canvas-store.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const saved: Record<string, string | undefined> = {};
const KEYS = ['CC_HOME', 'CANVAS_DESIGN_HOME', 'APPDATA', 'LOCALAPPDATA'];

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p });
}

beforeEach(() => {
  fakeHome.dir = mkdtempSync(join(tmpdir(), 'cs-paths-'));
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});

afterEach(() => {
  Object.defineProperty(process, 'platform', realPlatform);
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

// The platform is faked as 'linux', so the resolver joins with POSIX rules even on a
// Windows host; expectations must use posix.join, not the host's join.
describe('canvas store homes via the resolver', () => {
  it('POSIX default is the unchanged legacy dot-folder', () => {
    setPlatform('linux');
    expect(ccHome()).toBe(posix.join(fakeHome.dir, '.command-and-control'));
    expect(canvasDesignHome()).toBe(posix.join(fakeHome.dir, '.canvas-design-mcp'));
  });

  it('an env override is used verbatim', () => {
    setPlatform('linux');
    process.env.CC_HOME = '/x/cc';
    process.env.CANVAS_DESIGN_HOME = '/x/cds';
    expect(ccHome()).toBe('/x/cc');
    expect(canvasDesignHome()).toBe('/x/cds');
  });

  it.each(['', '   '])('blank CC_HOME (%j) is treated as unset', (blank) => {
    setPlatform('linux');
    process.env.CC_HOME = blank;
    process.env.CANVAS_DESIGN_HOME = blank;
    expect(ccHome()).toBe(posix.join(fakeHome.dir, '.command-and-control'));
    expect(canvasDesignHome()).toBe(posix.join(fakeHome.dir, '.canvas-design-mcp'));
  });

  it('win32 resolves the secrets roots under %LOCALAPPDATA%', () => {
    setPlatform('win32');
    process.env.APPDATA = 'C:\\Users\\p\\AppData\\Roaming';
    process.env.LOCALAPPDATA = 'C:\\Users\\p\\AppData\\Local';
    expect(ccHome()).toBe('C:\\Users\\p\\AppData\\Local\\CanvasToolchain\\CommandAndControl\\secrets');
    expect(canvasDesignHome()).toBe('C:\\Users\\p\\AppData\\Local\\CanvasToolchain\\CanvasDesignStudio\\secrets');
    expect(canvasStoreLocations().canvasConfig).toContain('canvas-config.json');
  });
});
