import { describe, expect, it } from 'vitest';
import { ADVANCED_MOC_ID, assignMocs, mocIdsFor, seedRelated } from '../../../../scripts/skills/lib/graph.mjs';

const op = (id: string, section: string, extra: Record<string, unknown> = {}) => ({
  id,
  section,
  description: `Does ${id}.`,
  exposure: 'advanced',
  ...extra,
});

const source = {
  operations: [
    op('setup_cc', 'admin', { exposure: 'intent', intentTool: 'ct_setup', intentAction: 'cc' }),
    op('get_cc_status', 'admin', { exposure: 'intent', intentTool: 'ct_setup', intentAction: 'status' }),
    op('install_module', 'modules', { exposure: 'advanced' }),
    op('paste_layout', 'design', { exposure: 'advanced' }),
    op('map_transcripts_to_weeks', 'transcripts', { exposure: 'internal' }),
  ],
  sections: [
    { id: 'modules', description: 'Module discovery.' },
    { id: 'transcripts', description: 'Transcripts.' },
    { id: 'design', description: 'Design.' },
    { id: 'admin', description: 'Admin.' },
  ],
  intentTools: [
    { id: 'ct_setup', summary: 'Configure things.', extendedBy: 'admin' },
    { id: 'ct_build', summary: 'Generate things.', extendedBy: 'design' },
  ],
};

describe('mocIdsFor', () => {
  it('files an intent op under its intent tool and its section', () => {
    expect(mocIdsFor(source.operations[0])).toEqual(['ct_setup', 'admin']);
  });

  it('files an advanced op under ct_advanced and its section', () => {
    expect(mocIdsFor(source.operations[2])).toEqual([ADVANCED_MOC_ID, 'modules']);
  });

  it('files an internal op under its section only', () => {
    expect(mocIdsFor(source.operations[4])).toEqual(['transcripts']);
  });
});

describe('assignMocs', () => {
  const mocs = assignMocs(source);

  it('emits one MOC per section, per intent tool, plus ct_advanced', () => {
    expect(mocs.map((m) => m.id)).toEqual([
      'ct_setup', 'ct_build', ADVANCED_MOC_ID,
      'modules', 'transcripts', 'design', 'admin',
    ]);
  });

  it('places every operation in at least one MOC', () => {
    const placed = new Set(mocs.flatMap((m) => m.opIds));
    for (const operation of source.operations) expect(placed).toContain(operation.id);
  });

  it('places each operation in exactly the MOCs mocIdsFor names', () => {
    for (const operation of source.operations) {
      const owning = mocs.filter((m) => m.opIds.includes(operation.id)).map((m) => m.id);
      expect(owning).toEqual(mocIdsFor(operation));
    }
  });

  it('emits empty MOCs rather than dropping a declared section or intent tool', () => {
    const ctBuild = mocs.find((m) => m.id === 'ct_build');
    expect(ctBuild?.opIds).toEqual([]);
  });

  it('keeps section MOCs ordered by the registry order of their operations', () => {
    const design = mocs.find((m) => m.id === 'design');
    expect(design?.opIds).toEqual(['paste_layout']);
  });

  it('links a section MOC to the intent tools that have operations in it', () => {
    expect(mocs.find((m) => m.id === 'admin')?.related).toEqual(['ct_setup']);
    expect(mocs.find((m) => m.id === 'modules')?.related).toEqual([ADVANCED_MOC_ID]);
  });

  it('links an intent MOC to the section that extends it', () => {
    expect(mocs.find((m) => m.id === 'ct_setup')?.related).toEqual(['admin']);
  });
});

describe('seedRelated', () => {
  it('links operations that share an intent tool, excluding self', () => {
    const related = seedRelated(source.operations);
    expect(related.get('setup_cc')).toEqual(['get_cc_status']);
    expect(related.get('get_cc_status')).toEqual(['setup_cc']);
  });

  it('falls back to the section for operations with no intent tool', () => {
    const related = seedRelated(source.operations);
    expect(related.get('paste_layout')).toEqual([]);
    expect(related.get('install_module')).toEqual([]);
  });

  it('links a section-only op to the other ops in its section', () => {
    const twoAdvanced = [op('x', 'design'), op('y', 'design')];
    expect(seedRelated(twoAdvanced).get('x')).toEqual(['y']);
  });

  it('is deterministic: the same input yields the same map', () => {
    expect([...seedRelated(source.operations)]).toEqual([...seedRelated(source.operations)]);
  });

  it('caps the seed so a large section cannot produce an unusable link farm', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      op(`a${i}`, 'admin', { exposure: 'intent', intentTool: 'ct_setup', intentAction: `a${i}` }));
    expect(seedRelated(many, { max: 3 }).get('a0')).toEqual(['a1', 'a2', 'a3']);
  });
});
