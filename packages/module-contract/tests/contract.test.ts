import { describe, it, expect, expectTypeOf } from 'vitest';
import { isCanvasToolchainModule, requireCtx, type ModuleContext } from '../src/index.js';

const v1 = {
  id: 'video',
  name: 'Lecture Video',
  description: 'd',
  version: '1.0.0',
  tools: [],
};

describe('isCanvasToolchainModule', () => {
  it('accepts a well-formed module', () => {
    expect(isCanvasToolchainModule(v1)).toBe(true);
  });
  it('rejects an object missing tools', () => {
    const m = { id: 'video', name: 'Lecture Video', description: 'd', version: '1.0.0' };
    expect(isCanvasToolchainModule(m)).toBe(false);
  });

  it('accepts a v1 module unchanged when contractVersion is absent', () => {
    expect(isCanvasToolchainModule({ ...v1, handles: ['video'] })).toBe(true);
  });

  it('accepts a v2 module with valid credential declarations', () => {
    expect(
      isCanvasToolchainModule({
        ...v1,
        contractVersion: 2,
        credentials: [
          { kind: 'canvas', required: true, purpose: 'Reads enrollment to form groups.' },
          { kind: 'anthropic', required: false, purpose: 'Normalizes majors when a key is present.' },
        ],
      }),
    ).toBe(true);
  });

  it('accepts a v2 module that declares no credentials', () => {
    expect(isCanvasToolchainModule({ ...v1, contractVersion: 2, credentials: [] })).toBe(true);
  });

  it('rejects a contractVersion other than 2', () => {
    expect(isCanvasToolchainModule({ ...v1, contractVersion: 1 })).toBe(false);
    expect(isCanvasToolchainModule({ ...v1, contractVersion: 3 })).toBe(false);
  });

  it('rejects an unknown credential kind', () => {
    expect(
      isCanvasToolchainModule({
        ...v1,
        contractVersion: 2,
        credentials: [{ kind: 'openai', required: true, purpose: 'Calls a model.' }],
      }),
    ).toBe(false);
  });

  it('rejects duplicate credential kinds', () => {
    expect(
      isCanvasToolchainModule({
        ...v1,
        contractVersion: 2,
        credentials: [
          { kind: 'canvas', required: true, purpose: 'Reads the roster.' },
          { kind: 'canvas', required: false, purpose: 'Reads grades.' },
        ],
      }),
    ).toBe(false);
  });

  it('rejects a declaration whose required flag is not a boolean', () => {
    expect(
      isCanvasToolchainModule({
        ...v1,
        contractVersion: 2,
        credentials: [{ kind: 'canvas', required: 'yes', purpose: 'Reads the roster.' }],
      }),
    ).toBe(false);
  });

  it('rejects an empty purpose', () => {
    expect(
      isCanvasToolchainModule({
        ...v1,
        contractVersion: 2,
        credentials: [{ kind: 'panopto', required: true, purpose: '   ' }],
      }),
    ).toBe(false);
  });

  it('rejects credentials that are not a declaration list', () => {
    expect(
      isCanvasToolchainModule({
        ...v1,
        contractVersion: 2,
        credentials: { kind: 'canvas', required: true, purpose: 'Reads the roster.' },
      }),
    ).toBe(false);
  });
});

describe('requireCtx', () => {
  const ctx = {
    moduleId: 'group-builder',
    paths: { config: '/cfg', data: '/data', designStudioData: '/cds', secrets: '/sec' },
    credentials: {
      get: async () => ({ host: 'school.instructure.com', token: 't' }),
      tryGet: async () => null,
    },
  } as ModuleContext;

  it('throws MODULE_NOT_INITIALIZED before init', () => {
    expect(() => requireCtx(undefined)).toThrow('MODULE_NOT_INITIALIZED');
  });

  it('exposes the secrets root alongside the other paths', () => {
    expectTypeOf(ctx.paths).toEqualTypeOf<{
      config: string;
      data: string;
      designStudioData: string;
      secrets: string;
    }>();
    expect(requireCtx(ctx).paths.secrets).toBe('/sec');
  });

  it('keeps the thrown message free of any context values', () => {
    try {
      requireCtx(undefined);
      expect.unreachable();
    } catch (e) {
      const err = e as Error;
      expect(err.name).toBe('MODULE_NOT_INITIALIZED');
      expect(err.message).toBe('MODULE_NOT_INITIALIZED: the host has not called init');
    }
  });

  it('returns the context after init', () => {
    expect(requireCtx(ctx)).toBe(ctx);
  });
});
