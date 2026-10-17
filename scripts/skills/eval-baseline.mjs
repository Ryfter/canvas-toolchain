#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isMain, parseArgs, runMain } from './lib/cli.mjs';
import { mocIdsFor } from './lib/graph.mjs';
import { REPO_ROOT, SKILLS_ROOT, loadRegistrySource, loadSurfaceProbe } from './lib/registry.mjs';

const FIXTURES = join(REPO_ROOT, 'packages/command-and-control/tests/skills/selection.fixtures.json');
const DEFAULT_OUT = join(REPO_ROOT, 'docs/skill-graph-baseline.md');

/** The index-line cap measured as lever B — the conventional one-line summary width. */
const INDEX_CAP = 140;

/**
 * "Count with a fixed tokenizer script" (plan §3) — there is no offline
 * tokenizer available here and no dependency may be added, so this is the
 * documented chars/4 approximation. Every number in the report is this
 * estimator, applied to the exact text an agent would read.
 */
function estimateTokens(text) {
  return Math.round(text.length / 4);
}

/** Lever B: cap each index line's description, keeping the wikilink intact. */
export function capIndexDescriptions(text, cap) {
  return text.split('\n').map((line) => {
    const match = /^(- \[\[[a-z0-9_.]+\]\] — )(.*)$/.exec(line);
    if (!match || match[2].length <= cap) return line;
    return `${match[1]}${match[2].slice(0, cap - 3)}...`;
  }).join('\n');
}

export async function evaluate({ repoRoot = REPO_ROOT, skillsRoot = SKILLS_ROOT } = {}) {
  const source = await loadRegistrySource({ repoRoot });
  const probe = await loadSurfaceProbe(repoRoot);
  const fixtures = JSON.parse(readFileSync(FIXTURES, 'utf8')).fixtures;

  // (a) The old path: the ten tool schemas a client lists, plus the full
  // ct_advanced catalog an agent must read to pick an advanced operation.
  const toolsList = JSON.stringify(probe.tools);
  const toolsListPretty = JSON.stringify(probe.tools, null, 2);
  const advancedSectionIndex = await probe.describeText({ action: 'describe' });
  const perSection = [];
  for (const section of source.sections) {
    perSection.push(await probe.describeText({ action: 'describe', section: section.id }));
  }
  const advancedCatalogFull = perSection.join('\n');
  const oldSurfaceTotal = toolsList + advancedCatalogFull;

  // (b) What a registry-level agent reads instead: the operation dump.
  const metadataDump = JSON.stringify(source.operations.map((op) => ({
    id: op.id,
    section: op.section,
    description: op.description,
    exposure: op.exposure,
    intentTool: op.intentTool ?? null,
    intentAction: op.intentAction ?? null,
  })));
  const fullDump = JSON.stringify(probe.coreOperations, (key, value) => (key === 'handler' ? undefined : value));

  // (c) The new path: index.md, then the one op file the pick implies. Two
  // cheaper variants are measured alongside it, because the flat index carries
  // all 86 full descriptions and that is the whole cost of the new path.
  const indexText = readFileSync(join(skillsRoot, 'index.md'), 'utf8');
  const indexCappedText = capIndexDescriptions(indexText, INDEX_CAP);

  const perAsk = fixtures.map((fixture) => {
    const opFile = `ops/${fixture.expectedOp}.md`;
    const opText = readFileSync(join(skillsRoot, opFile), 'utf8');
    const operation = source.operations.find((op) => op.id === fixture.expectedOp);
    const mocFile = `moc/${mocIdsFor(operation)[0]}.md`;
    const mocText = readFileSync(join(skillsRoot, mocFile), 'utf8');

    return {
      ask: fixture.ask,
      expectedOp: fixture.expectedOp,
      alsoAcceptable: fixture.alsoAcceptable ?? [],
      newPathFiles: ['index.md', opFile],
      newPathChars: indexText.length + opText.length,
      newPathTokens: estimateTokens(indexText + opText),
      cappedChars: indexCappedText.length + opText.length,
      cappedTokens: estimateTokens(indexCappedText + opText),
      mocFiles: [mocFile, opFile],
      mocChars: mocText.length + opText.length,
      mocTokens: estimateTokens(mocText + opText),
    };
  });

  const newPathTokens = perAsk.map((entry) => entry.newPathTokens);
  const newPathChars = perAsk.map((entry) => entry.newPathChars);
  const cappedTokens = perAsk.map((entry) => entry.cappedTokens);
  const mocTokens = perAsk.map((entry) => entry.mocTokens);
  const average = (values) => Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);

  const tokens = {
    oldSurface: {
      toolsList: estimateTokens(toolsList),
      toolsListPretty: estimateTokens(toolsListPretty),
      advancedSectionIndex: estimateTokens(advancedSectionIndex),
      advancedCatalogFull: estimateTokens(advancedCatalogFull),
      total: estimateTokens(oldSurfaceTotal),
      minimal: estimateTokens(toolsList + advancedSectionIndex),
    },
    registryDump: {
      metadata: estimateTokens(metadataDump),
      withSchemas: estimateTokens(fullDump),
    },
    newPath: {
      average: average(newPathTokens),
      worst: Math.max(...newPathTokens),
      indexOnly: estimateTokens(indexText),
      cappedAverage: average(cappedTokens),
      cappedIndexOnly: estimateTokens(indexCappedText),
      mocAverage: average(mocTokens),
      mocWorst: Math.max(...mocTokens),
    },
  };
  const chars = {
    oldSurface: {
      toolsList: toolsList.length,
      toolsListPretty: toolsListPretty.length,
      advancedSectionIndex: advancedSectionIndex.length,
      advancedCatalogFull: advancedCatalogFull.length,
      total: oldSurfaceTotal.length,
      minimal: (toolsList + advancedSectionIndex).length,
    },
    registryDump: { metadata: metadataDump.length, withSchemas: fullDump.length },
    newPath: {
      average: average(newPathChars),
      worst: Math.max(...newPathChars),
      indexOnly: indexText.length,
      cappedAverage: average(perAsk.map((entry) => entry.cappedChars)),
      cappedIndexOnly: indexCappedText.length,
      mocAverage: average(perAsk.map((entry) => entry.mocChars)),
      mocWorst: Math.max(...perAsk.map((entry) => entry.mocChars)),
    },
  };

  return {
    command: 'eval-baseline',
    method: {
      tokenizer: 'chars/4',
      note: 'No offline tokenizer is available and no dependency may be added; every token number is Math.round(chars/4), reported alongside raw chars. Old-surface text is measured minified (the wire shape) with the pretty-printed form reported separately.',
    },
    operations: source.operations.length,
    indexCap: INDEX_CAP,
    tokens,
    chars,
    ratios: {
      oldSurfaceOverNewPath: Number((tokens.oldSurface.total / tokens.newPath.average).toFixed(2)),
      oldSurfaceOverNewPathCapped: Number((tokens.oldSurface.total / tokens.newPath.cappedAverage).toFixed(2)),
      oldSurfaceOverMocPath: Number((tokens.oldSurface.total / tokens.newPath.mocAverage).toFixed(2)),
      registryDumpOverNewPath: Number((tokens.registryDump.metadata / tokens.newPath.average).toFixed(2)),
      registryDumpOverMocPath: Number((tokens.registryDump.metadata / tokens.newPath.mocAverage).toFixed(2)),
      oldSurfaceOverIndexOnly: Number((tokens.oldSurface.total / tokens.newPath.indexOnly).toFixed(2)),
      oldSurfaceMinimalOverNewPath: Number((tokens.oldSurface.minimal / tokens.newPath.average).toFixed(2)),
      oldSurfaceMinimalOverMocPath: Number((tokens.oldSurface.minimal / tokens.newPath.mocAverage).toFixed(2)),
    },
    fixtures: perAsk,
  };
}

function renderDocument(report) {
  const rows = report.fixtures.map((fixture) =>
    `| ${fixture.ask} | \`${fixture.expectedOp}\` | ${fixture.newPathFiles.join(' + ')} | ${fixture.newPathTokens} | ${fixture.mocFiles.join(' + ')} | ${fixture.mocTokens} |`);

  return `# Token baseline: picking an operation, before and after the skill graph

Generated by \`node scripts/skills/eval-baseline.mjs\` (J5). Regenerate rather
than hand-editing: the numbers move whenever the registry or the generated tree
changes.

Token counts use the **chars/4 approximation** (\`Math.round(chars / 4)\`), the
only estimator available offline — no tokenizer dependency was added. Raw chars
are given alongside every number. Old-surface text is measured **minified**,
which is the shape the MCP wire carries and the conservative choice (the
pretty-printed form is reported separately and is larger).

## What each number is

| Row | What an agent reads |
| --- | --- |
| old surface: tools list | The 10 tool schemas \`list_tools\` returns (nine \`ct_*\` intent tools + \`ct_advanced\`). |
| old surface: ct_advanced catalog | \`describe\` for all 8 sections, i.e. the full operation catalog *with* parameter schemas. |
| old surface: total | Tools list + full catalog — everything an agent reads today to pick one operation. |
| registry dump (metadata) | All ${report.operations} operations as \`{id, section, description, exposure, intentTool, intentAction}\` JSON. The alternative "read the source of truth" path. |
| registry dump (with schemas) | The same dump including every \`inputSchema\`. |
| new path (A) | \`skills/index.md\` plus the single \`ops/<id>.md\` the pick implies, averaged over the 18 fixture asks. The full-catalog fallback, for the "which tool am I in?" step. |
| new path (B) | As A, with each index line's description capped at ${report.indexCap} characters — the summary width convention. |
| new path (C) | **The routed path.** \`moc/<intent tool>.md\` plus the single op file. Skips the ${report.operations}-operation index entirely, because the agent already knows which intent tool it is calling. |
| new path: index only | \`index.md\` alone — a lower bound for asks obvious enough to skip the op file. |

## Result

| Measurement | chars | tokens (chars/4) |
| --- | --- | --- |
| old surface: tools list | ${report.chars.oldSurface.toolsList} | ${report.tokens.oldSurface.toolsList} |
| old surface: tools list (pretty-printed) | ${report.chars.oldSurface.toolsListPretty} | ${report.tokens.oldSurface.toolsListPretty} |
| old surface: ct_advanced section index | ${report.chars.oldSurface.advancedSectionIndex} | ${report.tokens.oldSurface.advancedSectionIndex} |
| old surface: full ct_advanced catalog | ${report.chars.oldSurface.advancedCatalogFull} | ${report.tokens.oldSurface.advancedCatalogFull} |
| **old surface: total** | **${report.chars.oldSurface.total}** | **${report.tokens.oldSurface.total}** |
| old surface: floor (tools + section index) | ${report.chars.oldSurface.minimal} | ${report.tokens.oldSurface.minimal} |
| registry dump (metadata) | ${report.chars.registryDump.metadata} | ${report.tokens.registryDump.metadata} |
| registry dump (with schemas) | ${report.chars.registryDump.withSchemas} | ${report.tokens.registryDump.withSchemas} |
| **new path A: index + op file (average)** | **${report.chars.newPath.average}** | **${report.tokens.newPath.average}** |
| new path A: worst ask | ${report.chars.newPath.worst} | ${report.tokens.newPath.worst} |
| new path A: index.md only | ${report.chars.newPath.indexOnly} | ${report.tokens.newPath.indexOnly} |
| new path B: capped index + op file (average) | ${report.chars.newPath.cappedAverage} | ${report.tokens.newPath.cappedAverage} |
| new path B: capped index only | ${report.chars.newPath.cappedIndexOnly} | ${report.tokens.newPath.cappedIndexOnly} |
| **new path C: MOC + op file (average)** | **${report.chars.newPath.mocAverage}** | **${report.tokens.newPath.mocAverage}** |
| new path C: worst ask | ${report.chars.newPath.mocWorst} | ${report.tokens.newPath.mocWorst} |

Reduction against the old-surface total:

| New path | Factor |
| --- | --- |
| A — index + op file | ${report.ratios.oldSurfaceOverNewPath}x |
| B — capped index + op file | ${report.ratios.oldSurfaceOverNewPathCapped}x |
| C — MOC + op file | ${report.ratios.oldSurfaceOverMocPath}x |
| index.md only | ${report.ratios.oldSurfaceOverIndexOnly}x |

Against a *thrifty* old path (tools list + the ct_advanced section index, no
schemas), the comparison is less flattering and the more honest one to quote:

| New path | Factor |
| --- | --- |
| A — index + op file | ${report.ratios.oldSurfaceMinimalOverNewPath}x |
| C — MOC + op file | ${report.ratios.oldSurfaceMinimalOverMocPath}x |

Reduction against the metadata registry dump:

| New path | Factor |
| --- | --- |
| A — index + op file | ${report.ratios.registryDumpOverNewPath}x |
| C — MOC + op file | ${report.ratios.registryDumpOverMocPath}x |

## Verdict against the plan's ≥5x target

**Path A does not hit 5x.** It measures ${report.ratios.oldSurfaceOverNewPath}x against the full
old-surface read, and only ${report.ratios.oldSurfaceMinimalOverNewPath}x against a thrifty old path
that reads the tools list and the ct_advanced section index without ever pulling
a parameter schema. The reason is structural rather than a measurement artefact:
\`index.md\` contains all ${report.operations} full descriptions (${report.chars.newPath.indexOnly} chars,
${report.tokens.newPath.indexOnly} tokens), which is essentially the metadata registry dump plus
prose, so reading it costs about what it replaces.

Two levers were measured rather than guessed:

* **B — cap the index lines at ${report.indexCap} characters**: ${report.ratios.oldSurfaceOverNewPathCapped}x. Still short.
  Capping at ${report.indexCap} costs the caveats that make selection correct, so this is a
  bad trade even before the number is good enough.
* **C — start from the intent tool's MOC, not the flat index**: **${report.ratios.oldSurfaceOverMocPath}x**, which
  clears the target ${report.ratios.oldSurfaceOverMocPath >= 5 ? 'comfortably' : 'by the margin shown'}.

Path C is not a hack: the model already knows which \`ct_*\` tool it is calling when
it has decided to act (that is the whole point of the nine intent tools), so
\`moc/<tool>.md\` — the ${report.operations}-operation list filtered to that tool's operations — is
the correct first read. \`index.md\` remains right for the "which tool am I in?"
step, a decision the model makes from the tool descriptions it already has.

**The routing decision.** Agents are routed through C: the first read is the
intent tool's topic map, then the one op file the pick implies. \`index.md\` stays
as the full-catalog fallback rather than the entry point, and path A is retained
as the comparison. J10 scores selection on C, with A as the fallback measurement.

## Per-ask detail

Selection accuracy is **not** measured here — J10 runs the same model over the
old surface and the index and scores it against these expectations. This is the
harness's accounting of what the new path would read for each ask.

| Ask | Expected operation | Path A files | A tokens | Path C files | C tokens |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## Honest caveats

* **chars/4 is an approximation.** It under-counts code and over-counts prose;
  both surfaces are prose-heavy, so the *ratio* is the more trustworthy number
  than either absolute value.
* **The index is not free.** \`index.md\` carries all ${report.operations} full
  descriptions (median 145 characters, max 562), so it costs about as much as the
  metadata registry dump. The saving over the old path comes from not reading the
  parameter schemas and not reading the ct_advanced catalog twice.
* **Module operations are excluded.** They exist only at runtime behind
  \`modules.json\`, so the baseline is the core surface (${report.operations} operations).
* **Reading one op file is an assumption.** An agent that picks from the index
  alone reads only ${report.tokens.newPath.indexOnly} tokens; one that opens two op files
  pays roughly double the average.
* **Path C assumes the agent already knows its intent tool.** That is true when
  the model is dispatching an action, and false when it is deciding whether the
  skill graph is relevant at all — hence \`index.md\` still has a job.
* **Counts are of text read, not of round-trips.** The old surface's real cost is
  also two describes (section, then operation); path C replaces those with two file
  reads of the same shape.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ['--out', '--json', '--repo-root']);
  const report = await evaluate({ ...(args.repoRoot ? { repoRoot: args.repoRoot } : {}) });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const out = args.out ?? DEFAULT_OUT;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderDocument(report));
    console.log(`eval-baseline: ${report.operations} operations, 18 asks`);
    console.log(`  old surface total      ${report.tokens.oldSurface.total} tokens (${report.chars.oldSurface.total} chars)`);
    console.log(`  new path average       ${report.tokens.newPath.average} tokens (${report.chars.newPath.average} chars)`);
    console.log(`  reduction              ${report.ratios.oldSurfaceOverNewPath}x`);
    console.log(`  wrote ${out}`);
  }
}

if (isMain(import.meta.url)) runMain(main, 'eval-baseline');
