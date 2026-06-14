import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { importCsvFileName, importCsvPath, peerAssessmentDir } from '../src/paths.js';

const ORIG = process.env.CC_HOME;
beforeEach(() => { process.env.CC_HOME = join('/tmp', 'cc-home'); });
afterEach(() => { if (ORIG === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = ORIG; });

describe('paths', () => {
  it('peerAssessmentDir lives under CC_HOME', () => {
    expect(peerAssessmentDir()).toBe(join('/tmp', 'cc-home', 'peerassessment'));
  });
  it('importCsvFileName encodes course + sanitized group set', () => {
    expect(importCsvFileName('123', 'Project Teams!')).toBe('peerassessment-import-123-Project-Teams-.csv');
  });
  it('importCsvPath joins the dir and file name', () => {
    expect(importCsvPath('123', 'A B')).toBe(
      join('/tmp', 'cc-home', 'peerassessment', 'peerassessment-import-123-A-B.csv'),
    );
  });
});
