#!/usr/bin/env node
import { join } from 'node:path';
import { isMain, parseArgs, runMain, WRITER_FLAGS } from './lib/cli.mjs';
import { summarize, writeGeneratedFile } from './lib/emit.mjs';
import { mergeRelated, seedRelated } from './lib/graph.mjs';
import { curatedRelatedPath, loadCuratedRelated } from './lib/related.mjs';
import { REPO_ROOT, SKILLS_ROOT, loadRegistrySource } from './lib/registry.mjs';
import { indexStubBody, opStubBody, renderIndexFile, renderOpFile } from './lib/render.mjs';
import { plainConcept, readSkillsTree } from './lib/tree.mjs';

/**
 * Write index.md and one ops/<id>.md per operation.
 *
 * Idempotent: the operation order is the registry order, the curated `related`
 * links are merged in a sorted order, and nothing embeds a timestamp, so a
 * second run over an unchanged registry writes nothing.
 *
 * The index also lists the hand-written concept notes, so the fallback catalog
 * names the cross-cutting ideas as well as the operations (J9).
 */
export async function buildIndex({
  root = SKILLS_ROOT, repoRoot = REPO_ROOT, includeModules = false, check = false,
} = {}) {
  const source = await loadRegistrySource({ repoRoot, includeModules });
  const curated = loadCuratedRelated(curatedRelatedPath(repoRoot));
  const related = mergeRelated(seedRelated(source.operations), curated.byFrom);
  const concepts = readSkillsTree(root).concepts.map(plainConcept);

  const results = [
    writeGeneratedFile(join(root, 'index.md'), renderIndexFile(source, concepts), { check, stub: indexStubBody() }),
  ];
  for (const op of source.operations) {
    results.push(writeGeneratedFile(
      join(root, 'ops', `${op.id}.md`),
      renderOpFile(op, related.get(op.id) ?? []),
      { check, stub: opStubBody(op) },
    ));
  }

  return {
    root,
    operations: source.operations.length,
    concepts: concepts.length,
    files: summarize(results),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), WRITER_FLAGS);
  const summary = await buildIndex({
    ...(args.root ? { root: args.root } : {}),
    ...(args.repoRoot ? { repoRoot: args.repoRoot } : {}),
    includeModules: args.includeModules,
    check: args.check,
  });
  const { files } = summary;

  if (args.json) {
    console.log(JSON.stringify({ command: 'build-index', ...summary }, null, 2));
  } else {
    const verb = args.check ? 'would write' : 'wrote';
    console.log(`build-index: ${summary.operations} operations -> ${summary.root}`);
    console.log(`  ${summary.concepts} concepts listed in the index`);
    console.log(`  ${verb} ${files.created} new, ${files.updated} updated; ${files.unchanged} unchanged`);
  }

  if (args.check && files.changed > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) runMain(main, 'build-index');
