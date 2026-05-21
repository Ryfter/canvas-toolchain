import { describe, expect, test } from 'vitest';
import { parseVtt } from '../../src/parsers/transcript_vtt.js';
import { parseSrt } from '../../src/parsers/transcript_srt.js';

const VTT_SAMPLE = `WEBVTT

00:00:00.000 --> 00:00:04.500
Welcome to week one.

00:00:04.500 --> 00:00:09.200
Today we'll cover prompt engineering basics.
`;

const VTT_WITH_NOTES = `WEBVTT
Kind: captions
Language: en

NOTE this is a comment

1
00:01:00.000 --> 00:01:05.000
Let's talk about chain-of-thought reasoning.
`;

const SRT_SAMPLE = `1
00:00:00,000 --> 00:00:04,500
Welcome to week one.

2
00:00:04,500 --> 00:00:09,200
Today we'll cover prompt engineering basics.
`;

describe('parseVtt', () => {
  test('parses cues with timestamps and text', () => {
    const cues = parseVtt(VTT_SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0].startSec).toBe(0);
    expect(cues[0].endSec).toBe(4.5);
    expect(cues[0].text).toBe('Welcome to week one.');
    expect(cues[1].text).toContain('prompt engineering basics');
  });

  test('skips header metadata and NOTE blocks', () => {
    const cues = parseVtt(VTT_WITH_NOTES);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toContain('chain-of-thought');
    expect(cues[0].startSec).toBe(60);
    expect(cues[0].endSec).toBe(65);
  });

  test('joins multi-line cue text with spaces', () => {
    const multi = `WEBVTT

00:00:00.000 --> 00:00:02.000
Line one
Line two
`;
    const cues = parseVtt(multi);
    expect(cues[0].text).toBe('Line one Line two');
  });
});

describe('parseSrt', () => {
  test('parses SRT cues (comma decimals)', () => {
    const cues = parseSrt(SRT_SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0].startSec).toBe(0);
    expect(cues[0].endSec).toBe(4.5);
    expect(cues[1].text).toContain('prompt engineering basics');
  });
});
