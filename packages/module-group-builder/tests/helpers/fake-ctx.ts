import type { ModuleContext, CanvasCredential } from '@canvas-toolchain/module-contract';
import groupBuilderModule from '../../src/index.js';

export function fakeCtx(root: string, canvas: CanvasCredential | null = { host: 'x.instructure.com', token: 'tok' }): ModuleContext {
  const get = async (kind: string): Promise<never> => {
    if (kind === 'canvas' && canvas) return canvas as never;
    throw new Error(`${kind.toUpperCase()}_NOT_CONFIGURED: fake`);
  };
  return {
    moduleId: 'group-builder',
    paths: { config: root, data: root, designStudioData: root, secrets: root },
    credentials: { get, tryGet: async (kind: string) => (kind === 'canvas' ? canvas : null) } as never,
  };
}

/** Hand the module its ctx exactly as the host would (init is synchronous in this module). */
export function initFake(root: string): void {
  void groupBuilderModule.init!(fakeCtx(root));
}
