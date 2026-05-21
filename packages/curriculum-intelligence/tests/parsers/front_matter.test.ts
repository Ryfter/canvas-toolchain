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

describe('serializeBriefFile', () => {
  test('round-trips data + body', () => {
    const { data, body } = parseBriefFile(SAMPLE);
    const result = serializeBriefFile(data, body);
    const { data: data2 } = parseBriefFile(result);
    expect(data2['title']).toBe(data['title']);
    expect(data2['week']).toBe(1);
  });
});
