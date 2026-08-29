import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Operation } from './operation.js';
import { intentToolSchemas } from './intents/index.js';
import { advancedToolSchema } from './advanced.js';

/**
 * The exposed surface is always nine intent tools plus ct_advanced —
 * regardless of how many operations or modules are registered. That fixed
 * ceiling is the point of the design.
 */
export function listTools(reg: Map<string, Operation>): Tool[] {
  return [...intentToolSchemas(reg), advancedToolSchema(reg)];
}
