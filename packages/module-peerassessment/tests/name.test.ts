import { describe, it, expect } from 'vitest';
import { splitName } from '../src/name.js';

describe('splitName', () => {
  it('splits "Last, First" (Canvas sortable_name)', () => {
    expect(splitName('Public, Jane Q.')).toEqual({ firstName: 'Jane Q.', lastName: 'Public' });
  });
  it('splits a plain "First Last" display name', () => {
    expect(splitName('Jane Public')).toEqual({ firstName: 'Jane', lastName: 'Public' });
  });
  it('treats a multi-word plain name as first...last', () => {
    expect(splitName('Jane Q Public')).toEqual({ firstName: 'Jane Q', lastName: 'Public' });
  });
  it('puts a single token in lastName with first blank', () => {
    expect(splitName('Cher')).toEqual({ firstName: '', lastName: 'Cher' });
  });
  it('returns blanks for empty input', () => {
    expect(splitName('   ')).toEqual({ firstName: '', lastName: '' });
  });
});
