import { describe, it, expect } from 'vitest';
import { chunkTranscript, parseTranscript } from '../../../src/tools/answers/chunking/transcript.js';

const SAMPLE = `---
sourcePlatform: panopto
sourceId: abc-123
deepLinkTemplate: "https://bsu.hosted.panopto.com/Pages/Viewer.aspx?id={sourceId}&start={startSeconds}"
title: "Week 03 - VLOOKUP"
---

[00:00:00] welcome to week three.
[00:00:12] today we cover VLOOKUP.
[00:00:30] which is for vertical lookups.
[00:02:15] now lets do an example.
`;

describe('parseTranscript', () => {
  it('splits frontmatter from body', () => {
    const { frontmatter, body } = parseTranscript(SAMPLE);
    expect(frontmatter.sourcePlatform).toBe('panopto');
    expect(body).toMatch(/\[00:00:00\]/);
  });
});

describe('chunkTranscript', () => {
  it('emits at least one chunk with start/end seconds and rendered deep link', () => {
    const chunks = chunkTranscript(SAMPLE);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const first = chunks[0]!;
    expect(first.startSeconds).toBe(0);
    expect(first.deepLink).toBe('https://bsu.hosted.panopto.com/Pages/Viewer.aspx?id=abc-123&start=0');
  });

  it('emits null deepLink when template is absent', () => {
    const noTemplate = SAMPLE.replace(/deepLinkTemplate:.*$/m, '');
    const chunks = chunkTranscript(noTemplate);
    expect(chunks[0]!.deepLink).toBeNull();
  });
});
