import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Operation } from './operation.js';
import { INTENT_TOOLS, runIntent } from './intents/index.js';
import { runAdvanced } from './advanced.js';

const TOOL_NAMES = [...Object.keys(INTENT_TOOLS), 'ct_advanced'];

/**
 * Every failure path returns a tool execution error (isError) rather than
 * throwing. MCP 2025-11-25 moved input validation failures to tool execution
 * errors precisely so the model can read the error and self-correct.
 *
 * This is the single catch boundary for the entire surface: runIntent and
 * runAdvanced both `await op.handler(...)` unguarded, so a throwing handler
 * relies on this try/catch to become a model-recoverable isError result
 * instead of a protocol-level failure.
 */
export async function dispatchSurface(
  reg: Map<string, Operation>, name: string, args: unknown,
): Promise<CallToolResult> {
  try {
    if (name === 'ct_advanced') return await runAdvanced(reg, args);
    if (name in INTENT_TOOLS) return await runIntent(reg, name, args);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}`, validTools: TOOL_NAMES }) }],
      isError: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
}
