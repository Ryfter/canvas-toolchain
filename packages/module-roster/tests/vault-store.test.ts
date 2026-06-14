import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadVault, saveVault, indexByStudentNumber, detectCollision,
} from '../src/vault/store.js';
import type { VaultRecord } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-vault-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const rec = (n: string, c: string, p: string): VaultRecord =>
  ({ studentNumber: n, canvasId: c, pseudonym: p, firstSeenTerm: 'SU26' });

describe('vault store', () => {
  it('returns [] when no vault file exists', () => {
    expect(loadVault()).toEqual([]);
  });

  it('round-trips records and writes the file 0600', () => {
    const recs = [rec('100', '900', 'SU26-001')];
    const path = saveVault(recs);
    expect(loadVault()).toEqual(recs);
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

  it('detects a collision when the same student number maps to a new canvas id', () => {
    const idx = indexByStudentNumber([rec('100', '900', 'SU26-001')]);
    expect(detectCollision(idx, '100', '900')).toBeNull();      // same id -> ok
    expect(detectCollision(idx, '100', '999')).toEqual({
      studentNumber: '100', vaultCanvasId: '900', incomingCanvasId: '999',
    });
    expect(detectCollision(idx, '200', '999')).toBeNull();      // unknown -> ok
  });
});
