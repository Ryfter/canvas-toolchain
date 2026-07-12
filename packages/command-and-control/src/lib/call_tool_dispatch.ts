import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Dependencies for dispatchCallTool — index.ts wires the real ones; tests inject fakes (#123). */
export interface CallToolDispatchDeps {
  /** Module-provided tools; they take precedence and return a full CallToolResult. */
  moduleHandlers: Map<string, (args: unknown) => Promise<CallToolResult>>;
  /** The core tool switch (index.ts). `handled: false` means the name is unknown there. */
  runCoreTool: (name: string, args: unknown) => Promise<{ handled: boolean; result?: unknown }>;
  /** Combined update + channel notice text ('' when none). Appended to core results only —
   *  module handlers own their full CallToolResult. */
  getNotice: () => string;
}

/**
 * The CallTool handler body, extracted so the module-tool error net and the
 * notice-append behavior are unit-testable without connecting a stdio transport (#123).
 *
 * Invariants:
 * - A throwing module tool degrades to a structured `{ error }` + isError, never a raw protocol error.
 * - A throwing core tool degrades the same way.
 * - Unknown tool names return a structured error, without the notice.
 */
export async function dispatchCallTool(
  name: string,
  args: unknown,
  deps: CallToolDispatchDeps,
): Promise<CallToolResult> {
  const moduleHandler = deps.moduleHandlers.get(name);
  if (moduleHandler) {
    try {
      return await moduleHandler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
    }
  }

  try {
    const { handled, result } = await deps.runCoreTool(name, args);
    if (!handled) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }], isError: true };
    }
    const text = JSON.stringify(result, null, 2) + deps.getNotice();
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
}
