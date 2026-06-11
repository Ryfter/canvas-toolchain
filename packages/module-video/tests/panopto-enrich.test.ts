import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js', () => ({
  parseVtt: vi.fn(),
}));

import { parseVtt } from 'curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js';
import {
  BUILTIN_FILLER_WORDS,
  enrichVtt,
  enrichVttFile,
  type EnrichVttOptions,
  type SessionManifestEntry,
} from '../src/panopto/enrich.js';

const MOCK_SESSION: SessionManifestEntry = {
  sessionId: 'a1b2c3d4-0000-0000-0000-000000000001',
  title: 'Week 03: Tableau Intro',
  startTime: '2026-06-01T14:00:00Z',
  duration: 3600,
  filename: '2026-06-01_week-03-tableau-intro.panopto.vtt',
};

const BASE_OPTS: EnrichVttOptions = {
  fillerWords: [...BUILTIN_FILLER_WORDS],
  corrections: [],
  domain: 'example.hosted.panopto.com',
};

beforeEach(() => {
  vi.mocked(parseVtt).mockClear();
});

describe('BUILTIN_FILLER_WORDS', () => {
  it('does not modify BUILTIN_FILLER_WORDS when enrichVtt is called', () => {
    const originalLength = BUILTIN_FILLER_WORDS.length;
    vi.mocked(parseVtt).mockReturnValue([{ startSec: 0, endSec: 5, text: 'Hello students' }]);

    enrichVtt('WEBVTT\n\n', MOCK_SESSION, { ...BASE_OPTS, fillerWords: [...BUILTIN_FILLER_WORDS] });

    expect(BUILTIN_FILLER_WORDS).toHaveLength(originalLength);
  });
});

describe('enrichVtt — filler and corrections', () => {
  it('strips built-in filler words from cue text', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'Hello uh students um welcome' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).not.toContain(' uh ');
    expect(md).not.toContain(' um ');
    expect(md).toContain('Hello');
    expect(md).toContain('students');
    expect(md).toContain('welcome');
  });

  it('applies vocab corrections to cue text', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'The tool KOBE is useful' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, {
      ...BASE_OPTS,
      corrections: [{ from: 'KOBE', to: 'COBE' }],
    });

    expect(md).toContain('COBE');
    expect(md).not.toContain('KOBE');
  });
});

describe('enrichVtt — header', () => {
  it('header contains title, formatted date (UTC), and H:MM:SS duration', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'Hello' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('# Week 03: Tableau Intro');
    expect(md).toContain('Monday, June 1, 2026');
    expect(md).toContain('1:00:00');
  });
});

describe('enrichVtt — deep links', () => {
  it('injects [→ 5:00] link after the first 300-second bucket', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'First bucket content' },
      { startSec: 300, endSec: 305, text: 'Second bucket content' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('[→ 5:00]');
  });

  it('does NOT inject a trailing link after the last bucket', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'First bucket' },
      { startSec: 300, endSec: 305, text: 'Second bucket' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    const lines = md.split('\n').filter((l) => l.trim() !== '');
    const lastLine = lines[lines.length - 1];
    expect(lastLine).not.toMatch(/^\[→/);
  });

  it('link URL contains ?id={sessionId}&start=300', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'First' },
      { startSec: 300, endSec: 305, text: 'Second' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain(`?id=${MOCK_SESSION.sessionId}&start=300`);
  });
});

describe('enrichVtt — key-statement blockquotes', () => {
  it('renders a cue containing a key-statement trigger as a blockquote', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'The reason we use Tableau is efficiency.' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('> The reason we use Tableau is efficiency.');
  });

  it('non-matching cues are prose; matching cues are blockquoted at their position', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'Hello students.' },
      { startSec: 5, endSec: 10, text: 'The reason is efficiency.' },
      { startSec: 10, endSec: 15, text: 'Let us proceed.' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('Hello students.');
    expect(md).toContain('> The reason is efficiency.');
    expect(md).toContain('Let us proceed.');

    const lines = md.split('\n');
    const proseIdx1 = lines.findIndex((l) => l.includes('Hello students.'));
    const blockquoteIdx = lines.findIndex((l) => l.startsWith('> The reason'));
    const proseIdx2 = lines.findIndex((l) => l.includes('Let us proceed.'));
    expect(proseIdx1).toBeLessThan(blockquoteIdx);
    expect(blockquoteIdx).toBeLessThan(proseIdx2);
  });
});

describe('enrichVtt — edge cases', () => {
  it('on empty cues array returns header-only markdown without errors', () => {
    vi.mocked(parseVtt).mockReturnValue([]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('# Week 03: Tableau Intro');
    expect(md).not.toContain('[→');
  });
});
