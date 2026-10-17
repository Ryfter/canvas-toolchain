#!/usr/bin/env node
import { join } from 'node:path';
import { isMain, parseArgs, runMain } from './lib/cli.mjs';
import { summarize, writeGeneratedFile } from './lib/emit.mjs';
import { assignMocs } from './lib/graph.mjs';
import { REPO_ROOT, SKILLS_ROOT, loadRegistrySource } from './lib/registry.mjs';
import { mocStubBody, renderMocFile } from './lib/render.mjs';

/**
 * Write one MOC per intent tool, one for ct_advanced, and one per section.
 *
 * MOC ids are derived from the registry's closed sets, so a MOC is never
 * disambiguated by a prefix. Stale MOCs for ids the registry no longer declares
 * are left alone: deleting files is not the generator's call, and the lint
 * reports the ops that ended up in no MOC.
 */
export async function buildMocs({
  root = SKILLS_ROOT, repoRoot = REPO_ROOT, includeModules = false, check = false,
} = {}) {
  const source = await loadRegistrySource({ repoRoot, includeModules });
  const mocs = assignMocs(source);

  const results = mocs.map((moc) => writeGeneratedFile(
    join(root, 'moc', `${moc.id}.md`),
    renderMocFile(moc, source),
    { check, stub: mocStubBody() },
  ));

  return { root, mocs: mocs.length, operations: source.operations.length, files: summarize(results) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
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
    console.log(`  ${verb} ${files.created} new, ${files.updated} updated; ${files.unchanged} unchanged`);
  }

  if (args.check && files.changed > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) runMain(main, 'moc');
