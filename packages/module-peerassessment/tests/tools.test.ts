import { describe, it, expect } from 'vitest';
import { peerAssessmentTools } from '../src/tools.js';

describe('peerAssessmentTools', () => {
  it('exposes exactly the build_peerassessment_import tool', () => {
    expect(peerAssessmentTools.map((t) => t.schema.name)).toEqual(['build_peerassessment_import']);
  });
  it('requires courseId and groupSetName', () => {
    const schema = peerAssessmentTools[0].schema;
    expect(schema.inputSchema.required).toEqual(['courseId', 'groupSetName']);
    expect(Object.keys(schema.inputSchema.properties as object)).toEqual(
      ['courseId', 'groupSetName', 'peopleSoftFile', 'outputDir', 'dryRun'],
    );
  });
  it('documents that it writes only a local file', () => {
    expect(peerAssessmentTools[0].schema.description).toMatch(/never to Canvas or the vault/i);
  });
});
