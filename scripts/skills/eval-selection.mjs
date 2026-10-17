#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, parseArgs, runMain, SELECTION_FLAGS } from './lib/cli.mjs';
import { REPO_ROOT, SKILLS_ROOT, loadSurfaceProbe } from './lib/registry.mjs';

const FIXTURES = join(REPO_ROOT, 'packages/command-and-control/tests/skills/selection.fixtures.json');
const DEFAULT_OUT = '/tmp/ct-selection';

/** The ten public tools whose topic maps path C hands the model. */
const TOOL_MOC_IDS = [
  'ct_setup', 'ct_import', 'ct_inspect', 'ct_analyze', 'ct_plan',
  'ct_build', 'ct_review', 'ct_publish', 'ct_ask', 'ct_advanced',
];

export function loadFixtures(path = FIXTURES) {
  return JSON.parse(readFileSync(path, 'utf8')).fixtures;
}

/** Collapse a tool description to the single line the prompt budget allows. */
function oneLine(text) {
  return String(text ?? '').split('\n')[0].replace(/\s+/g, ' ').trim();
}

/** The 18 asks plus the answer-format instruction shared by both prompts. */
export function renderAsksBlock(fixtures) {
  const asks = fixtures.map((fixture, index) => `${index + 1}. ${fixture.ask}`).join('\n');
  return [
    '## Asks',
    '',
    'Choose the single operation you would run for each ask below.',
    '',
    asks,
    '',
    '## Answer format',
    '',
    'Reply with JSON only, one entry per ask, in order:',
    '',
    '{"answers":[{"ask":1,"op":"<operation id>"},{"ask":2,"op":"<operation id>"}]}',
    '',
  ].join('\n');
}

/**
 * Score a model's answers against the fixtures. `expectedOp` plus anything in
 * `alsoAcceptable` counts as correct, exactly as selection-fixtures.test.ts
 * documents. Pure: no network, no model call, no filesystem.
 */
export function scoreAnswers(fixtures, answers) {
  const byAsk = new Map();
  for (const answer of answers?.answers ?? []) {
    byAsk.set(Number(answer.ask), answer.op);
  }

  const misses = [];
  let correct = 0;
  fixtures.forEach((fixture, index) => {
    const ask = index + 1;
    const got = byAsk.get(ask);
    const acceptable = new Set([fixture.expectedOp, ...(fixture.alsoAcceptable ?? [])]);
    if (got !== undefined && acceptable.has(got)) correct += 1;
    else {
      misses.push({
        ask,
        question: fixture.ask,
        got: got ?? null,
        expected: fixture.expectedOp,
        alsoAcceptable: fixture.alsoAcceptable ?? [],
      });
    }
  });

  return { command: 'eval-selection', mode: 'score', total: fixtures.length, correct, misses };
}

/**
 * The old-surface prompt: the ten tool schemas a client lists, then the full
 * ct_advanced catalog with parameter schemas — everything an agent reads today
 * to pick an operation. This is the baseline selection is measured against.
 */
export async function renderOldPrompt({ probe, fixtures }) {
  const toolsJson = JSON.stringify(probe.tools, null, 2);
  const sections = ['modules', 'registry', 'transcripts', 'research', 'accessibility', 'snapshots', 'design', 'admin'];
  const catalog = [];
  for (const section of sections) {
    catalog.push(`### ${section}`, '', await probe.describeText({ action: 'describe', section }), '');
  }

  return [
    '# Old surface: pick an operation (baseline)',
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
export function renderPathcPrompt({ tools, mocs, fixtures }) {
  const toolLines = tools.map((tool) => `- ${tool.name} — ${oneLine(tool.description)}`).join('\n');
  const maps = TOOL_MOC_IDS.flatMap((id) => [`### ${id}`, '', mocs[id] ?? '(no topic map)', '']);

  return [
    '# Path C: pick an operation from your tool\'s topic map',
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

export async function writePrompts({ repoRoot = REPO_ROOT, skillsRoot = SKILLS_ROOT, out = DEFAULT_OUT } = {}) {
  const fixtures = loadFixtures();
  const probe = await loadSurfaceProbe(repoRoot);
  const mocs = Object.fromEntries(
    TOOL_MOC_IDS.map((id) => [id, readFileSync(join(skillsRoot, 'moc', `${id}.md`), 'utf8')]),
  );

  mkdirSync(out, { recursive: true });
  const oldPath = join(out, 'old.md');
  const pathcPath = join(out, 'pathc.md');
  writeFileSync(oldPath, await renderOldPrompt({ probe, fixtures }));
  writeFileSync(pathcPath, renderPathcPrompt({ tools: probe.tools, mocs, fixtures }));

  return { command: 'eval-selection', mode: 'prompts', out, files: [oldPath, pathcPath], asks: fixtures.length };
}

function printScore(result) {
  console.log(`eval-selection: ${result.correct}/${result.total} correct`);
  for (const miss of result.misses) {
    const accepted = [miss.expected, ...miss.alsoAcceptable].join(' | ');
    console.log(`  miss ${miss.ask}: "${miss.question}" -> got ${miss.got ?? '(none)'}, expected ${accepted}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), SELECTION_FLAGS);

  if (args.score) {
    const answers = JSON.parse(readFileSync(args.score, 'utf8'));
    const result = scoreAnswers(loadFixtures(), answers);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else printScore(result);
    return;
  }

  const summary = await writePrompts({
    ...(args.repoRoot ? { repoRoot: args.repoRoot } : {}),
    ...(args.out ? { out: args.out } : {}),
  });
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`eval-selection: wrote ${summary.asks} asks to ${summary.out}`);
    for (const file of summary.files) console.log(`  ${file}`);
    console.log('  score a run with: node scripts/skills/eval-selection.mjs --score <answers.json>');
  }
}

if (isMain(import.meta.url)) runMain(main, 'eval-selection');
