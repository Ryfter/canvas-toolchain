import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../src/discovery/catalog.js';
import { matchDetected } from '../../src/discovery/match.js';

const catalog = loadCatalog();
const moduleState = [
  { id: 'video', name: 'Lecture Video', enabled: false, handles: ['panopto', 'zoom'] as string[] },
];

describe('matchDetected', () => {
  it('flags a catalog tool whose module exists, carrying enabled state', () => {
    const r = matchDetected(catalog, moduleState, [{ rawName: 'University Panopto', courses: ['ITM 370'] }]);
    expect(r.matchedModules).toEqual([{ tool: 'panopto', module: 'video', enabled: false }]);
    expect(r.unmatched).toEqual([]);
  });

  it('treats a catalog tool with module:null as unmatched (free-form signal)', () => {
    const r = matchDetected(catalog, moduleState, [{ rawName: 'iClicker' }]);
    expect(r.matchedModules).toEqual([]);
    expect(r.unmatched).toContain('iclicker');
  });

  it('treats a detected tool with no catalog hit as unmatched by raw name', () => {
    const r = matchDetected(catalog, moduleState, [{ rawName: 'Acme Whiteboard' }]);
    expect(r.unmatched).toContain('Acme Whiteboard');
  });

  it('does not suggest a module that is not in the known-module state', () => {
    // catalog maps panopto→video, but if no module state lists video, no suggestion
    const r = matchDetected(catalog, [], [{ rawName: 'Panopto' }]);
    expect(r.matchedModules).toEqual([]);
    expect(r.unmatched).toContain('panopto');
  });
});
