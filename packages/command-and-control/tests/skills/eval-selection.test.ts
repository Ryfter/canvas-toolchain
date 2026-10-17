import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAddressIndex, scoreAnswers } from '../../../../scripts/skills/eval-selection.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const HARNESS = join(REPO_ROOT, 'scripts/skills/eval-selection.mjs');
const FIXTURES = join(REPO_ROOT, 'packages/command-and-control/tests/skills/selection.fixtures.json');
const HAS_DIST = existsSync(join(REPO_ROOT, 'packages/command-and-control/dist/surface/registry.js'));

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

describe.skipIf(!HAS_DIST)('eval-selection prompts', () => {
  it('writes old.md (tools + full catalog) and pathc.md (ten tools + topic maps)', () => {
    const out = tempRoot();
    const summary = JSON.parse(run('--out', out, '--json').stdout);
    expect(summary).toMatchObject({ mode: 'prompts', asks: 18 });

    const old = readFileSync(join(out, 'old.md'), 'utf8');
    const pathc = readFileSync(join(out, 'pathc.md'), 'utf8');

    // old.md: the schema dump plus the full ct_advanced catalog.
    expect(old).toContain('## Public tools (list_tools)');
    expect(old).toContain('"inputSchema"');
    expect(old).toContain('## ct_advanced catalog (describe per section)');
    for (const fixture of fixtures) expect(old, fixture.ask).toContain(fixture.ask);
    expect(old).toContain('{"answers":[{"ask":1,"op":"<operation id>"}');

    // pathc.md: one line per public tool, then every topic map under a heading,
    // with the instruction to read only the map for the tool picked.
    expect(pathc).toContain('## Public tools — pick one');
    expect(pathc).toContain('read ONLY that tool');
    for (const id of TOOL_IDS) expect(pathc, id).toContain(`### ${id}`);
    for (const fixture of fixtures) expect(pathc, fixture.ask).toContain(fixture.ask);
    expect(pathc).toContain('{"answers":[{"ask":1,"op":"<operation id>"}');

    // The topic maps are inline, but the old-surface parameter schemas are not.
    expect(pathc).not.toContain('"inputSchema"');
  }, SPAWN_TIMEOUT_MS);
});
