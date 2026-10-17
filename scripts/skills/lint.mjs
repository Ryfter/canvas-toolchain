#!/usr/bin/env node
import { isMain, LINT_FLAGS, parseArgs, runMain } from './lib/cli.mjs';
import { DEFAULT_LINT_OPTIONS, lintSkills, summarizeViolations } from './lib/lint-rules.mjs';
import { curatedRelatedPath, loadCuratedRelated } from './lib/related.mjs';
import { REPO_ROOT, SKILLS_ROOT, loadRegistrySource } from './lib/registry.mjs';
import { readSkillsTree } from './lib/tree.mjs';

/**
 * Check the generated tree against the registry and the lint rules. Read-only:
 * it reports, and the exit code is the gate.
 */
export async function lintProject({
  root = SKILLS_ROOT, repoRoot = REPO_ROOT, includeModules = false, maxDescription, similarity,
} = {}) {
  const source = await loadRegistrySource({ repoRoot, includeModules });
  const tree = readSkillsTree(root);
  const curated = loadCuratedRelated(curatedRelatedPath(repoRoot));

  const options = {
    ...DEFAULT_LINT_OPTIONS,
    ...(maxDescription ? { maxDescription } : {}),
    ...(similarity ? { similarity } : {}),
  };
  // The curated link data is an input to the `curated-link` rule, not a rule
  // option: report only the options, or `--json` would dump all ~130 links.
  const violations = lintSkills(tree, source.operations, { ...options, curated });

  return {
    root,
    operations: source.operations.length,
    mocs: tree.mocs.length,
    concepts: tree.concepts.length,
    curatedLinks: curated.links.length,
    options,
    violations,
    summary: summarizeViolations(violations),
  };
}

function printHuman(report) {
  const { summary, options } = report;
  console.log(
    `lint: ${report.operations} ops, ${report.mocs} MOCs, ${report.concepts} concepts` +
    ` (max-description ${options.maxDescription}, similarity ${options.similarity})`,
  );
  console.log(summary.total === 0
    ? '  no violations'
    : `  ${summary.total} violations: ${Object.entries(summary.byRule).filter(([, n]) => n).map(([rule, n]) => `${rule} ${n}`).join(', ')}`);

  for (const rule of Object.keys(summary.byRule)) {
    const forRule = report.violations.filter((v) => v.rule === rule);
    if (!forRule.length) continue;
    console.log(`\n${rule} (${forRule.length})`);
    for (const violation of forRule) {
      const other = violation.other ? ` + ${violation.other}` : '';
      const target = violation.target ? ` -> ${violation.target}` : '';
      console.log(`  ${violation.file}${other}${target}  ${violation.message}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), LINT_FLAGS);
  const report = await lintProject({
    ...(args.root ? { root: args.root } : {}),
    ...(args.repoRoot ? { repoRoot: args.repoRoot } : {}),
    includeModules: args.includeModules,
    ...(args.maxDescription ? { maxDescription: args.maxDescription } : {}),
    ...(args.similarity ? { similarity: args.similarity } : {}),
  });

  if (args.json) console.log(JSON.stringify({ command: 'lint', ...report }, null, 2));
  else printHuman(report);

  if (report.summary.total > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) runMain(main, 'lint');
