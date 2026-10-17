import { pathToFileURL } from 'node:url';

const BOOLEAN_FLAGS = {
  '--check': 'check',
  '--include-modules': 'includeModules',
  '--json': 'json',
};

const VALUE_FLAGS = {
  '--root': 'root',
  '--repo-root': 'repoRoot',
};

/** Flat flag parsing, shared by the CLIs so they accept the same flags. */
export function parseArgs(argv) {
  const out = { root: null, repoRoot: null, check: false, includeModules: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (Object.hasOwn(BOOLEAN_FLAGS, arg)) out[BOOLEAN_FLAGS[arg]] = true;
    else if (Object.hasOwn(VALUE_FLAGS, arg)) {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      out[VALUE_FLAGS[arg]] = value;
      i += 1;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

/** True when this module is the process entry point rather than an import. */
export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  return importMetaUrl === pathToFileURL(process.argv[1]).href;
}

/** Shared entrypoint wrapper: a thrown error is a message and exit 1, not a stack. */
export function runMain(main, label) {
  main().catch((err) => {
    console.error(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    // exitCode, never process.exit(): stdout/stderr writes to a pipe are async,
    // and process.exit() truncates them.
    process.exitCode = 1;
  });
}
