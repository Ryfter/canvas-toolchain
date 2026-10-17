import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAddressIndex, scoreAnswers } from '../../../../scripts/skills/eval-selection.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const HARNESS = join(REPO_ROOT, 'scripts/skills/eval-selection.mjs');
const FIXTURES = join(REPO_ROOT, 'packages/command-and-control/tests/skills/selection.fixtures.json');
const HARD_FIXTURES = join(REPO_ROOT, 'packages/command-and-control/tests/skills/selection.hard.fixtures.json');
const SKILLS = join(REPO_ROOT, 'packages/command-and-control/skills');
const HAS_DIST = existsSync(join(REPO_ROOT, 'packages/command-and-control/dist/surface/registry.js'));

const opIds = new Set(readdirSync(join(SKILLS, 'ops')).map((file) => file.replace(/\.md$/, '')));

type HardFixture = {
  ask: string; category: string; expectedOp: string; alsoAcceptable?: string[];
  chain?: string[]; decoys: string[]; why: string;
};

const hardFixtures = JSON.parse(readFileSync(HARD_FIXTURES, 'utf8')).fixtures as HardFixture[];
const HARD_CATEGORIES = ['ambiguous-multi', 'chain', 'decoy', 'vague', 'none'];

/** Spawning boots node and imports the built registry (~0.4s idle, slower under
 *  CI contention), so the budget is explicit rather than the 5s default. */
const SPAWN_TIMEOUT_MS = 30_000;

const fixtures = JSON.parse(readFileSync(FIXTURES, 'utf8')).fixtures as Array<{
  ask: string; expectedOp: string; alsoAcceptable?: string[];
}>;

const TOOL_IDS = [
  'ct_setup', 'ct_import', 'ct_inspect', 'ct_analyze', 'ct_plan',
  'ct_build', 'ct_review', 'ct_publish', 'ct_ask', 'ct_advanced',
];

const roots: string[] = [];
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skills-selection-'));
  roots.push(dir);
  return dir;
}

function run(...args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [HARNESS, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const failure = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', status: failure.status ?? 1 };
  }
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scoreAnswers', () => {
  it('counts the expected op for every ask as 18/18', () => {
    const answers = { answers: fixtures.map((fixture, i) => ({ ask: i + 1, op: fixture.expectedOp })) };
    const result = scoreAnswers(fixtures, answers);

    expect(result.total).toBe(18);
    expect(result.correct).toBe(18);
    expect(result.misses).toEqual([]);
  });

  it('accepts an alsoAcceptable alternative and reports the misses', () => {
    const answers = { answers: fixtures.map((fixture, i) => ({ ask: i + 1, op: fixture.expectedOp })) };
    answers.answers[0].op = fixtures[0].alsoAcceptable![0];
    answers.answers[3].op = 'nope';
    const result = scoreAnswers(fixtures, answers);

    expect(result.correct).toBe(17);
    expect(result.misses.map((miss: { ask: number }) => miss.ask)).toEqual([4]);
    expect(result.misses[0]).toMatchObject({ got: 'nope', expected: fixtures[3].expectedOp });
  });

  it('treats a missing answer as a miss rather than a crash', () => {
    const result = scoreAnswers(fixtures, { answers: [] });
    expect(result.correct).toBe(0);
    expect(result.misses).toHaveLength(18);
    expect(result.misses[0].got).toBeNull();
  });
});

describe('buildAddressIndex', () => {
  const operations = [
    { id: 'validate_quiz', exposure: 'intent', intentTool: 'ct_review', intentAction: 'quiz' },
    { id: 'prune_publish_snapshots', exposure: 'advanced' },
    { id: 'map_transcripts_to_weeks', exposure: 'internal' },
  ];

  it('maps an intent-tool address and a ct_advanced op id onto their operation ids', () => {
    const index = buildAddressIndex(operations);
    expect(index.get('ct_review.quiz')).toBe('validate_quiz');
    expect(index.get('ct_advanced.prune_publish_snapshots')).toBe('prune_publish_snapshots');
  });

  it('gives no address to an op ct_advanced cannot run, nor to one with a half-declared pair', () => {
    const index = buildAddressIndex([
      ...operations,
      { id: 'half', exposure: 'intent', intentTool: 'ct_setup' },
    ]);
    expect(index.has('ct_advanced.validate_quiz')).toBe(false);
    expect(index.has('ct_advanced.map_transcripts_to_weeks')).toBe(false);
    expect(index.has('ct_setup.undefined')).toBe(false);
  });
});

describe('scoreAnswers with an address index', () => {
  const fixtures = [
    { ask: 'check a quiz', expectedOp: 'validate_quiz' },
    { ask: 'prune snapshots', expectedOp: 'prune_publish_snapshots' },
    { ask: 'ask the course', expectedOp: 'ask_course' },
  ];
  const addressIndex = buildAddressIndex([
    { id: 'validate_quiz', exposure: 'intent', intentTool: 'ct_review', intentAction: 'quiz' },
    { id: 'prune_publish_snapshots', exposure: 'advanced' },
    { id: 'ask_course', exposure: 'intent', intentTool: 'ct_ask', intentAction: 'ask' },
  ]);

  it('scores an address as the operation it names, in both address forms', () => {
    const result = scoreAnswers(fixtures, {
      answers: [
        { ask: 1, op: 'ct_review.quiz' },
        { ask: 2, op: 'ct_advanced.prune_publish_snapshots' },
        { ask: 3, op: 'ask_course' },
      ],
    }, { addressIndex });

    expect(result.correct).toBe(3);
    expect(result.misses).toEqual([]);
  });

  it('reports the raw answer and the mapping when an address resolves to the wrong op', () => {
    const result = scoreAnswers(fixtures, {
      answers: [
        { ask: 1, op: 'ct_review.quiz' },
        { ask: 2, op: 'ct_advanced.prune_publish_snapshots' },
        { ask: 3, op: 'ct_advanced.ask_course' },
      ],
    }, { addressIndex });

    expect(result.correct).toBe(2);
    expect(result.misses).toEqual([
      expect.objectContaining({ ask: 3, got: 'ct_advanced.ask_course', mapped: null, expected: 'ask_course' }),
    ]);
  });

  it('leaves the raw answer unmapped when no index is supplied', () => {
    const result = scoreAnswers(fixtures, { answers: [{ ask: 1, op: 'ct_review.quiz' }] });
    expect(result.correct).toBe(0);
    expect(result.misses[0]).toMatchObject({ got: 'ct_review.quiz', mapped: null });
  });
});

describe('scoreAnswers with NONE answers and chains', () => {
  const fixtures = [
    { ask: 'grade the essays', expectedOp: 'NONE', alsoAcceptable: [], category: 'none' },
    {
      ask: 'check then rewrite the rubric',
      expectedOp: 'review_canvas_rubric',
      alsoAcceptable: [],
      chain: ['review_canvas_rubric', 'draft_student_rubric'],
      category: 'chain',
    },
    { ask: 'pick the umbrella op', expectedOp: 'analyze_course', alsoAcceptable: ['ingest_canvas_archive'], category: 'ambiguous-multi' },
  ];
  const right = {
    answers: [{ ask: 1, op: 'NONE' }, { ask: 2, op: 'review_canvas_rubric' }, { ask: 3, op: 'analyze_course' }],
  };

  it('counts NONE as correct when the ask is outside the surface', () => {
    const result = scoreAnswers(fixtures, right);
    expect(result.correct).toBe(3);
    expect(result.misses).toEqual([]);
  });

  it('takes NONE case- and whitespace-insensitively', () => {
    const result = scoreAnswers(fixtures, { answers: [{ ask: 1, op: ' none ' }] });
    expect(result.correct).toBe(1);
  });

  it('misses when a real op is offered for a NONE ask', () => {
    const result = scoreAnswers(fixtures, { answers: [{ ask: 1, op: 'validate_quiz' }] });
    expect(result.correct).toBe(0);
    expect(result.misses[0]).toMatchObject({ expected: 'NONE', got: 'validate_quiz' });
  });

  it('scores a chain ask as its first op and rejects the second op alone', () => {
    const first = scoreAnswers(fixtures, { answers: [{ ask: 2, op: 'review_canvas_rubric' }] });
    expect(first.correct).toBe(1);

    const second = scoreAnswers(fixtures, {
      answers: [{ ask: 1, op: 'NONE' }, { ask: 2, op: 'draft_student_rubric' }, { ask: 3, op: 'analyze_course' }],
    });
    expect(second.correct).toBe(2);
    expect(second.misses).toEqual([
      expect.objectContaining({ ask: 2, expected: 'review_canvas_rubric', got: 'draft_student_rubric' }),
    ]);
  });

  it('takes the first chain op as the expected answer even if expectedOp disagrees', () => {
    const drifted = [{ ask: 'chain', expectedOp: 'wrong_op', chain: ['review_canvas_rubric', 'draft_student_rubric'] }];
    const result = scoreAnswers(drifted, { answers: [{ ask: 1, op: 'review_canvas_rubric' }] });
    expect(result.correct).toBe(1);
  });

  it('reports accuracy per category', () => {
    const result = scoreAnswers(fixtures, {
      answers: [{ ask: 1, op: 'NONE' }, { ask: 2, op: 'review_canvas_rubric' }, { ask: 3, op: 'nope' }],
    });
    expect(result.categories).toEqual([
      { category: 'none', total: 1, correct: 1 },
      { category: 'chain', total: 1, correct: 1 },
      { category: 'ambiguous-multi', total: 1, correct: 0 },
    ]);
  });

  it('labels a fixture with no category as uncategorized', () => {
    const result = scoreAnswers([{ ask: 'x', expectedOp: 'ask_course' }], { answers: [{ ask: 1, op: 'ask_course' }] });
    expect(result.categories).toEqual([{ category: 'uncategorized', total: 1, correct: 1 }]);
  });
});

describe('selection.hard.fixtures.json', () => {
  it('holds the 15 hard asks', () => {
    expect(hardFixtures).toHaveLength(15);
  });

  it('uses only the declared categories', () => {
    for (const fixture of hardFixtures) {
      expect(HARD_CATEGORIES, fixture.ask).toContain(fixture.category);
    }
  });

  it('names an op that exists, or the literal NONE', () => {
    for (const fixture of hardFixtures) {
      if (fixture.expectedOp === 'NONE') continue;
      expect(opIds, fixture.ask).toContain(fixture.expectedOp);
    }
  });

  it('reserves expectedOp NONE for the none category and keeps its alternatives empty', () => {
    for (const fixture of hardFixtures) {
      if (fixture.expectedOp === 'NONE') {
        expect(fixture.category, fixture.ask).toBe('none');
        expect(fixture.alsoAcceptable ?? [], fixture.ask).toEqual([]);
      } else {
        expect(fixture.category, fixture.ask).not.toBe('none');
      }
    }
  });

  it('names only real alternatives and decoys, none of them the expected answer', () => {
    for (const fixture of hardFixtures) {
      for (const id of [...(fixture.alsoAcceptable ?? []), ...fixture.decoys]) {
        expect(opIds, `${fixture.ask} -> ${id}`).toContain(id);
        expect(id, fixture.ask).not.toBe(fixture.expectedOp);
      }
    }
  });

  it('makes expectedOp the first op of every chain, and never an acceptable alternative', () => {
    const chains = hardFixtures.filter((fixture) => fixture.chain);
    expect(chains).toHaveLength(3);
    for (const fixture of chains) {
      expect(fixture.category, fixture.ask).toBe('chain');
      expect(fixture.chain![0], fixture.ask).toBe(fixture.expectedOp);
      expect(fixture.chain!.length, fixture.ask).toBeGreaterThan(1);
      expect(fixture.alsoAcceptable ?? [], fixture.ask).not.toContain(fixture.expectedOp);
      for (const id of fixture.chain!) expect(opIds, `${fixture.ask} -> ${id}`).toContain(id);
    }
  });

  it('keeps the asks distinct and every why substantive', () => {
    const asks = new Set<string>();
    for (const fixture of hardFixtures) {
      expect(asks.has(fixture.ask), fixture.ask).toBe(false);
      asks.add(fixture.ask);
      expect(fixture.why.length, fixture.ask).toBeGreaterThan(20);
    }
  });
});

describe.skipIf(!HAS_DIST)('eval-selection CLI scoring', () => {
  it('prints correct/18 and the misses for an answers file', () => {
    const answers = join(tempRoot(), 'answers.json');
    writeFileSync(answers, JSON.stringify({
      answers: fixtures.map((fixture, i) => ({ ask: i + 1, op: i === 2 ? 'nope' : fixture.expectedOp })),
    }));

    const { stdout, status } = run('--score', answers);
    expect(status).toBe(0);
    expect(stdout).toContain('17/18 correct');
    expect(stdout).toContain('miss 3');
    expect(stdout).toContain(fixtures[2].ask);
  }, SPAWN_TIMEOUT_MS);

  it('emits the same result as JSON', () => {
    const answers = join(tempRoot(), 'answers.json');
    writeFileSync(answers, JSON.stringify({
      answers: fixtures.map((fixture, i) => ({ ask: i + 1, op: fixture.expectedOp })),
    }));

    const report = JSON.parse(run('--score', answers, '--json').stdout);
    expect(report).toMatchObject({ command: 'eval-selection', mode: 'score', total: 18, correct: 18 });
    expect(report.misses).toEqual([]);
  }, SPAWN_TIMEOUT_MS);

  it('scores an answer given in the old surface\'s address form as the op it names', () => {
    const answers = join(tempRoot(), 'answers.json');
    // Ask 3 expects rollback_course_publish; answer with the address the old
    // surface advertises for it (`ct_publish` action `rollback`).
    writeFileSync(answers, JSON.stringify({
      answers: fixtures.map((fixture, i) => ({ ask: i + 1, op: i === 2 ? 'ct_publish.rollback' : fixture.expectedOp })),
    }));

    const { stdout, status } = run('--score', answers);
    expect(status).toBe(0);
    expect(stdout).toContain('18/18 correct');
  }, SPAWN_TIMEOUT_MS);

  it('prints the raw address and the op it mapped to when the address names the wrong op', () => {
    const answers = join(tempRoot(), 'answers.json');
    writeFileSync(answers, JSON.stringify({
      answers: fixtures.map((fixture, i) => ({ ask: i + 1, op: i === 2 ? 'ct_publish.snapshots' : fixture.expectedOp })),
    }));

    const { stdout } = run('--score', answers);
    expect(stdout).toContain('17/18 correct');
    expect(stdout).toContain('got ct_publish.snapshots (mapped: list_publish_snapshots)');
  }, SPAWN_TIMEOUT_MS);
});

describe.skipIf(!HAS_DIST)('eval-selection hard-set scoring', () => {
  it('scores the hard set, NONE asks included, and reports accuracy per category', () => {
    const answers = join(tempRoot(), 'answers.json');
    writeFileSync(answers, JSON.stringify({
      answers: hardFixtures.map((fixture, index) => ({ ask: index + 1, op: fixture.expectedOp })),
    }));

    const report = JSON.parse(run('--set', 'hard', '--score', answers, '--json').stdout);
    expect(report).toMatchObject({ command: 'eval-selection', mode: 'score', set: 'hard', total: 15, correct: 15 });
    expect(report.misses).toEqual([]);
    expect(report.categories).toEqual([
      { category: 'ambiguous-multi', total: 3, correct: 3 },
      { category: 'chain', total: 3, correct: 3 },
      { category: 'decoy', total: 3, correct: 3 },
      { category: 'vague', total: 3, correct: 3 },
      { category: 'none', total: 3, correct: 3 },
    ]);
  }, SPAWN_TIMEOUT_MS);

  it('prints per-category accuracy and misses a wrong NONE and a chain second-step answer', () => {
    const answers = join(tempRoot(), 'answers.json');
    const payload = {
      answers: hardFixtures.map((fixture, index) => ({ ask: index + 1, op: fixture.expectedOp })),
    };
    payload.answers[hardFixtures.findIndex((fixture) => fixture.expectedOp === 'NONE')].op = 'publish_course';
    const chainIndex = hardFixtures.findIndex((fixture) => fixture.chain);
    payload.answers[chainIndex].op = hardFixtures[chainIndex].chain![1];
    writeFileSync(answers, JSON.stringify(payload));

    const { stdout, status } = run('--set', 'hard', '--score', answers);
    expect(status).toBe(0);
    expect(stdout).toContain('13/15 correct');
    expect(stdout).toContain('none: 2/3');
    expect(stdout).toContain('chain: 2/3');
    expect(stdout).toContain('expected NONE');
  }, SPAWN_TIMEOUT_MS);

  it('rejects an unknown set rather than silently scoring the wrong fixtures', () => {
    const { status, stderr } = run('--set', 'impossible', '--out', tempRoot());
    expect(status).toBe(1);
    expect(stderr).toContain('--set');
  }, SPAWN_TIMEOUT_MS);
});

describe.skipIf(!HAS_DIST)('eval-selection prompts', () => {
  it('writes old-easy.md (tools + full catalog) and pathc-easy.md (ten tools + topic maps)', () => {
    const out = tempRoot();
    const summary = JSON.parse(run('--set', 'easy', '--out', out, '--json').stdout);
    expect(summary).toMatchObject({ mode: 'prompts', set: 'easy', asks: 18 });

    const old = readFileSync(join(out, 'old-easy.md'), 'utf8');
    const pathc = readFileSync(join(out, 'pathc-easy.md'), 'utf8');

    // old-easy.md: the schema dump plus the full ct_advanced catalog.
    expect(old).toContain('## Public tools (list_tools)');
    expect(old).toContain('"inputSchema"');
    expect(old).toContain('## ct_advanced catalog (describe per section)');
    for (const fixture of fixtures) expect(old, fixture.ask).toContain(fixture.ask);
    expect(old).toContain('{"answers":[{"ask":1,"op":"<operation id>"}');

    // pathc-easy.md: one line per public tool, then every topic map under a
    // heading, with the instruction to read only the map for the tool picked.
    expect(pathc).toContain('## Public tools — pick one');
    expect(pathc).toContain('read ONLY that tool');
    for (const id of TOOL_IDS) expect(pathc, id).toContain(`### ${id}`);
    for (const fixture of fixtures) expect(pathc, fixture.ask).toContain(fixture.ask);
    expect(pathc).toContain('{"answers":[{"ask":1,"op":"<operation id>"}');

    // The topic maps are inline, but the old-surface parameter schemas are not.
    expect(pathc).not.toContain('"inputSchema"');
  }, SPAWN_TIMEOUT_MS);

  it('defaults to the easy set', () => {
    const out = tempRoot();
    const summary = JSON.parse(run('--out', out, '--json').stdout);
    expect(summary).toMatchObject({ set: 'easy', asks: 18 });
    expect(existsSync(join(out, 'old-easy.md'))).toBe(true);
    expect(existsSync(join(out, 'pathc-easy.md'))).toBe(true);
  }, SPAWN_TIMEOUT_MS);

  it('writes the hard prompts with the NONE and first-step instructions', () => {
    const out = tempRoot();
    const summary = JSON.parse(run('--set', 'hard', '--out', out, '--json').stdout);
    expect(summary).toMatchObject({ mode: 'prompts', set: 'hard', asks: 15 });

    for (const file of ['old-hard.md', 'pathc-hard.md']) {
      const text = readFileSync(join(out, file), 'utf8');
      for (const fixture of hardFixtures) expect(text, fixture.ask).toContain(fixture.ask);
      expect(text).toContain('NONE');
      expect(text).toContain('FIRST');
      // The grading metadata stays out of the prompt the model reads.
      expect(text).not.toContain('decoys');
      expect(text).not.toContain('"expectedOp"');
    }
  }, SPAWN_TIMEOUT_MS);

  it('merges both fixture files into one ordered run for --set all', () => {
    const out = tempRoot();
    const summary = JSON.parse(run('--set', 'all', '--out', out, '--json').stdout);
    expect(summary).toMatchObject({ mode: 'prompts', set: 'all', asks: 33 });

    const old = readFileSync(join(out, 'old-all.md'), 'utf8');
    for (const fixture of [...fixtures, ...hardFixtures]) expect(old, fixture.ask).toContain(fixture.ask);
  }, SPAWN_TIMEOUT_MS);
});
