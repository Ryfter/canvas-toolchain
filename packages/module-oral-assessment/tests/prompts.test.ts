import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildUserPrompt } from '../src/prompts.js';

describe('prompts', () => {
  it('system prompt asks for a strict JSON AssessmentSpec', () => {
    expect(SYSTEM_PROMPT).toContain('JSON');
    expect(SYSTEM_PROMPT).toContain('questions');
    expect(SYSTEM_PROMPT).toContain('rubricCriteria');
  });

  it('brief mode includes the brief and the question count', () => {
    const u = buildUserPrompt({ assignmentBrief: 'Write a memo on pricing.', questionCount: 3, outputPath: '/x.md' });
    expect(u).toContain('ASSIGNMENT BRIEF');
    expect(u).toContain('Write a memo on pricing.');
    expect(u).toContain('3');
  });

  it('topic mode includes topic + learning goal', () => {
    const u = buildUserPrompt({ topic: 'opportunity cost', learningGoal: 'explain trade-offs', outputPath: '/x.md' });
    expect(u).toContain('TOPIC');
    expect(u).toContain('opportunity cost');
    expect(u).toContain('LEARNING GOAL');
    expect(u).toContain('explain trade-offs');
  });
});
