import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Append an update/channel notice as an extra content block on any CallTool
 * result. Empty notice is a no-op (same object). Applied uniformly — success,
 * isError, and module-tool results all carry the notice when one is present.
 */
export function appendNotice(result: CallToolResult, notice: string): CallToolResult {
  if (!notice) return result;
  return { ...result, content: [...result.content, { type: 'text' as const, text: notice }] };
}
