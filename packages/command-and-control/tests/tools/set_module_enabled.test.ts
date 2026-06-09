import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { setModuleEnabled } from '../../src/tools/set_module_enabled.js';

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

const manifestPath = () => join(ccHomeDir, 'modules.json');

describe('setModuleEnabled', () => {
  it('enables a known module and writes modules.json', async () => {
    const result = await setModuleEnabled({ module: 'video', enabled: true });
    expect(result.ok).toBe(true);
    const written = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    expect(written.modules.video.enabled).toBe(true);
    if (platform() !== 'win32') {
      expect(statSync(manifestPath()).mode & 0o777).toBe(0o600);
    }
  });

  it('records activeProvider when supplied', async () => {
    const result = await setModuleEnabled({ module: 'video', enabled: true, activeProvider: 'panopto' });
    expect(result.ok).toBe(true);
    const written = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    expect(written.modules.video.activeProvider).toBe('panopto');
  });

  it('disables a module', async () => {
    await setModuleEnabled({ module: 'video', enabled: true });
    const result = await setModuleEnabled({ module: 'video', enabled: false });
    expect(result.ok).toBe(true);
    const written = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    expect(written.modules.video.enabled).toBe(false);
  });

  it('preserves sibling module entries on write', async () => {
    writeFileSync(manifestPath(), JSON.stringify({ modules: { other: { enabled: true } } }));
    await setModuleEnabled({ module: 'video', enabled: true });
    const written = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    expect(written.modules.other).toEqual({ enabled: true });
    expect(written.modules.video.enabled).toBe(true);
  });

  it('returns UNKNOWN_MODULE for an unknown id and writes nothing', async () => {
    const result = await setModuleEnabled({ module: 'nope', enabled: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('UNKNOWN_MODULE');
    expect(existsSync(manifestPath())).toBe(false);
  });

  it('returns INVALID_ENABLED for a non-boolean enabled', async () => {
    const result = await setModuleEnabled({ module: 'video', enabled: 'yes' as never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INVALID_ENABLED');
    expect(existsSync(manifestPath())).toBe(false);
  });

  it('tolerates a pre-existing corrupt manifest', async () => {
    writeFileSync(manifestPath(), 'not json');
    const result = await setModuleEnabled({ module: 'video', enabled: true });
    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(manifestPath(), 'utf-8')).modules.video.enabled).toBe(true);
  });
});
