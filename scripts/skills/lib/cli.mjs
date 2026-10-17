import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SPEC = {
  '--check': { key: 'check', type: 'boolean' },
  '--include-modules': { key: 'includeModules', type: 'boolean' },
  '--json': { key: 'json', type: 'boolean' },
  '--root': { key: 'root', type: 'string' },
  '--repo-root': { key: 'repoRoot', type: 'string' },
  '--out': { key: 'out', type: 'string' },
  '--score': { key: 'score', type: 'string' },
  '--max-description': { key: 'maxDescription', type: 'number' },
  '--similarity': { key: 'similarity', type: 'number' },
};

/** Flags the two writers implement. */
export const WRITER_FLAGS = ['--root', '--repo-root', '--check', '--include-modules', '--json'];

/** Flags the lint implements. It is read-only, so it has no --check. */
export const LINT_FLAGS = ['--root', '--repo-root', '--include-modules', '--json', '--max-description', '--similarity'];

/** Flags the selection harness implements. */
export const SELECTION_FLAGS = ['--out', '--score', '--repo-root', '--json'];

const DEFAULTS = { root: null, repoRoot: null, check: false, includeModules: false, json: false };

/**
 * Flat flag parsing. Each command passes the flags it implements, so a flag it
 * would silently ignore is rejected instead.
 */
export function parseArgs(argv, allowed = Object.keys(SPEC)) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!Object.hasOwn(SPEC, arg) || !allowed.includes(arg)) throw new Error(`unknown argument: ${arg}`);

    const spec = SPEC[arg];
    if (spec.type === 'boolean') {
      out[spec.key] = true;
      continue;
    }

    const raw = argv[i + 1];
    if (raw === undefined) throw new Error(`${arg} needs a value`);
    if (spec.type === 'number') {
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${arg} needs a positive number, got "${raw}"`);
      out[spec.key] = value;
    } else {
      out[spec.key] = raw;
    }
    i += 1;
  }
  return out;
}

/**
 * True when this module is the process entry point rather than an import.
 *
 * Both sides are resolved with realpathSync because a bin shim (and `npm exec`)
 * reaches the script through a symlink: `process.argv[1]` is then the link while
 * the ESM loader has already resolved `import.meta.url` to the real file, so a
 * plain URL comparison would say "not main" and the command would do nothing.
 */
export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(importMetaUrl));
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
