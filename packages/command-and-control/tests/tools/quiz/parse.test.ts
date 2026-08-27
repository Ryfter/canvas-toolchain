import { describe, it, expect } from 'vitest';
import { parseQuizDraft, renderQuizDraft } from '../../../src/tools/quiz/parse.js';
import { QUIZ_DRAFT_SCHEMA } from '../../../src/tools/quiz/types.js';

describe('parseQuizDraft / renderQuizDraft', () => {
  it('round-trips header + questions', () => {
    const md = `---
schema: canvas-toolchain.quiz/v1
week: 3
title: "Week 3 Weekly Quiz"
pageType: weekly-quiz
questionCount: 1
difficultyMix: { easy: 0.4, medium: 0.4, hard: 0.2 }
sources:
  - materials/ch05.md
status: draft
---

## Q1
- **difficulty:** easy
- **type:** multiple_choice
- **stem:** What is 2+2?
- **choices:**
  - A. 3
  - B. 4
  - C. 5
  - D. 6
- **key:** B
`;
    const draft = parseQuizDraft(md);
    expect(draft.header.schema).toBe(QUIZ_DRAFT_SCHEMA);
    expect(draft.header.week).toBe(3);
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]!.stem).toMatch(/2\+2/);
    expect(draft.items[0]!.key).toBe('B');
    expect(draft.items[0]!.choices).toHaveLength(4);

    const again = parseQuizDraft(renderQuizDraft(draft));
    expect(again.header.week).toBe(3);
    expect(again.items[0]!.key).toBe('B');
  });
});
