import { describe, expect, it } from 'vitest';
import {
  extractSlotPlaceholders,
  isSlotName,
  validateTemplateResource,
  type TemplateResource,
} from '../../src/resources/template.js';

const validTemplate: TemplateResource = {
  manifest: {
    schemaVersion: 1,
    kind: 'template',
    id: 'comparison-layout-academic',
    version: '1.2.0',
    slots: ['hero', 'intro', 'comparison', 'x-business-case'],
    tags: ['comparison', 'two-column'],
    tier: 'free',
  },
  structureHtml: '<section>{{slot:hero}}</section><section>{{ slot:comparison }}</section><aside>{{slot:x-business-case}}</aside>',
  slotsJson: {
    hero: { required: true, fields: { title: { type: 'string', maxLength: 80 } } },
    comparison: {
      required: true,
      fields: {
        items: { type: 'array', minItems: 2, maxItems: 3 },
        criteria: { type: 'array', minItems: 2 },
      },
    },
    'x-business-case': { fields: { note: { type: 'string' } } },
  },
};

describe('template schema validator', () => {
  it('accepts controlled slots and x-* extensions', () => {
    expect(isSlotName('hero')).toBe(true);
    expect(isSlotName('panopto')).toBe(true);
    expect(isSlotName('x-business-case')).toBe(true);
    expect(isSlotName('business-case')).toBe(false);
  });

  it('extracts slot placeholders from structure.html', () => {
    expect(extractSlotPlaceholders('<h1>{{slot:hero}}</h1><p>{{ slot:intro }}</p>')).toEqual(['hero', 'intro']);
  });

  it('accepts a valid template resource', () => {
    expect(validateTemplateResource(validTemplate)).toEqual([]);
  });

  it('rejects missing manifest fields', () => {
    const invalid = {
      ...validTemplate,
      manifest: { ...validTemplate.manifest, slots: [], tags: 'comparison', tier: 'enterprise' },
    } as unknown as TemplateResource;

    expect(validateTemplateResource(invalid)).toEqual(
      expect.arrayContaining([
        'manifest.slots must be a non-empty array',
        'manifest.tags must be an array',
        'manifest.tier must be free or premium',
      ]),
    );
  });

  it('rejects structure slots outside the vocabulary or manifest slots', () => {
    const invalid: TemplateResource = {
      ...validTemplate,
      structureHtml: '<section>{{slot:summary}}</section>',
    };

    expect(validateTemplateResource(invalid)).toEqual(
      expect.arrayContaining([
        'structure.html slot summary must be a controlled slot or x-* extension',
        'structure.html slot summary must be declared in manifest.slots',
      ]),
    );
  });

  it('rejects invalid slots.json schema fragments', () => {
    const invalid: TemplateResource = {
      ...validTemplate,
      slotsJson: {
        hero: { required: 'yes' as unknown as boolean, fields: { title: { type: 7 } } },
      },
    };

    expect(validateTemplateResource(invalid)).toEqual(
      expect.arrayContaining([
        'slots.json.hero.required must be boolean when provided',
        'slots.json.hero.fields.title.type must be a string or string array when provided',
      ]),
    );
  });
});
