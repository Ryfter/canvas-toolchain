import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildVaultIndex } from '../src/source/vault.js';
import { loadPeopleSoftIndex } from '../src/source/peoplesoft.js';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'pa-cc-'));
  mkdirSync(join(home, 'roster-vault'), { recursive: true });
});

describe('buildVaultIndex', () => {
  it('maps canvas_id -> student_number from the roster vault', () => {
    writeFileSync(join(home, 'roster-vault', 'vault.json'), JSON.stringify({
      records: [{ studentNumber: '900111', canvasId: '100', pseudonym: 'FA26-001', firstSeenTerm: 'FA26' }],
    }));
    const idx = buildVaultIndex(home);
    expect(idx.get('100')).toBe('900111');
  });
  it('returns an empty map when no vault exists', () => {
    expect(buildVaultIndex(home).size).toBe(0);
  });
});

describe('loadPeopleSoftIndex', () => {
  it('returns null when no file is given', () => {
    expect(loadPeopleSoftIndex(home, undefined)).toBeNull();
  });
  it('returns null when no column mapping is remembered', () => {
    const f = join(home, 'ps.csv');
    writeFileSync(f, 'SID,Email,NetID,Name,Major\n900111,jane@u.edu,jpublic,"Public, Jane",IT\n');
    expect(loadPeopleSoftIndex(home, f)).toBeNull();
  });
  it('indexes rows by studentNumber using the remembered mapping', () => {
    writeFileSync(join(home, 'roster-vault', 'column-map.json'), JSON.stringify({
      studentNumber: 'SID', email: 'Email', userId: 'NetID', name: 'Name', major: 'Major',
    }));
    const f = join(home, 'ps.csv');
    writeFileSync(f, 'SID,Email,NetID,Name,Major\n900111,jane@u.edu,jpublic,"Public, Jane",IT\n');
    const idx = loadPeopleSoftIndex(home, f);
    expect(idx?.get('900111')).toMatchObject({ email: 'jane@u.edu', userId: 'jpublic', name: 'Public, Jane' });
  });
});
