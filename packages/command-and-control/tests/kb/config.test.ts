import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, getCcHomePath, getCcDataPath, getCcSecretsPath } from '../../src/kb/config.js';
import { DEFAULT_CONFIG } from '../../src/types.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns default config when no file exists', () => {
    const config = loadConfig();
    expect(config.mode).toBe('easy');
    expect(config.providers.anthropic.model).toBe('claude-sonnet-4-6');
    expect(config.providers.ollama).toBeUndefined();
  });

  it('reads saved config back correctly', () => {
    const custom = { ...DEFAULT_CONFIG, mode: 'advanced' as const };
    saveConfig(custom);
    const loaded = loadConfig();
    expect(loaded.mode).toBe('advanced');
  });
});

describe('getCcHomePath', () => {
  it('respects CC_HOME env var', () => {
    expect(getCcHomePath()).toBe(tmpHome);
  });
});

// config.json carries the premium registry token, so it must never be
// world-readable. Skipped on Windows — same convention as setup_canvas.test.ts.
const onPosix = it.skipIf(process.platform === 'win32');

describe('saveConfig storage hardening', () => {
  const configPath = () => join(tmpHome, 'config.json');

  onPosix('writes config.json with owner-only (0o600) permissions', () => {
    saveConfig(DEFAULT_CONFIG);
    expect(statSync(configPath()).mode & 0o777).toBe(0o600);
  });

  onPosix('tightens a looser mode already on disk on the next save', () => {
    // Simulates a config written before this fix (or by an older tool) with
    // default umask permissions.
    writeFileSync(configPath(), JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    chmodSync(configPath(), 0o644);
    expect(statSync(configPath()).mode & 0o777).toBe(0o644);

    saveConfig(DEFAULT_CONFIG);

    expect(statSync(configPath()).mode & 0o777).toBe(0o600);
  });

  onPosix('forces 0o600 even when a stale temp file with loose perms is present', () => {
    // writeFileSync ignores `mode` when the target already exists, so a temp
    // file left by an interrupted save must be chmod'd explicitly.
    writeFileSync(`${configPath()}.tmp`, '{}', 'utf-8');
    chmodSync(`${configPath()}.tmp`, 0o644);

    saveConfig(DEFAULT_CONFIG);

    expect(statSync(configPath()).mode & 0o777).toBe(0o600);
    expect(readdirSync(tmpHome)).toEqual(['config.json']);
  });

  it('leaves no temp file behind and still parses', () => {
    saveConfig(DEFAULT_CONFIG);
    expect(readdirSync(tmpHome)).toEqual(['config.json']);
    expect(JSON.parse(readFileSync(configPath(), 'utf-8')).mode).toBe('easy');
  });

  onPosix('replaces the file through rename, not in-place truncation', () => {
    saveConfig(DEFAULT_CONFIG);
    const before = statSync(configPath()).ino;

    saveConfig({ ...DEFAULT_CONFIG, mode: 'advanced' });

    // An in-place write keeps the inode; tmp + rename swaps it atomically.
    expect(statSync(configPath()).ino).not.toBe(before);
    expect(loadConfig().mode).toBe('advanced');
    expect(existsSync(`${configPath()}.tmp`)).toBe(false);
  });
});

describe('config/data/secrets roots (#200, CT200-04a)', () => {
  const win = {
    platform: 'win32' as const,
    env: { APPDATA: 'C:\\R', LOCALAPPDATA: 'C:\\L' },
    homedir: 'C:\\Users\\p',
    legacyExists: false,
  };

  it('CC_HOME override collapses all three roots to one folder', () => {
    expect(getCcDataPath()).toBe(tmpHome);
    expect(getCcSecretsPath()).toBe(tmpHome);
    expect(getCcHomePath()).toBe(tmpHome);
  });

  it('on win32 the roots are split: config roaming, data local, secrets under local', () => {
    expect(getCcHomePath(win)).toBe('C:\\R\\CanvasToolchain\\CommandAndControl');
    expect(getCcDataPath(win)).toBe('C:\\L\\CanvasToolchain\\CommandAndControl');
    expect(getCcSecretsPath(win)).toBe('C:\\L\\CanvasToolchain\\CommandAndControl\\secrets');
  });

  it('config.json (registry token) is saved under the secrets root', () => {
    saveConfig(DEFAULT_CONFIG);
    expect(existsSync(join(getCcSecretsPath(), 'config.json'))).toBe(true);
  });
});
