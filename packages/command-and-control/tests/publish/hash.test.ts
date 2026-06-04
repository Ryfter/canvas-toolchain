import { describe, expect, it } from 'vitest';
import { sha256 } from '../../src/tools/publish/hash.js';

describe('sha256', () => {
  it('returns the canonical sha256 hex digest for a known string', () => {
    // echo -n "" | sha256sum
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // echo -n "abc" | sha256sum
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is deterministic across calls', () => {
    const input = '<p>widget body</p>';
    expect(sha256(input)).toBe(sha256(input));
  });

  it('differs when content differs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});
