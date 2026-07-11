// scripts/build-module.mjs
// Usage: npm run build:module -- <id>   (e.g. npm run build:module -- announcements)
// Bundles packages/module-<id> + ALL runtime deps into one self-contained ESM file
// and prints the catalog-entry fields (sha256, sizeBytes) as JSON.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run build:module -- <id>');
  process.exit(1);
}
const MODULE_ID = /^[a-z0-9][a-z0-9-]*$/;
if (!MODULE_ID.test(id)) {
  console.error(`Invalid module id '${id}': must match ${MODULE_ID} (it flows into filesystem paths and release tags).`);
  process.exit(1);
}
const pkgDir = join('packages', `module-${id}`);
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
const version = pkg.version;
mkdirSync('dist-channel', { recursive: true });
const outfile = join('dist-channel', `module-${id}-${version}.mjs`);

await build({
  entryPoints: [join(pkgDir, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  // CJS deps bundled into ESM sometimes call require(); provide it.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

const bytes = readFileSync(outfile);
console.log(JSON.stringify({
  id,
  version,
  outfile,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sizeBytes: statSync(outfile).size,
}, null, 2));
