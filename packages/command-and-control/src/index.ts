#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { downloadCanvasArchive, type DownloadCanvasArchiveInput } from './passthrough/downloader_tools.js';
import {
  bulkFetchPanoptoTranscripts,
  type BulkFetchPanoptoTranscriptsInput,
  type ProgressCallback,
} from './tools/workflows/bulk_fetch_panopto_transcripts.js';
import { checkForUpdates, getUpdateNotice } from './update/check.js';
import { loadModules } from './modules/registry.js';
import { checkChannelNotices, getChannelNotices } from './channel/notices.js';
import { appendNotice } from './lib/append_notice.js';
import { buildRegistry } from './surface/registry.js';
import { adaptModuleTools } from './surface/module_adapter.js';
import { listTools } from './surface/list_tools.js';
import { dispatchSurface } from './surface/dispatch.js';
import type { Operation } from './surface/operation.js';

const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

const server = new Server(
  { name: 'canvas-toolchain', version: pkg.version },
  { capabilities: { tools: {} } }
);

// Load enabled modules (e.g. video) before registering handlers so their tool
// schemas and handlers are available to ListTools/CallTool.
const loadedModules = await loadModules();

// Fire-and-forget background check — never blocks startup.
void checkForUpdates();
void checkChannelNotices();

// ── The operation registry ──────────────────────────────────────────────────
// 86 core operations plus every enabled module's tools. Module operation ids are
// namespaced by the HOST as `<moduleId>.<toolName>`, so a module can never
// collide with a core id.
const registry = buildRegistry();
for (const [id, mod] of loadedModules.byId) {
  try {
    for (const op of adaptModuleTools(id, mod.tools)) registry.set(op.id, op);
  } catch (err) {
    // Fail-soft, exactly as loadModules() is: a malformed module (e.g. duplicate
    // tool names) is skipped with a warning and never stops the host booting.
    console.error(
      `[modules] '${id}' produced an unusable operation set; its tools are not exposed. ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Progress streaming. Two operations emit `notifications/progress`, but
 * `Operation.handler` takes args only. Widening that signature would touch all
 * 86 operations and every consumer of the type, so the two special cases stay
 * here in index.ts: their progress-aware handlers are overlaid onto a per-request
 * COPY of the registry (the shared registry is never mutated). Intent routing,
 * required-field validation, and the single catch boundary still run through
 * dispatchSurface untouched.
 */
function withProgressHandlers(
  reg: Map<string, Operation>,
  notify: ((message: string) => void) | undefined,
): Map<string, Operation> {
  if (!notify) return reg;
  const out = new Map(reg);

  const bulk = out.get('bulk_fetch_panopto_transcripts');
  if (bulk) {
    const onProgress: ProgressCallback = (event) => {
      const icon =
        event.type === 'session-complete' ? '✓'
        : event.type === 'session-failed' ? '✗'
        : '→';
      notify(`[${event.index + 1}/${event.total}] ${icon} ${event.title}${
        event.reason ? ` — ${event.reason}` : ''
      }`);
    };
    out.set(bulk.id, {
      ...bulk,
      handler: (args) => bulkFetchPanoptoTranscripts(args as BulkFetchPanoptoTranscriptsInput, onProgress),
    });
  }

  const archive = out.get('download_canvas_archive');
  if (archive) {
    out.set(archive.id, {
      ...archive,
      handler: (args) => downloadCanvasArchive(args as DownloadCanvasArchiveInput, notify),
    });
  }

  return out;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools(registry),
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  // The progress token is per-request, so the progress-aware overlay is too.
  const progressToken = extra._meta?.progressToken;
  let progressCount = 0;
  const notify = progressToken != null
    ? (message: string) => {
        progressCount++;
        void extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken, progress: progressCount, message },
        });
      }
    : undefined;

  const result = await dispatchSurface(
    withProgressHandlers(registry, notify),
    request.params.name,
    request.params.arguments,
  );
  return appendNotice(result, (getUpdateNotice() ?? '') + (getChannelNotices() ?? ''));
});

// Only boot the MCP server when this file is the process entrypoint.
// Importing the package root must never attach stdio.
// realpath so npm bin shims that pass the node_modules symlink path still match.
function isMainModule(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMainModule()) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
