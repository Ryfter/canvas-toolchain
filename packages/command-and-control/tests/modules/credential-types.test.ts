import { describe, it, expect, expectTypeOf } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as Contract from '@canvas-toolchain/module-contract';
import type * as Shared from '@canvas-toolchain/shared-types';

const here = dirname(fileURLToPath(import.meta.url));

describe('contract credential types match shared-types (spec 4.3)', () => {
  it('are equal types (documentation; enforced by the tsc run below)', () => {
    expectTypeOf<Contract.CanvasCredential>().toEqualTypeOf<Shared.CanvasCredential>();
    expectTypeOf<Contract.AnthropicCredential>().toEqualTypeOf<Shared.AnthropicCredential>();
    expectTypeOf<Contract.PanoptoCredential>().toEqualTypeOf<Shared.PanoptoCredential>();
    expectTypeOf<Contract.CredentialKind>().toEqualTypeOf<Shared.CredentialKind>();
  });

  it('the mutual-assignability assertions type-check under the repo compiler settings', () => {
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    const file = join(here, 'types', 'credential-types.check.ts');
    let output = '';
    try {
      execFileSync(process.execPath, [
        tsc, '--noEmit', '--strict', '--skipLibCheck',
        '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
        file,
      ], { encoding: 'utf-8', stdio: 'pipe' });
    } catch (err) {
      output = String((err as { stdout?: string }).stdout ?? err);
    }
    expect(output).toBe('');
  }, 60_000);
});
