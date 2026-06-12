import { describe, it, expect } from 'vitest';
import { oralAssessmentTools } from '../src/tools.js';

describe('oralAssessmentTools', () => {
  it('exposes design_oral_assessment with a required outputPath', () => {
    const t = oralAssessmentTools.find((x) => x.schema.name === 'design_oral_assessment');
    expect(t).toBeDefined();
    const schema = t!.schema.inputSchema as { required?: string[]; properties: Record<string, unknown> };
    expect(schema.required).toContain('outputPath');
    expect(schema.properties.assignmentBrief).toBeDefined();
    expect(schema.properties.topic).toBeDefined();
    expect(schema.properties.learningGoal).toBeDefined();
    expect(typeof t!.handler).toBe('function');
  });
});
