import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { Operation } from './operation.js';

/**
 * Bridges module-contract 1.x tools onto the operation registry.
 *
 * 1.x modules hand the host finished MCP tools with no section or exposure
 * information, so every one lands in the `modules` section as `advanced`.
 * Plan 2 replaces this with modules declaring their own section and, at most,
 * one promotion. Ids are namespaced by the HOST, never by the module author —
 * that is what structurally prevents the `list_modules` collision class.
 */
export function adaptModuleTools(moduleId: string, tools: ModuleTool[]): Operation[] {
  return tools.map((t) => ({
    id: `${moduleId}.${t.schema.name}`,
    section: 'modules' as const,
    description: t.schema.description ?? `${moduleId} operation.`,
    inputSchema: (t.schema.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
    handler: t.handler,
    taskCategory: 'none' as const,
    exposure: 'advanced' as const,
  }));
}
