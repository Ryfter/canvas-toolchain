import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { personasPath, generateStudentPersonas, getStudentPersonas } from '../src/tools/personas.js';
import { philosophyKbPath, savePhilosophyKb, getPhilosophyKb } from '../src/tools/philosophy.js';
import { kbDir } from '../src/tools/update-kb.js';
import { configExists } from '../src/config.js';

describe('CANVAS_DESIGN_HOME redirects every Design Studio path (CT200-05)', () => {
  let home: string;
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.CANVAS_DESIGN_HOME;
    home = mkdtempSync(join(tmpdir(), 'cds-redirect-'));
    process.env.CANVAS_DESIGN_HOME = home;
  });
  afterEach(() => {
    process.env.CANVAS_DESIGN_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  });

  it('resolves personas, philosophy and kb under the override, per call', () => {
    expect(personasPath()).toBe(join(home, 'student-personas.md'));
    expect(philosophyKbPath()).toBe(join(home, 'professor-philosophy.md'));
    expect(kbDir()).toBe(join(home, 'kb'));
  });

  it('writes personas and philosophy into the override by default', () => {
    generateStudentPersonas({ count: 1 });
    expect(existsSync(join(home, 'student-personas.md'))).toBe(true);
    expect(getStudentPersonas().exists).toBe(true);
    savePhilosophyKb('# hi');
    expect(existsSync(join(home, 'professor-philosophy.md'))).toBe(true);
    expect(getPhilosophyKb().exists).toBe(true);
  });

  it('looks for institution.json under the override', () => {
    expect(configExists()).toBe(false);
  });
});
