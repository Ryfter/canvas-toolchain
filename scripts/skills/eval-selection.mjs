#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, parseArgs, runMain, SELECTION_FLAGS } from './lib/cli.mjs';
import { REPO_ROOT, SKILLS_ROOT, loadRegistrySource, loadSurfaceProbe } from './lib/registry.mjs';

const EASY_FIXTURES = join(REPO_ROOT, 'packages/command-and-control/tests/skills/selection.fixtures.json');
const HARD_FIXTURES = join(REPO_ROOT, 'packages/command-and-control/tests/skills/selection.hard.fixtures.json');
const DEFAULT_OUT = '/tmp/ct-selection';
const DEFAULT_SET = 'easy';

/**
 * The fixture files each `--set` value draws from. `all` is the union in this
 * order, so an `all` run stays one ordered list: the ask numbers its prompts
 * print and the ask numbers a score reads are the same list.
 */
const SET_FILES = {
  easy: [EASY_FIXTURES],
  hard: [HARD_FIXTURES],
  all: [EASY_FIXTURES, HARD_FIXTURES],
};

export const SET_NAMES = Object.keys(SET_FILES);

/** The answer a model gives when no operation fits the ask. */
const NONE = 'NONE';

/** The ten public tools whose topic maps path C hands the model. */
const TOOL_MOC_IDS = [
  'ct_setup', 'ct_import', 'ct_inspect', 'ct_analyze', 'ct_plan',
  'ct_build', 'ct_review', 'ct_publish', 'ct_ask', 'ct_advanced',
];

export function loadFixtures(path = EASY_FIXTURES) {
  return JSON.parse(readFileSync(path, 'utf8')).fixtures;
}

/** The ordered fixture list for a `--set` value, validated rather than guessed. */
export function loadSet(set = DEFAULT_SET) {
  if (!Object.hasOwn(SET_FILES, set)) {
    throw new Error(`--set must be one of ${SET_NAMES.join('|')}, got "${set}"`);
  }
  return SET_FILES[set].flatMap((path) => loadFixtures(path));
}

/** Collapse a tool description to the single line the prompt budget allows. */
function oneLine(text) {
  return String(text ?? '').split('\n')[0].replace(/\s+/g, ' ').trim();
}

/** The asks plus the answer-format instruction shared by both prompts and both sets. */
export function renderAsksBlock(fixtures) {
  const asks = fixtures.map((fixture, index) => `${index + 1}. ${fixture.ask}`).join('\n');
  return [
    '## Asks',
    '',
    'For each ask, name the single operation you would run to satisfy it. When an',
    'ask describes a multi-step workflow, name the operation you would run FIRST.',
    '',
    'If no operation fits — the request is outside the toolchain\'s capabilities —',
    'answer "NONE". That is not a guess: you would instead ask the professor a',
    'clarifying question.',
    '',
    asks,
    '',
    '## Answer format',
    '',
    'Reply with JSON only, one entry per ask, in order, with an operation id or NONE:',
    '',
    '{"answers":[{"ask":1,"op":"<operation id>"},{"ask":2,"op":"NONE"}]}',
    '',
  ].join('\n');
}

/**
 * The addresses a model can name an operation by without knowing its id, both
 * taken from what the old surface advertises: `<intentTool>.<intentAction>` for
 * an intent-tool action, and `ct_advanced.<op id>` for an operation ct_advanced
 * can actually run (`exposure: 'advanced'` — `runAdvanced` refuses anything
 * else, so an intent or internal op never gets that address).
 */
export function buildAddressIndex(operations) {
  const index = new Map();
  for (const op of operations) {
    if (op.exposure === 'intent' && op.intentTool && op.intentAction) {
      index.set(`${op.intentTool}.${op.intentAction}`, op.id);
    }
    if (op.exposure === 'advanced') index.set(`ct_advanced.${op.id}`, op.id);
  }
  return index;
}

/**
 * `NONE` is a legitimate answer — the ask is outside the surface — so it is
 * normalized rather than treated as an unmapped address. The model may write it
 * in any case and with surrounding space.
 */
function resolveAnswer(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.toUpperCase() === NONE ? NONE : trimmed;
}

/**
 * Score a model's answers against the fixtures. `expectedOp` plus anything in
 * `alsoAcceptable` counts as correct, exactly as selection-fixtures.test.ts
 * documents, with two hard-set rules on top:
 *
 * - A fixture with a `chain` is answered by the operation the workflow starts
 *   with, so `chain[0]` is the expected answer (and the later steps, listed in
 *   `chain` for the report, are not accepted on their own).
 * - A fixture whose expected answer is `NONE` is correct only when the model
 *   answers `NONE`; a real op for it is a miss, and vice versa.
 *
 * An answer may arrive as an op id or as one of the old surface's addresses, so
 * each answer is resolved through `addressIndex` before the comparison and a
 * miss records both the raw answer and what it mapped to. Accuracy is reported
 * overall and per fixture category (`categories`, first-appearance order; a
 * fixture with no category is `uncategorized`). Pure: no network, no model call,
 * no filesystem.
 */
export function scoreAnswers(fixtures, answers, { addressIndex } = {}) {
  const byAsk = new Map();
  for (const answer of answers?.answers ?? []) {
    byAsk.set(Number(answer.ask), answer.op);
  }

  const misses = [];
  const categories = new Map();
  let correct = 0;

  fixtures.forEach((fixture, index) => {
    const ask = index + 1;
    const got = byAsk.get(ask);
    const mapped = typeof got === 'string' ? addressIndex?.get(got) : undefined;
    const resolved = resolveAnswer(mapped ?? got);
    const expected = fixture.chain?.[0] ?? fixture.expectedOp;
    const category = fixture.category ?? 'uncategorized';
    const bucket = categories.get(category) ?? { category, total: 0, correct: 0 };
    bucket.total += 1;

    const acceptable = new Set([expected, ...(fixture.alsoAcceptable ?? [])]);
    if (resolved !== undefined && acceptable.has(resolved)) {
      correct += 1;
      bucket.correct += 1;
    } else {
      misses.push({
        ask,
        question: fixture.ask,
        category,
        got: got ?? null,
        mapped: mapped ?? null,
        expected,
        alsoAcceptable: fixture.alsoAcceptable ?? [],
      });
    }
    categories.set(category, bucket);
  });

  return {
    command: 'eval-selection',
    mode: 'score',
    total: fixtures.length,
    correct,
    categories: [...categories.values()],
    misses,
  };
}

/**
 * The old-surface prompt: the ten tool schemas a client lists, then the full
 * ct_advanced catalog with parameter schemas — everything an agent reads today
 * to pick an operation. This is the baseline selection is measured against.
 */
export async function renderOldPrompt({ probe, fixtures, set = DEFAULT_SET }) {
  const toolsJson = JSON.stringify(probe.tools, null, 2);
  const sections = ['modules', 'registry', 'transcripts', 'research', 'accessibility', 'snapshots', 'design', 'admin'];
  const catalog = [];
  for (const section of sections) {
    catalog.push(`### ${section}`, '', await probe.describeText({ action: 'describe', section }), '');
  }

  return [
    `# Old surface: pick an operation (baseline) — ${set} set`,
    '',
    'You are an agent with the Canvas Toolchain MCP server. Below is what you read',
    'today to pick an operation: the ten tool schemas `list_tools` returns, then the',
    'full `ct_advanced` catalog (`describe` per section, parameter schemas included).',
    '',
    '## Public tools (list_tools)',
    '',
    '```json',
    toolsJson,
    '```',
    '',
    '## ct_advanced catalog (describe per section)',
    '',
    ...catalog,
    renderAsksBlock(fixtures),
  ].join('\n');
}

/**
 * The path C prompt. It does NOT concatenate the ten topic maps as the first
 * read: it lists the ten public tools with one-line descriptions, tells the model
 * to pick a tool and read only that tool's map, and then provides every tool's
 * map under its own heading so the model has the one it picked inline.
 */
export function renderPathcPrompt({ tools, mocs, fixtures, set = DEFAULT_SET }) {
  const toolLines = tools.map((tool) => `- ${tool.name} — ${oneLine(tool.description)}`).join('\n');
  const maps = TOOL_MOC_IDS.flatMap((id) => [`### ${id}`, '', mocs[id] ?? '(no topic map)', '']);

  return [
    `# Path C: pick an operation from your tool's topic map — ${set} set`,
    '',
    'You are the same agent, routed through the skill graph (path C). You choose',
    'the `ct_*` tool you would enter for the ask, then read only that tool\'s topic',
    'map, then the one operation file the map points to.',
    '',
    '## Public tools — pick one',
    '',
    toolLines,
    '',
    '## How to read the topic maps',
    '',
    'The topic map for every tool is provided below under a `### <tool>` heading.',
    'After choosing a tool for an ask, read ONLY that tool\'s heading — ignore the',
    'other nine. The map lists the tool\'s operations with their full descriptions.',
    '',
    '## Topic maps',
    '',
    ...maps,
    renderAsksBlock(fixtures),
  ].join('\n');
}

export async function writePrompts({
  repoRoot = REPO_ROOT,
  skillsRoot = SKILLS_ROOT,
  out = DEFAULT_OUT,
  set = DEFAULT_SET,
} = {}) {
  const fixtures = loadSet(set);
  const probe = await loadSurfaceProbe(repoRoot);
  const mocs = Object.fromEntries(
    TOOL_MOC_IDS.map((id) => [id, readFileSync(join(skillsRoot, 'moc', `${id}.md`), 'utf8')]),
  );

  mkdirSync(out, { recursive: true });
  const oldPath = join(out, `old-${set}.md`);
  const pathcPath = join(out, `pathc-${set}.md`);
  writeFileSync(oldPath, await renderOldPrompt({ probe, fixtures, set }));
  writeFileSync(pathcPath, renderPathcPrompt({ tools: probe.tools, mocs, fixtures, set }));

  return { command: 'eval-selection', mode: 'prompts', set, out, files: [oldPath, pathcPath], asks: fixtures.length };
}

function printScore(result) {
  console.log(`eval-selection: ${result.set} set — ${result.correct}/${result.total} correct`);
  for (const bucket of result.categories) {
    console.log(`  ${bucket.category}: ${bucket.correct}/${bucket.total}`);
  }
  for (const miss of result.misses) {
    const accepted = [miss.expected, ...miss.alsoAcceptable].join(' | ');
    const mapped = miss.mapped ? ` (mapped: ${miss.mapped})` : '';
    console.log(`  miss ${miss.ask}: "${miss.question}" -> got ${miss.got ?? '(none)'}${mapped}, expected ${accepted}`);
  }
}

/**
 * `--set` is this harness's own flag, so it is peeled off here rather than added
 * to the shared cli SPEC: `lib/cli.mjs` is implemented by every skills command
 * and this is the only one that selects a fixture set. Everything else is parsed
 * by the shared parser, which still rejects a flag this command does not implement.
 */
function peelSetFlag(argv) {
  const rest = [];
  let set = DEFAULT_SET;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--set') {
      rest.push(argv[i]);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error('--set needs a value');
    set = value;
    i += 1;
  }
  return { set, rest };
}

async function main() {
  const { set, rest } = peelSetFlag(process.argv.slice(2));
  const args = parseArgs(rest, SELECTION_FLAGS);

  if (args.score) {
    const answers = JSON.parse(readFileSync(args.score, 'utf8'));
    // The answer may be written in the old surface's vocabulary, so the score is
    // taken against the built registry's addresses, not just the raw answer.
    const { operations } = await loadRegistrySource({ repoRoot: args.repoRoot ?? REPO_ROOT });
    const scored = scoreAnswers(loadSet(set), answers, { addressIndex: buildAddressIndex(operations) });
    const result = {
      command: scored.command,
      mode: scored.mode,
      set,
      total: scored.total,
      correct: scored.correct,
      categories: scored.categories,
      misses: scored.misses,
    };
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else printScore(result);
    return;
  }

  const summary = await writePrompts({
    ...(args.repoRoot ? { repoRoot: args.repoRoot } : {}),
    ...(args.out ? { out: args.out } : {}),
    set,
  });
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`eval-selection: wrote ${summary.asks} ${summary.set} asks to ${summary.out}`);
    for (const file of summary.files) console.log(`  ${file}`);
    console.log(`  score a run with: node scripts/skills/eval-selection.mjs --set ${summary.set} --score <answers.json>`);
  }
}

if (isMain(import.meta.url)) runMain(main, 'eval-selection');
