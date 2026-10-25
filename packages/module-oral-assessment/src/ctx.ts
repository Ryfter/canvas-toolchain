import { requireCtx, type ModuleContext } from '@canvas-toolchain/module-contract';

let moduleCtx: ModuleContext | undefined;

/** Called by the module's `init`; the host injects the context once. */
export function setModuleCtx(ctx: ModuleContext | undefined): void {
  moduleCtx = ctx;
}

/** Throws MODULE_NOT_INITIALIZED when a tool runs before `init`. */
export function getModuleCtx(): ModuleContext {
  return requireCtx(moduleCtx);
}
