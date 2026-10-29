import { requireCtx, type ModuleContext } from '@canvas-toolchain/module-contract';

/** Module-scope context, set once by the host through `init`. */
let current: ModuleContext | undefined;

export function setCtx(ctx: ModuleContext): void { current = ctx; }

/** Test seam: forget the host-injected context. */
export function resetCtxForTest(): void { current = undefined; }

/** Throws MODULE_NOT_INITIALIZED when a tool runs before the host calls init. */
export function getCtx(): ModuleContext { return requireCtx(current); }
