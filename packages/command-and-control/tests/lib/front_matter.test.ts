import { describe, expect, test } from 'vitest';
import { parseFrontMatter } from '../../src/lib/front_matter.js';

describe('parseFrontMatter', () => {
  test('parses a YAML front-matter block into typed data', () => {
    const raw = `---
title: Week 3 Lecture
week: 3
published: true
---
Body text here.
`;
    const { data } = parseFrontMatter(raw);
    expect(data.title).toBe('Week 3 Lecture');
    expect(data.week).toBe(3);
    expect(data.published).toBe(true);
  });

  test('returns the body after the closing fence', () => {
    const raw = `---
title: X
---

Hello world.
`;
    const { content } = parseFrontMatter(raw);
    expect(content.trim()).toBe('Hello world.');
  });

  test('returns empty data and unchanged content when there is no front matter', () => {
    const raw = 'Just a plain body with no front matter.\nSecond line.\n';
    const { data, content } = parseFrontMatter(raw);
    expect(data).toEqual({});
    expect(content).toBe(raw);
  });

  test('treats an empty front-matter block as empty data', () => {
    const raw = `---
---
Body only.
`;
    const { data, content } = parseFrontMatter(raw);
    expect(data).toEqual({});
    expect(content.trim()).toBe('Body only.');
  });

  test('preserves unknown / non-design keys', () => {
    const raw = `---
sourcePlatform: panopto
sourceId: abc123
deepLinkTemplate: 'https://x/{sourceId}?t={startSeconds}'
---
[0:00] hello
`;
    const { data } = parseFrontMatter(raw);
    expect(data.sourcePlatform).toBe('panopto');
    expect(data.sourceId).toBe('abc123');
    expect(data.deepLinkTemplate).toBe('https://x/{sourceId}?t={startSeconds}');
  });

  test('handles CRLF line endings', () => {
    const raw = '---\r\ntitle: CRLF\r\nweek: 2\r\n---\r\nBody.\r\n';
    const { data, content } = parseFrontMatter(raw);
    expect(data.title).toBe('CRLF');
    expect(data.week).toBe(2);
    expect(content.trim()).toBe('Body.');
  });

  test('returns empty data when the YAML block is malformed', () => {
    const raw = `---
: : : not valid
  - broken
---
Body.
`;
    const { data, content } = parseFrontMatter(raw);
    expect(data).toEqual({});
    expect(content.trim()).toBe('Body.');
  });
});
