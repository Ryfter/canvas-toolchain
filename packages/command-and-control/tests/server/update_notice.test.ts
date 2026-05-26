import { describe, it, expect, beforeEach } from 'vitest';
import { getUpdateNotice, resetUpdateState } from '../../src/update/check.js';

beforeEach(() => {
  resetUpdateState();
});

describe('update notice integration', () => {
  it('returns null when no check has set a notice', () => {
    expect(getUpdateNotice()).toBeNull();
  });
});
