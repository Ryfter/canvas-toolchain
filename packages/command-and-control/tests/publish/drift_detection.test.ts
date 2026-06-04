import { describe, expect, it } from 'vitest';
import { hashContent, detectPageDrift } from '../../src/tools/publish/drift_detection.js';

describe('hashContent', () => {
  it('returns SHA-256 hex digest', () => {
    const hash = hashContent('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('two different inputs produce different hashes', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'));
  });
});

describe('detectPageDrift', () => {
  it('returns false when current matches expected hash', () => {
    const drift = detectPageDrift({
      currentCanvasHtml: '<p>x</p>',
      expectedHash: hashContent('<p>x</p>'),
    });
    expect(drift.drifted).toBe(false);
  });

  it('returns true when current differs from expected', () => {
    const drift = detectPageDrift({
      currentCanvasHtml: '<p>changed</p>',
      expectedHash: hashContent('<p>x</p>'),
    });
    expect(drift.drifted).toBe(true);
    expect(drift.actualHash).toBe(hashContent('<p>changed</p>'));
  });

  it('returns drifted=false when expectedHash is null (no baseline)', () => {
    const drift = detectPageDrift({
      currentCanvasHtml: '<p>anything</p>',
      expectedHash: null,
    });
    expect(drift.drifted).toBe(false);
  });
});
