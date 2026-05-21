import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import {
  getPhilosophyKb,
  savePhilosophyKb,
  updatePhilosophyKb,
  PHILOSOPHY_TEMPLATE,
} from '../src/tools/philosophy.js';

const TEST_KB = join(tmpdir(), 'canvas-design-test-philosophy.md');

beforeEach(() => { if (existsSync(TEST_KB)) unlinkSync(TEST_KB); });
afterEach(() => { if (existsSync(TEST_KB)) unlinkSync(TEST_KB); });

describe('getPhilosophyKb', () => {
  it('returns template with exists=false and all section flags false when no file exists', () => {
    const result = getPhilosophyKb(TEST_KB);
    expect(result.exists).toBe(false);
    expect(result.content).toContain('## Core Teaching Philosophy');
    expect(result.content).toContain('Ask the professor these questions');
    expect(result.sections.hasCore).toBe(false);
    expect(result.sections.hasCourseSpecific).toBe(false);
    expect(result.sections.hasQuotes).toBe(false);
    expect(result.sections.hasLectureCaptures).toBe(false);
  });

  it('returns exists=true and all section flags true for a fully populated KB', () => {
    const full = [
      '# Professor Philosophy KB',
      '',
      '## Core Teaching Philosophy',
      '',
      '- AI is an expertise multiplier.',
      '',
      '## Course-Specific Focus',
      '',
      '### ITM 370 — AI Augmented Projects',
      '',
      'Focus on real-world application.',
      '',
      '## Quotes & Aphorisms',
      '',
      '- "Without expertise, you produce zero quality."',
      '',
      '## From Lecture Captures',
      '',
      '- "Domain knowledge matters." — Week 1, 2026-01-15',
      '',
    ].join('\n');
    savePhilosophyKb(full, TEST_KB);
    const result = getPhilosophyKb(TEST_KB);
    expect(result.exists).toBe(true);
    expect(result.sections.hasCore).toBe(true);
    expect(result.sections.hasCourseSpecific).toBe(true);
    expect(result.sections.hasQuotes).toBe(true);
    expect(result.sections.hasLectureCaptures).toBe(true);
  });

  it('returns hasCore=true and hasCourseSpecific=false for a core-only KB', () => {
    const partial = PHILOSOPHY_TEMPLATE.replace(
      '## Core Teaching Philosophy\n',
      '## Core Teaching Philosophy\n\n- Learning by doing is essential.\n'
    );
    savePhilosophyKb(partial, TEST_KB);
    const result = getPhilosophyKb(TEST_KB);
    expect(result.exists).toBe(true);
    expect(result.sections.hasCore).toBe(true);
    expect(result.sections.hasCourseSpecific).toBe(false);
    expect(result.sections.hasQuotes).toBe(false);
    expect(result.sections.hasLectureCaptures).toBe(false);
  });
});

describe('updatePhilosophyKb', () => {
  it('appends entry to Core Teaching Philosophy section', () => {
    savePhilosophyKb(PHILOSOPHY_TEMPLATE, TEST_KB);
    updatePhilosophyKb({ entry: 'Mastery requires deliberate practice.', section: 'core' }, TEST_KB);
    const content = readFileSync(TEST_KB, 'utf-8');
    const coreIdx = content.indexOf('## Core Teaching Philosophy');
    const nextH2 = content.indexOf('\n## ', coreIdx + 1);
    const coreSection = content.slice(coreIdx, nextH2);
    expect(coreSection).toContain('Mastery requires deliberate practice.');
  });

  it('appends to Quotes & Aphorisms formatted as a list item', () => {
    savePhilosophyKb(PHILOSOPHY_TEMPLATE, TEST_KB);
    updatePhilosophyKb({ entry: 'AI is an expertise multiplier.', section: 'quotes' }, TEST_KB);
    const content = readFileSync(TEST_KB, 'utf-8');
    expect(content).toContain('- AI is an expertise multiplier.');
  });

  it('does not double-prefix a quote that already starts with "- "', () => {
    savePhilosophyKb(PHILOSOPHY_TEMPLATE, TEST_KB);
    updatePhilosophyKb({ entry: '- Already a list item.', section: 'quotes' }, TEST_KB);
    const content = readFileSync(TEST_KB, 'utf-8');
    expect(content).not.toContain('- - Already');
    expect(content).toContain('- Already a list item.');
  });

  it('appends to From Lecture Captures formatted as a list item', () => {
    savePhilosophyKb(PHILOSOPHY_TEMPLATE, TEST_KB);
    updatePhilosophyKb({ entry: 'Domain knowledge matters. — Week 1', section: 'lectures' }, TEST_KB);
    const content = readFileSync(TEST_KB, 'utf-8');
    expect(content).toContain('- Domain knowledge matters. — Week 1');
  });

  it('throws when section is "course" but courseKey is missing', () => {
    savePhilosophyKb(PHILOSOPHY_TEMPLATE, TEST_KB);
    expect(() =>
      updatePhilosophyKb({ entry: 'Focus on AI.', section: 'course' }, TEST_KB)
    ).toThrow("courseKey is required when section is 'course'");
  });

  it('creates KB from template then appends when no file exists', () => {
    // TEST_KB is deleted in beforeEach — no setup needed
    updatePhilosophyKb({ entry: 'Learning by doing is essential.', section: 'core' }, TEST_KB);
    const result = getPhilosophyKb(TEST_KB);
    expect(result.exists).toBe(true);
    expect(result.content).toContain('Learning by doing is essential.');
    expect(result.sections.hasCore).toBe(true);
  });

  it('creates a ### subsection for a new courseKey', () => {
    savePhilosophyKb(PHILOSOPHY_TEMPLATE, TEST_KB);
    updatePhilosophyKb({
      entry: 'Focus on real-world AI application.',
      section: 'course',
      courseKey: 'ITM 370 — AI Augmented Projects',
    }, TEST_KB);
    const content = readFileSync(TEST_KB, 'utf-8');
    expect(content).toContain('### ITM 370 — AI Augmented Projects');
    expect(content).toContain('Focus on real-world AI application.');
  });

  it('appends to an existing ### subsection without duplicating the heading', () => {
    const initial = [
      '# Professor Philosophy KB',
      '',
      '## Core Teaching Philosophy',
      '',
      '## Course-Specific Focus',
      '',
      '### ITM 370 — AI Augmented Projects',
      '',
      'First note.',
      '',
      '## Quotes & Aphorisms',
      '',
      '## From Lecture Captures',
      '',
    ].join('\n');
    savePhilosophyKb(initial, TEST_KB);
    updatePhilosophyKb({
      entry: 'Second note.',
      section: 'course',
      courseKey: 'ITM 370 — AI Augmented Projects',
    }, TEST_KB);
    const content = readFileSync(TEST_KB, 'utf-8');
    expect((content.match(/### ITM 370/g) ?? []).length).toBe(1);
    expect(content).toContain('First note.');
    expect(content).toContain('Second note.');
  });

  it('round-trip: savePhilosophyKb with core answers → getPhilosophyKb detects hasCore=true', () => {
    const kb = PHILOSOPHY_TEMPLATE.replace(
      '## Core Teaching Philosophy\n',
      '## Core Teaching Philosophy\n\n- AI is an expertise multiplier.\n- Students who get it ask better questions.\n'
    );
    savePhilosophyKb(kb, TEST_KB);
    const result = getPhilosophyKb(TEST_KB);
    expect(result.exists).toBe(true);
    expect(result.sections.hasCore).toBe(true);
    expect(result.sections.hasCourseSpecific).toBe(false);
  });
});
