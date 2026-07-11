import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';

// ESM-safe repo root (tests run as ESM; __dirname does not exist here).
const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

describe('channel artifact smoke (real esbuild build)', () => {
  it('builds module-announcements into a single ESM file that imports clean and satisfies the contract', async () => {
    const out = execSync('node scripts/build-module.mjs announcements', { cwd: repoRoot, encoding: 'utf-8' });
    const meta = JSON.parse(out) as { outfile: string; sha256: string; sizeBytes: number };
    const artifact = join(repoRoot, meta.outfile);
    expect(existsSync(artifact)).toBe(true);
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    const mod = (await import(pathToFileURL(artifact).href)).default;
    expect(isCanvasToolchainModule(mod)).toBe(true);
    expect(mod.id).toBe('announcements');
    expect(mod.tools.map((t: { schema: { name: string } }) => t.schema.name))
      .toEqual(['audit_announcements', 'recreate_announcement']);
  }, 60_000);
});
