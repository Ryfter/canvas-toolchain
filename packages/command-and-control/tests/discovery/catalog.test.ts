import { describe, expect, it } from 'vitest';
import { loadCatalog, matchIdentifier } from '../../src/discovery/catalog.js';

describe('loadCatalog', () => {
  it('loads entries indexed by id', () => {
    const cat = loadCatalog();
    expect(cat.byId.get('panopto')?.module).toBe('video');
    expect(cat.byId.get('zoom')?.module).toBeNull();
  });

  it('exposes the full pick-list', () => {
    const cat = loadCatalog();
    expect(cat.all.length).toBeGreaterThanOrEqual(10);
    expect(cat.all.every((t) => typeof t.id === 'string' && typeof t.name === 'string')).toBe(true);
  });
});

describe('matchIdentifier', () => {
  it('matches a Canvas tool name/domain to a catalog entry (case-insensitive, substring)', () => {
    const cat = loadCatalog();
    expect(matchIdentifier(cat, 'BSU Hosted Panopto')?.id).toBe('panopto');
    expect(matchIdentifier(cat, 'zoom.us')?.id).toBe('zoom');
  });

  it('returns undefined for an unknown tool', () => {
    const cat = loadCatalog();
    expect(matchIdentifier(cat, 'Acme Whiteboard')).toBeUndefined();
  });
});
