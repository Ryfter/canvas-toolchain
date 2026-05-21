import { describe, expect, it } from 'vitest';
import { validatePromptSetResource, type PromptSetResource } from '../../src/resources/prompt_set.js';

const validPromptSet: PromptSetResource = {
  manifest: {
    schemaVersion: 1,
    kind: 'prompt',
    id: 'ranks-voice',
    version: '1.0.0',
    slots: ['hero', 'intro', 'x-business-case'],
    tier: 'free',
  },
  promptsJson: {
    hero: {
      prompt: 'Write a hero title for {{topic}} in {{semester}}.',
      outputSchema: { type: 'object', required: ['title', 'subtitle'] },
    },
    intro: {
      prompt: 'Write a concise intro for {{topic}}.',
      outputSchema: { type: 'object' },
    },
    'x-business-case': {
      prompt: 'Write a short case summary for {{courseTopic}}.',
      outputSchema: { title: 'string', summary: 'string' },
    },
  },
};

describe('prompt-set schema validator', () => {
  it('accepts a valid prompt-set resource', () => {
    expect(validatePromptSetResource(validPromptSet)).toEqual([]);
  });

  it('rejects missing manifest fields', () => {
    const invalid = {
      ...validPromptSet,
      manifest: { ...validPromptSet.manifest, slots: [], tier: 'enterprise' },
    } as unknown as PromptSetResource;

    expect(validatePromptSetResource(invalid)).toEqual(
      expect.arrayContaining([
        'manifest.slots must be a non-empty array',
        'manifest.tier must be free or premium',
      ]),
    );
  });

  it('rejects prompts outside the slot vocabulary or manifest slots', () => {
    const invalid: PromptSetResource = {
      ...validPromptSet,
      promptsJson: {
        summary: {
          prompt: 'Write about {{topic}}.',
          outputSchema: { type: 'object' },
        },
      },
    };

    expect(validatePromptSetResource(invalid)).toEqual(
      expect.arrayContaining([
        'prompts.json key summary must be a controlled slot or x-* extension',
        'prompts.json key summary must be declared in manifest.slots',
      ]),
    );
  });

  it('requires non-empty prompts and valid output schemas', () => {
    const invalid: PromptSetResource = {
      ...validPromptSet,
      promptsJson: {
        hero: {
          prompt: '',
          outputSchema: 'object' as unknown as Record<string, unknown>,
        },
      },
    };

    expect(validatePromptSetResource(invalid)).toEqual(
      expect.arrayContaining([
        'prompts.json.hero.prompt must be a non-empty string',
        'prompts.json.hero.outputSchema must be a JSON Schema fragment object',
      ]),
    );
  });

  it('requires camelCase placeholders', () => {
    const invalid: PromptSetResource = {
      ...validPromptSet,
      promptsJson: {
        hero: {
          prompt: 'Write about {{course_topic}} and {{Semester}}.',
          outputSchema: { type: 'object' },
        },
      },
    };

    expect(validatePromptSetResource(invalid)).toEqual(
      expect.arrayContaining([
        'prompts.json.hero.prompt placeholder course_topic must use camelCase',
        'prompts.json.hero.prompt placeholder Semester must use camelCase',
      ]),
    );
  });
});
