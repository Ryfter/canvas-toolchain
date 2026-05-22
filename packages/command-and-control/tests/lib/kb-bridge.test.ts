import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadKb } from '../../src/lib/kb-bridge.js';

const SAMPLE_TRAJECTORY_ENTRY = JSON.stringify({
  schemaVersion: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  courseId: 'ITM370',
  semesterId: 'Spring-2025',
  priorSemesters: { sameSeason: null, mostRecent: null },
  assignmentCount: 3,
  verdicts: { KEEP: 1, UPDATE: 2, DROP: 0, ADD: 0 },
  perAssignment: [],
  diff: { sameSeason: null, mostRecent: null },
});

const SAMPLE_TOPIC_MAP = JSON.stringify({
  version: 1,
  semesterId: 'Spring-2025',
  ingestedAt: '2026-01-01T00:00:00.000Z',
  course: { canvasId: 1, name: 'ITM 370', courseCode: 'ITM370', termName: null, termStart: null, termEnd: null },
  modules: [],
  assignments: [],
  pages: [],
  discussions: [],
  quizzes: [],
  resourceLinks: [],
});

describe('kb-bridge', () => {
  let tmpCi: string;
  let tmpCds: string;
  let origCiHome: string | undefined;
  let origCdsHome: string | undefined;

  beforeEach(() => {
    tmpCi = mkdtempSync(join(tmpdir(), 'kb-bridge-ci-'));
    tmpCds = mkdtempSync(join(tmpdir(), 'kb-bridge-cds-'));
    origCiHome = process.env.CURRICULUM_INTELLIGENCE_HOME;
    origCdsHome = process.env.CANVAS_DESIGN_HOME;
    process.env.CURRICULUM_INTELLIGENCE_HOME = tmpCi;
    process.env.CANVAS_DESIGN_HOME = tmpCds;
  });

  afterEach(() => {
    if (origCiHome !== undefined) process.env.CURRICULUM_INTELLIGENCE_HOME = origCiHome;
    else delete process.env.CURRICULUM_INTELLIGENCE_HOME;
    if (origCdsHome !== undefined) process.env.CANVAS_DESIGN_HOME = origCdsHome;
    else delete process.env.CANVAS_DESIGN_HOME;
    rmSync(tmpCi, { recursive: true, force: true });
    rmSync(tmpCds, { recursive: true, force: true });
  });

  describe('philosophyKb()', () => {
    it('returns null when philosophy-kb.md is absent', () => {
      const kb = loadKb();
      expect(kb.philosophyKb()).toBeNull();
    });

    it('returns file content when philosophy-kb.md exists', () => {
      writeFileSync(join(tmpCds, 'philosophy-kb.md'), '# Philosophy\nBe curious.');
      const kb = loadKb();
      expect(kb.philosophyKb()).toBe('# Philosophy\nBe curious.');
    });

    it('caches the result on repeated calls', () => {
      writeFileSync(join(tmpCds, 'philosophy-kb.md'), 'v1');
      const kb = loadKb();
      const first = kb.philosophyKb();
      writeFileSync(join(tmpCds, 'philosophy-kb.md'), 'v2');
      expect(kb.philosophyKb()).toBe(first);
    });
  });

  describe('studentPersonas()', () => {
    it('returns null when student-personas.md is absent', () => {
      const kb = loadKb();
      expect(kb.studentPersonas()).toBeNull();
    });

    it('returns file content when student-personas.md exists', () => {
      writeFileSync(join(tmpCds, 'student-personas.md'), '## Personas\nJunior dev.');
      const kb = loadKb();
      expect(kb.studentPersonas()).toBe('## Personas\nJunior dev.');
    });
  });

  describe('courseTrajectory()', () => {
    it('returns null when history.jsonl is absent', () => {
      const kb = loadKb();
      expect(kb.courseTrajectory('ITM370')).toBeNull();
    });

    it('returns parsed entries from history.jsonl', () => {
      const dir = join(tmpCi, 'courses', 'ITM370');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'history.jsonl'), SAMPLE_TRAJECTORY_ENTRY + '\n');
      const kb = loadKb();
      const entries = kb.courseTrajectory('ITM370');
      expect(entries).not.toBeNull();
      expect(entries!.length).toBe(1);
      expect(entries![0].courseId).toBe('ITM370');
      expect(entries![0].verdicts.UPDATE).toBe(2);
    });

    it('returns null for corrupt JSONL', () => {
      const dir = join(tmpCi, 'courses', 'BAD');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'history.jsonl'), 'not json\n');
      const kb = loadKb();
      expect(kb.courseTrajectory('BAD')).toBeNull();
    });
  });

  describe('courseTopicMap()', () => {
    it('returns null when topic-map.json is absent', () => {
      const kb = loadKb();
      expect(kb.courseTopicMap('ITM370', 'Spring-2025')).toBeNull();
    });

    it('returns parsed topic map when present', () => {
      const dir = join(tmpCi, 'courses', 'ITM370', 'semesters', 'Spring-2025');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'topic-map.json'), SAMPLE_TOPIC_MAP);
      const kb = loadKb();
      const map = kb.courseTopicMap('ITM370', 'Spring-2025');
      expect(map).not.toBeNull();
      expect(map!.semesterId).toBe('Spring-2025');
    });
  });

  describe('courseDesignFolder()', () => {
    it('returns null when course folder does not exist', () => {
      const kb = loadKb();
      expect(kb.courseDesignFolder('ITM370')).toBeNull();
    });

    it('returns the folder path when it exists', () => {
      const courseDir = join(tmpCds, 'course', 'ITM370');
      mkdirSync(courseDir, { recursive: true });
      const kb = loadKb();
      expect(kb.courseDesignFolder('ITM370')).toBe(courseDir);
    });
  });
});
