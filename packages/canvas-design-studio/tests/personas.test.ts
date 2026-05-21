import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  weightedSample,
  poolSample,
  generateStudentPersonas,
  getStudentPersonas,
  RACE_TABLE,
  DISABILITY_TABLE,
  DIMENSION_POOLS,
} from '../src/tools/personas.js';

const TEST_PERSONAS = join(tmpdir(), 'canvas-design-test-personas.md');

// Filesystem hooks used by generateStudentPersonas and getStudentPersonas tests (added in Task 3)
beforeEach(() => { if (existsSync(TEST_PERSONAS)) unlinkSync(TEST_PERSONAS); });
afterEach(() => { if (existsSync(TEST_PERSONAS)) unlinkSync(TEST_PERSONAS); });

describe('weightedSample', () => {
  it('samples race according to weighted distribution', () => {
    // White is 57.8% of the population — over 1000 trials, expect ~578 ± 50
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const result = weightedSample(RACE_TABLE);
      counts[result] = (counts[result] ?? 0) + 1;
    }
    expect(counts['White']).toBeGreaterThan(528);
    expect(counts['White']).toBeLessThan(628);
  });

  it('samples disability status according to weighted distribution', () => {
    // None is 61% of the population — over 1000 trials, expect ~610 ± 50
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const result = weightedSample(DISABILITY_TABLE);
      counts[result] = (counts[result] ?? 0) + 1;
    }
    expect(counts['None']).toBeGreaterThan(560);
    expect(counts['None']).toBeLessThan(660);
  });
});

describe('poolSample', () => {
  it('returns all values from a small pool over many trials', () => {
    // A 5-item pool should have all 5 values appear in 200 draws
    const pool = ['a', 'b', 'c', 'd', 'e'];
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(poolSample(pool));
    expect(seen.size).toBe(5);
  });
});

describe('generateStudentPersonas', () => {
  it('generates 3 personas by default', () => {
    const result = generateStudentPersonas({}, TEST_PERSONAS);
    expect(result).toContain('Count: 3');
    expect(result).toContain('## Persona 1');
    expect(result).toContain('## Persona 2');
    expect(result).toContain('## Persona 3');
    expect(result).not.toContain('## Persona 4');
  });

  it('clamps count below 1 up to 1', () => {
    const result = generateStudentPersonas({ count: 0 }, TEST_PERSONAS);
    expect(result).toContain('Count: 1');
    expect(result).not.toContain('## Persona 2');
  });

  it('clamps count above 20 down to 20', () => {
    const result = generateStudentPersonas({ count: 99 }, TEST_PERSONAS);
    expect(result).toContain('Count: 20');
    expect(result).toContain('## Persona 20');
    expect(result).not.toContain('## Persona 21');
  });

  it('writes the personas file to personasPath', () => {
    expect(existsSync(TEST_PERSONAS)).toBe(false);
    generateStudentPersonas({ count: 1 }, TEST_PERSONAS);
    expect(existsSync(TEST_PERSONAS)).toBe(true);
  });

  it('each persona contains all 23 dimension labels', () => {
    const result = generateStudentPersonas({ count: 1 }, TEST_PERSONAS);
    const labels = [
      '**Age:**', '**Family Situation:**', '**Work and Study Balance:**',
      '**Previous Education:**', '**Subject Strengths:**', '**Subject Weaknesses:**',
      '**Academic Confidence:**', '**Short-Term Goals:**', '**Long-Term Goals:**',
      '**Confidence Levels:**', '**Learning Motivation:**', '**Engagement Style:**',
      '**Preferred Learning Methods:**', '**Technology Comfort Level:**',
      '**Academic Support:**', '**Emotional Support:**', '**Cultural Background:**',
      '**Financial Situation:**', '**Responsiveness to Feedback:**',
      '**Growth Mindset:**', '**Time Management:**',
      '**Race/Ethnic Background:**', '**Learning Disabilities/Challenges:**',
    ];
    for (const label of labels) {
      expect(result).toContain(label);
    }
  });

  it('overwrites the existing file on a second generation call', () => {
    generateStudentPersonas({ count: 2 }, TEST_PERSONAS);
    generateStudentPersonas({ count: 1 }, TEST_PERSONAS);
    const { content } = getStudentPersonas(TEST_PERSONAS);
    expect(content).toContain('Count: 1');
    expect(content).not.toContain('## Persona 2');
  });
});

describe('getStudentPersonas', () => {
  it('returns content and exists: true when file exists', () => {
    generateStudentPersonas({ count: 1 }, TEST_PERSONAS);
    const result = getStudentPersonas(TEST_PERSONAS);
    expect(result.exists).toBe(true);
    expect(result.content).toContain('## Persona 1');
  });

  it('returns template and exists: false when no file', () => {
    const result = getStudentPersonas(TEST_PERSONAS);
    expect(result.exists).toBe(false);
    expect(result.content).toContain('generate_student_personas');
  });

  it('throws with rebuild instruction when file cannot be read', () => {
    // Pass the temp directory itself (a dir, not a file) — existsSync is true but readFileSync throws EISDIR
    const dirPath = tmpdir();
    expect(() => getStudentPersonas(dirPath)).toThrow('generate_student_personas');
  });
});
