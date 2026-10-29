import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { importCsvFileName, peerAssessmentDir } from '../src/paths.js';

describe('paths', () => {
  it('peerAssessmentDir lives under the given config dir', () => {
    expect(peerAssessmentDir(join('/tmp', 'cfg'))).toBe(join('/tmp', 'cfg', 'peerassessment'));
  });
  it('importCsvFileName encodes course + sanitized group set', () => {
    expect(importCsvFileName('123', 'Project Teams!')).toBe('peerassessment-import-123-Project-Teams-.csv');
  });
});
