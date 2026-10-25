import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  appPaths, legacyAppHome,
  ccConfigHome, ccDataHome, ccSecretsHome,
  cdsConfigHome, cdsDataHome, cdsSecretsHome,
  ciConfigHome, ciDataHome, ciSecretsHome,
  type AppId,
} from '../src/app-paths.js';

interface Case {
  name: string; app: AppId; platform: NodeJS.Platform; env: Record<string, string>; homedir: string;
  legacyExists: boolean; newExists: boolean; ignoreUpgradeWindow: boolean;
  expectConfig: string; expectData: string; expectSecrets: string; expectSource: 'env' | 'default';
}
const here = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(join(here, 'fixtures', 'app-paths-cases.json'), 'utf8')) as { cases: Case[] };
const norm = (p: string) => p.replaceAll('\\', '/');

describe('appPaths (shared fixture)', () => {
  it('fixture is non-trivial', () => expect(cases.length).toBeGreaterThan(50));
  for (const c of cases) {
    it(c.name, () => {
      const r = appPaths(c.app, {
        platform: c.platform, env: c.env, homedir: c.homedir,
        legacyExists: c.legacyExists, newExists: c.newExists, ignoreUpgradeWindow: c.ignoreUpgradeWindow,
      });
      expect(norm(r.config)).toBe(c.expectConfig);
      expect(norm(r.data)).toBe(c.expectData);
      expect(norm(r.secrets)).toBe(c.expectSecrets);
      expect(r.source).toBe(c.expectSource);
    });
  }
});

describe('legacyAppHome', () => {
  it('names the three legacy folders', () => {
    const o = { platform: 'darwin' as const, env: {}, homedir: '/h' };
    expect(legacyAppHome('cc', o)).toBe('/h/.command-and-control');
    expect(legacyAppHome('cds', o)).toBe('/h/.canvas-design-mcp');
    expect(legacyAppHome('ci', o)).toBe('/h/.curriculum-intelligence');
  });
  it('uses win32 separators on win32', () => {
    expect(legacyAppHome('cc', { platform: 'win32', env: {}, homedir: 'C:\\Users\\kev' })).toBe('C:\\Users\\kev\\.command-and-control');
  });
});

describe('convenience accessors', () => {
  it('delegate to appPaths', () => {
    const o = { platform: 'linux' as const, homedir: '/h' };
    expect(ccConfigHome({ ...o, env: { CC_HOME: '/a' } })).toBe('/a');
    expect(ccDataHome({ ...o, env: { CC_HOME: '/a' } })).toBe('/a');
    expect(ccSecretsHome({ ...o, env: { CC_HOME: '/a' } })).toBe('/a');
    expect(cdsConfigHome({ ...o, env: { CANVAS_DESIGN_HOME: '/b' } })).toBe('/b');
    expect(cdsDataHome({ ...o, env: {} })).toBe('/h/.canvas-design-mcp');
    expect(cdsSecretsHome({ ...o, env: {} })).toBe('/h/.canvas-design-mcp');
    expect(ciConfigHome({ ...o, env: { CURRICULUM_INTELLIGENCE_HOME: '/c' } })).toBe('/c');
    expect(ciDataHome({ ...o, env: {} })).toBe('/h/.curriculum-intelligence');
    expect(ciSecretsHome({ ...o, env: {} })).toBe('/h/.curriculum-intelligence');
  });
});
