import type { ModuleContext, CanvasCredential } from '@canvas-toolchain/module-contract';

export function fakeCtx(root: string, canvas: CanvasCredential | null = { host: 'example.instructure.com', token: 'test-token' }): ModuleContext {
  const get = async (kind: string): Promise<never> => {
    if (kind === 'canvas' && canvas) return canvas as never;
    throw new Error(`${kind.toUpperCase()}_NOT_CONFIGURED: fake`);
  };
  return {
    moduleId: 'announcements',
    paths: { config: root, data: root, designStudioData: root, secrets: root },
    credentials: { get, tryGet: async (kind: string) => (kind === 'canvas' ? canvas : null) } as never,
  };
}
