#!/usr/bin/env node
import { join } from 'node:path';
import { isMain, parseArgs, runMain, WRITER_FLAGS } from './lib/cli.mjs';
import { summarize, writeGeneratedFile } from './lib/emit.mjs';
import { assignMocs, conceptsForMoc } from './lib/graph.mjs';
import { REPO_ROOT, SKILLS_ROOT, loadRegistrySource } from './lib/registry.mjs';
import { mocStubBody, renderMocFile } from './lib/render.mjs';
import { plainConcept, readSkillsTree } from './lib/tree.mjs';

/**
 * Write one MOC per intent tool, one for ct_advanced, and one per section.
 *
 * MOC ids are derived from the registry's closed sets, so a MOC is never
 * disambiguated by a prefix. Stale MOCs for ids the registry no longer declares
 * are left alone: deleting files is not the generator's call, and the lint
 * reports the ops that ended up in no MOC.
 *
 * Each MOC also lists the concepts that name one of its operations — derived
 * from the concept's hand-written `related:` list, so a new concept note lands
 * in the right maps without a MOC being touched (J9).
 */
export async function buildMocs({
  root = SKILLS_ROOT, repoRoot = REPO_ROOT, includeModules = false, check = false,
} = {}) {
  const source = await loadRegistrySource({ repoRoot, includeModules });
  const concepts = readSkillsTree(root).concepts.map(plainConcept);

  const mocs = assignMocs(source).map((moc) => ({
    moc, concepts: conceptsForMoc(moc.opIds, concepts),
  }));

  const results = mocs.map(({ moc, concepts: owned }) => writeGeneratedFile(
    join(root, 'moc', `${moc.id}.md`),
    renderMocFile(moc, source, owned),
    { check, stub: mocStubBody() },
  ));

  return {
    root,
    mocs: mocs.length,
    operations: source.operations.length,
    concepts: concepts.length,
    conceptLinks: mocs.reduce((total, entry) => total + entry.concepts.length, 0),
    files: summarize(results),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), WRITER_FLAGS);
  const summary = await buildMocs({
    ...(args.root ? { root: args.root } : {}),
    ...(args.repoRoot ? { repoRoot: args.repoRoot } : {}),
    includeModules: args.includeModules,
    check: args.check,
  });
  const { files } = summary;

  if (args.json) {
    console.log(JSON.stringify({ command: 'moc', ...summary }, null, 2));
  } else {
    const verb = args.check ? 'would write' : 'wrote';
    console.log(`moc: ${summary.mocs} maps over ${summary.operations} operations -> ${summary.root}`);
    console.log(`  ${summary.concepts} concepts linked ${summary.conceptLinks} time(s) across the maps`);
    console.log(`  ${verb} ${files.created} new, ${files.updated} updated; ${files.unchanged} unchanged`);
  }

  if (args.check && files.changed > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) runMain(main, 'moc');
