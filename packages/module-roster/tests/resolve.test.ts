import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveIdentity } from '../src/resolve.js';
import { saveVault } from '../src/vault/store.js';
import type { CanvasUser } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-resolve-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const fetchUser = async (canvasId: string): Promise<CanvasUser | null> =>
  canvasId === '900' ? { canvasId: '900', name: 'Jane Doe', email: 'a@x.edu' } : null;

describe('resolveIdentity', () => {
  beforeEach(() => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
  });

  it('resolves a known pseudonym to the live Canvas name', async () => {
    const r = await resolveIdentity(['SU26-001'], fetchUser);
    expect(r[0]).toEqual({ pseudonym: 'SU26-001', canvasId: '900', name: 'Jane Doe', email: 'a@x.edu', status: 'ok' });
  });

  it('reports unknown pseudonyms', async () => {
    const r = await resolveIdentity(['NOPE-999'], fetchUser);
    expect(r[0]).toMatchObject({ pseudonym: 'NOPE-999', status: 'unknown_pseudonym' });
  });

  it('reports when Canvas can no longer find the user', async () => {
    saveVault([{ studentNumber: '101', canvasId: '404', pseudonym: 'SU26-002', firstSeenTerm: 'SU26' }]);
    const r = await resolveIdentity(['SU26-002'], fetchUser);
    expect(r[0]).toMatchObject({ pseudonym: 'SU26-002', canvasId: '404', status: 'not_in_canvas' });
  });
});
