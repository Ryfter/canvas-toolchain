import { describe, expect, test } from 'vitest';
import { parseBriefFile, serializeBriefFile } from '../../src/parsers/front_matter.js';

const SAMPLE = `---
title: "Engage 1 - Introduce Yourself"
week: 1
type: assignment
points: 10
due: TBD
verdict: UPDATE
currency: current
lastTaught: Spring2025
semestersSince: 2
newsHits: 1
staleness: moderate
replacement_recommended: false
---

Introduce yourself to the class.
`;

describe('parseBriefFile', () => {
  test('parses front matter data', () => {
    const { data } = parseBriefFile(SAMPLE);
    expect(data['title']).toBe('Engage 1 - Introduce Yourself');
    expect(data['week']).toBe(1);
    expect(data['replacement_recommended']).toBe(false);
  });

  test('returns body text', () => {
    const { body } = parseBriefFile(SAMPLE);
    expect(body.trim()).toBe('Introduce yourself to the class.');
  });
});

describe('parseBriefFile edge cases', () => {
  test('returns empty data and the original body when there is no front matter', () => {
    const raw = 'Plain assignment text.\nNo front matter here.\n';
    const { data, body } = parseBriefFile(raw);
    expect(data).toEqual({});
    expect(body).toBe(raw);
  });

  test('preserves unknown / namespaced keys (e.g. ci: planning metadata)', () => {
    const raw = `---
title: X
ci_planning: { kept: true }
custom_note: hello
---
Body.
`;
    const { data } = parseBriefFile(raw);
    expect(data['custom_note']).toBe('hello');
    expect(data['ci_planning']).toEqual({ kept: true });
  });
});

describe('serializeBriefFile', () => {
  test('round-trips data + body', () => {
    const { data, body } = parseBriefFile(SAMPLE);
    const result = serializeBriefFile(data, body);
    const { data: data2 } = parseBriefFile(result);
    expect(data2['title']).toBe(data['title']);
    expect(data2['week']).toBe(1);
  });

  test('round-trips a newly added key and preserves scalar types', () => {
    const { data, body } = parseBriefFile(SAMPLE);
    const augmented = { ...data, addedFlag: true, addedCount: 7 };
    const result = serializeBriefFile(augmented, body);
    const { data: data2, body: body2 } = parseBriefFile(result);
    expect(data2['addedFlag']).toBe(true);
    expect(data2['addedCount']).toBe(7);
    expect(data2['replacement_recommended']).toBe(false);
    expect(body2.trim()).toBe('Introduce yourself to the class.');
  });
});
