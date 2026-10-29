import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadVault, saveVault, vaultPath, indexByStudentNumber, detectCollision,
} from '../src/vault/store.js';
import type { VaultRecord } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-vault-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

const rec = (n: string, c: string, p: string): VaultRecord =>
  ({ studentNumber: n, canvasId: c, pseudonym: p, firstSeenTerm: 'SU26' });

describe('vault store', () => {
  it('returns [] when no vault file exists', () => {
    expect(loadVault(home)).toEqual([]);
  });

  it('round-trips records and writes the file 0600', () => {
    const recs = [rec('100', '900', 'SU26-001')];
    const path = saveVault(home, recs);
    expect(loadVault(home)).toEqual(recs);
    // 0o777 mask of the mode should be 0o600 (POSIX); skip the assertion on win32.
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it('indexes records by student number', () => {
    const idx = indexByStudentNumber([rec('100', '900', 'SU26-001'), rec('101', '901', 'SU26-002')]);
    expect(idx.get('100')?.pseudonym).toBe('SU26-001');
    expect(idx.get('999')).toBeUndefined();
  });

  it('keeps the file 0600 after a re-save (overwrite path)', () => {
    saveVault(home, [rec('100', '900', 'SU26-001')]);
    const path = saveVault(home, [rec('100', '900', 'SU26-001'), rec('101', '901', 'SU26-002')]);
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
    expect(loadVault(home)).toHaveLength(2);
  });

  it('detects a collision when the same student number maps to a new canvas id', () => {
    const idx = indexByStudentNumber([rec('100', '900', 'SU26-001')]);
    expect(detectCollision(idx, '100', '900')).toBeNull();      // same id -> ok
    expect(detectCollision(idx, '100', '999')).toEqual({
      studentNumber: '100', vaultCanvasId: '900', incomingCanvasId: '999',
    });
    expect(detectCollision(idx, '200', '999')).toBeNull();      // unknown -> ok
  });

  it('stores the vault under <dir>/roster-vault/vault.json and leaves no tmp file behind', () => {
    const path = saveVault(home, [rec('100', '900', 'SU26-001')]);
    expect(path).toBe(join(home, 'roster-vault', 'vault.json'));
    expect(vaultPath(home)).toBe(path);
    expect(readdirSync(join(home, 'roster-vault'))).toEqual(['vault.json']);
  });

  it('takes its location only from the directory argument (never CC_HOME)', () => {
    const decoy = mkdtempSync(join(tmpdir(), 'roster-vault-decoy-'));
    const other = mkdtempSync(join(tmpdir(), 'roster-vault-other-'));
    const saved = process.env.CC_HOME;
    process.env.CC_HOME = decoy;
    try {
      saveVault(home, [rec('100', '900', 'SU26-001')]);
      expect(loadVault(other)).toEqual([]);
      expect(loadVault(home)).toHaveLength(1);
      expect(existsSync(join(decoy, 'roster-vault'))).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = saved;
      rmSync(decoy, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });
});
